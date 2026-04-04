import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_BLUEPRINT_ID = 706;

async function fetchWithRetry(url: string, headers: Record<string, string>, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status !== 429 || attempt === maxRetries) return res;
    const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 8000);
    console.log(`Rate limited (429) on ${url}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`);
    await res.text(); // consume body
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error("Unreachable");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const { blueprintId, organizationId, shopId, printifyProductId } = await req.json();
    let productBlueprintId: number | null = null;
    let enabledSizes: string[] = [];

    // Try org-level token first, then fall back to env var
    let printifyToken = Deno.env.get("PRINTIFY_API_TOKEN");
    if (organizationId) {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: secrets } = await adminClient
        .from("organization_secrets")
        .select("printify_api_token")
        .eq("organization_id", organizationId)
        .single();
      if (secrets?.printify_api_token) printifyToken = secrets.printify_api_token;
    }

    if (!printifyToken) {
      return new Response(JSON.stringify({ error: "Printify API token not configured. Add your token in Settings → Marketplace." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (printifyProductId && shopId) {
      const productRes = await fetch(
        `https://api.printify.com/v1/shops/${shopId}/products/${printifyProductId}.json`,
        { headers: { Authorization: `Bearer ${printifyToken}` } }
      );
      if (productRes.ok) {
        const product = await productRes.json();
        productBlueprintId = product?.blueprint_id ?? null;
        enabledSizes = Array.from(new Set(
          (product?.variants || [])
            .filter((variant: any) => variant?.is_enabled)
            .map((variant: any) => (variant?.options?.size || "").trim())
            .filter(Boolean)
        ));
      }
    }

    const bpId = productBlueprintId || blueprintId || DEFAULT_BLUEPRINT_ID;

    // Get print providers
    const providersRes = await fetch(
      `https://api.printify.com/v1/catalog/blueprints/${bpId}/print_providers.json`,
      { headers: { Authorization: `Bearer ${printifyToken}` } }
    );
    if (!providersRes.ok) throw new Error(`Failed to get providers (${providersRes.status})`);
    const providers = await providersRes.json();
    const ppId = providers.find((p: any) => p.id === 99)?.id || providers[0]?.id;
    if (!ppId) throw new Error("No print providers found");

    // Get variants and printing specs in parallel
    const [variantsRes, printingRes] = await Promise.all([
      fetch(
        `https://api.printify.com/v1/catalog/blueprints/${bpId}/print_providers/${ppId}/variants.json`,
        { headers: { Authorization: `Bearer ${printifyToken}` } }
      ),
      fetch(
        `https://api.printify.com/v1/catalog/blueprints/${bpId}/print_providers/${ppId}/printing.json`,
        { headers: { Authorization: `Bearer ${printifyToken}` } }
      ),
    ]);

    if (!variantsRes.ok) throw new Error(`Failed to get variants (${variantsRes.status})`);
    const variantsData = await variantsRes.json();
    const allVariants = variantsData.variants || [];

    let printAreaSpecs: any = null;
    if (printingRes.ok) {
      const printingData = await printingRes.json();
      console.log(`Printing data: ${JSON.stringify(printingData).substring(0, 500)}`);

      const directPlaceholders = Array.isArray(printingData.placeholders) ? printingData.placeholders : [];
      const variantPrintAreas = Array.isArray(printingData.variant_print_areas) ? printingData.variant_print_areas : [];
      const variantPlaceholders = variantPrintAreas.flatMap((area: any) =>
        Array.isArray(area?.placeholders) ? area.placeholders : []
      );

      const allPlaceholders = [...directPlaceholders, ...variantPlaceholders];
      const frontPlaceholder = allPlaceholders.find((p: any) => p?.position === "front") || allPlaceholders[0];

      if (frontPlaceholder) {
        printAreaSpecs = {
          position: frontPlaceholder.position || "front",
          width: Number(frontPlaceholder.width ?? frontPlaceholder.print_area_width ?? frontPlaceholder.area_width ?? 0),
          height: Number(frontPlaceholder.height ?? frontPlaceholder.print_area_height ?? frontPlaceholder.area_height ?? 0),
        };
      }
    }

    const colorsSet = new Map<string, number>();
    const sizesSet = new Set<string>();
    for (const v of allVariants) {
      const color = v.options?.color;
      const size = v.options?.size;
      if (color && !colorsSet.has(color)) colorsSet.set(color, v.id);
      if (size) sizesSet.add(size);
    }

    const colors = Array.from(colorsSet.keys()).sort();
    const sizes = Array.from(sizesSet);

    console.log(`Blueprint ${bpId}, provider ${ppId}: ${colors.length} colors, ${sizes.length} sizes, printArea: ${JSON.stringify(printAreaSpecs)}`);

    return new Response(JSON.stringify({ colors, sizes, printProviderId: ppId, printAreaSpecs, blueprintId: bpId, enabledSizes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("printify-get-variants error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
