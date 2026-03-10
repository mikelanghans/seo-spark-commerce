import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_BLUEPRINT_ID = 706;

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

    const printifyToken = Deno.env.get("PRINTIFY_API_TOKEN");
    if (!printifyToken) throw new Error("Printify API token not configured");

    const { blueprintId } = await req.json();
    const bpId = blueprintId || DEFAULT_BLUEPRINT_ID;

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

    // Parse printing specs for print area dimensions
    let printAreaSpecs: any = null;
    if (printingRes.ok) {
      const printingData = await printingRes.json();
      console.log(`Printing data: ${JSON.stringify(printingData).substring(0, 500)}`);
      // Find "front" placeholder
      const placeholders = printingData.placeholders || [];
      const frontPlaceholder = placeholders.find((p: any) => p.position === "front") || placeholders[0];
      if (frontPlaceholder) {
        printAreaSpecs = {
          position: frontPlaceholder.position,
          width: frontPlaceholder.width,
          height: frontPlaceholder.height,
        };
      }
    }

    // Extract unique colors and sizes
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

    return new Response(JSON.stringify({ colors, sizes, printProviderId: ppId, printAreaSpecs }), {
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
