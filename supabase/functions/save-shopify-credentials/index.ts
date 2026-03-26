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

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const action = typeof body.action === "string" ? body.action.toLowerCase() : "";
    const clientId = typeof body.clientId === "string"
      ? body.clientId
      : typeof body.client_id === "string"
        ? body.client_id
        : "";
    const clientSecret = typeof body.clientSecret === "string"
      ? body.clientSecret
      : typeof body.client_secret === "string"
        ? body.client_secret
        : "";
    const storeDomain = typeof body.storeDomain === "string"
      ? body.storeDomain
      : typeof body.store_domain === "string"
        ? body.store_domain
        : "";
    const organizationId = typeof body.organizationId === "string"
      ? body.organizationId
      : typeof body.organization_id === "string"
        ? body.organization_id
        : null;

    const inferredCheck = action === "check" || (!action && !clientId && !clientSecret && !storeDomain);

    console.log("save-shopify-credentials request", {
      action: inferredCheck ? "check" : action || "save",
      organizationIdPresent: !!organizationId,
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasStoreDomain: !!storeDomain,
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // === CHECK action: return connection status without exposing secrets ===
    if (inferredCheck) {
      let query = adminClient
        .from("shopify_connections")
        .select("id, store_domain, access_token, client_id, client_secret")
        .eq("user_id", user.id);
      if (organizationId) query = query.eq("organization_id", organizationId);
      const { data: conn } = await query.maybeSingle();

      if (!conn) {
        return new Response(JSON.stringify({ connection: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        connection: {
          id: conn.id,
          store_domain: conn.store_domain,
          has_token: !!(conn.access_token && conn.access_token.length > 0),
          has_credentials: !!(conn.client_id && conn.client_secret),
          client_id: conn.client_id,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === SAVE action (default): upsert credentials ===
    if (!clientId.trim() || !clientSecret.trim()) {
      throw new Error("Client ID and Client Secret are required");
    }
    if (!storeDomain.trim()) {
      throw new Error("Store domain is required");
    }

    const domain = storeDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");

    // Check for existing connection
    let query = adminClient
      .from("shopify_connections")
      .select("id")
      .eq("user_id", user.id);
    if (organizationId) query = query.eq("organization_id", organizationId);
    const { data: existing } = await query.maybeSingle();

    if (existing) {
      const { error } = await adminClient
        .from("shopify_connections")
        .update({
          store_domain: domain,
          client_id: clientId,
          client_secret: clientSecret,
        })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await adminClient
        .from("shopify_connections")
        .insert({
          user_id: user.id,
          store_domain: domain,
          organization_id: organizationId || null,
          client_id: clientId,
          client_secret: clientSecret,
        });
      if (error) throw error;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("save-shopify-credentials error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
