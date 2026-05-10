import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { organizationId } = (await req.json().catch(() => ({}))) as { organizationId?: string };

    let connection: { store_domain: string; access_token: string } | null = null;
    if (organizationId) {
      const { data: roleData } = await adminClient.rpc("get_org_role", { _user_id: user.id, _org_id: organizationId });
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data } = await adminClient.from("shopify_connections").select("store_domain, access_token").eq("organization_id", organizationId).maybeSingle();
      connection = data;
    }
    if (!connection) {
      const { data } = await adminClient.from("shopify_connections").select("store_domain, access_token").eq("user_id", user.id).maybeSingle();
      connection = data;
    }
    if (!connection?.access_token) {
      return new Response(JSON.stringify({ error: "No Shopify connection found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const domain = connection.store_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

    const query = `{
      deliveryProfiles(first: 50) {
        edges { node { id name default } }
      }
    }`;

    const res = await fetch(`https://${domain}/admin/api/2024-01/graphql.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": connection.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    const json = await res.json();
    if (!res.ok || json.errors) {
      console.error("Shopify GraphQL error:", JSON.stringify(json));
      const msg = json.errors?.[0]?.message || `Shopify error ${res.status}`;
      const isScopeIssue = /access denied|deliveryProfiles/i.test(msg);
      throw new Error(isScopeIssue
        ? "Shopify is missing the 'read_shipping' permission. Please disconnect and reconnect your Shopify store in Settings to grant the new scope."
        : msg);
    }

    const profiles = (json?.data?.deliveryProfiles?.edges || []).map((e: any) => ({
      id: e.node.id,
      name: e.node.name,
      default: !!e.node.default,
    }));

    return new Response(JSON.stringify({ profiles }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fetch-shopify-shipping-profiles error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
