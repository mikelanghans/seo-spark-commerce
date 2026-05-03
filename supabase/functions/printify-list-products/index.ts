import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const { organizationId } = await req.json();

    // Get Printify token
    let printifyToken = Deno.env.get("PRINTIFY_API_TOKEN");
    if (organizationId) {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: roleData } = await adminClient.rpc("get_org_role", {
        _user_id: user.id,
        _org_id: organizationId,
      });
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: secrets } = await adminClient
        .from("organization_secrets")
        .select("printify_api_token")
        .eq("organization_id", organizationId)
        .single();
      if (secrets?.printify_api_token) {
        printifyToken = secrets.printify_api_token;
      }
    }

    if (!printifyToken) throw new Error("No Printify API token configured");

    // Get shops first
    const shopsRes = await fetch("https://api.printify.com/v1/shops.json", {
      headers: { Authorization: `Bearer ${printifyToken}` },
    });
    if (!shopsRes.ok) {
      throw new Error(`Failed to fetch shops: ${shopsRes.status}`);
    }
    const shops = await shopsRes.json();
    if (!shops.length) throw new Error("No Printify shops found");

    // Fetch products from all shops (usually just one)
    const allProducts: { id: string; title: string; shopId: number }[] = [];

    for (const shop of shops) {
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const res = await fetch(
          `https://api.printify.com/v1/shops/${shop.id}/products.json?page=${page}`,
          { headers: { Authorization: `Bearer ${printifyToken}` } },
        );

        if (!res.ok) {
          const errorText = await res.text();
          console.error(
            `Failed to fetch products from shop ${shop.id}: ${res.status} ${errorText}`,
          );
          break;
        }

        const data = await res.json();
        const products = Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
          ? data
          : [];

        for (const p of products) {
          allProducts.push({ id: p.id, title: p.title, shopId: shop.id });
        }

        const currentPage = Number(data?.current_page ?? page);
        const lastPage = Number(data?.last_page ?? currentPage);
        hasMore = currentPage < lastPage && products.length > 0;
        page++;
      }
    }

    console.log(
      `Fetched ${allProducts.length} Printify products from ${shops.length} shop(s)`,
    );

    return new Response(JSON.stringify({ products: allProducts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("printify-list-products error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
