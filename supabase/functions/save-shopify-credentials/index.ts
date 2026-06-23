import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encrypt } from "../_shared/encryption.ts";

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
    const encryptionKey = Deno.env.get("ENCRYPTION_KEY")!;

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
        .select("id, store_domain, access_token, client_id, client_secret, shipping_profile_id")
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
          has_credentials: !!conn.store_domain,
          client_id: conn.client_id,
          shipping_profile_id: conn.shipping_profile_id || null,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === SET_SHIPPING_PROFILE action: update only shipping_profile_id ===
    if (action === "set_shipping_profile") {
      const shippingProfileId = typeof body.shippingProfileId === "string" ? body.shippingProfileId : null;
      let q = adminClient.from("shopify_connections").select("id").eq("user_id", user.id);
      if (organizationId) q = q.eq("organization_id", organizationId);
      const { data: existingConn } = await q.maybeSingle();
      if (!existingConn) throw new Error("No Shopify connection found");
      const { error } = await adminClient
        .from("shopify_connections")
        .update({ shipping_profile_id: shippingProfileId })
        .eq("id", existingConn.id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === SAVE action (default): upsert credentials ===
    // Client ID/Secret are now optional here: if the app is running in "single
    // global Shopify app" mode (VITE_SHOPIFY_CLIENT_ID set on the frontend,
    // SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET set as edge function secrets),
    // the frontend won't send these at all and the OAuth functions fall back
    // to the env vars. Per-user custom-app credentials still work exactly as
    // before when provided — this just stops requiring them unconditionally.
    if (!storeDomain.trim()) {
      throw new Error("Store domain is required");
    }

    const domain = storeDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");

    // Check for existing connection
    let query = adminClient
      .from("shopify_connections")
      .select("id, client_secret")
      .eq("user_id", user.id);
    if (organizationId) query = query.eq("organization_id", organizationId);
    const { data: existing } = await query.maybeSingle();

    // A blank Client Secret is fine when resubmitting an already-connected
    // account (e.g. just changing the store domain) — the existing one stays
    // untouched below. It's only a problem on a true first-time save.
    const hasExistingSecret = !!existing?.client_secret;
    if (clientId.trim() && !clientSecret.trim() && !hasExistingSecret) {
      throw new Error("Client Secret is required the first time you connect this app");
    }
    if (!clientId.trim() && clientSecret.trim()) {
      throw new Error("Client ID is required when providing a Client Secret");
    }

    const encryptedSecret = clientSecret.trim() ? await encrypt(clientSecret, encryptionKey) : "";

    if (existing) {
      const updatePayload: Record<string, unknown> = {
        store_domain: domain,
        client_id: clientId.trim() || null,
      };
      // Only touch client_secret if a new value was actually provided —
      // an intentionally blank field (resubmitting to change just the
      // domain, say) should leave the already-saved secret untouched,
      // not wipe it out.
      if (encryptedSecret) {
        updatePayload.client_secret = encryptedSecret;
      }
      const { error } = await adminClient
        .from("shopify_connections")
        .update(updatePayload)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await adminClient
        .from("shopify_connections")
        .insert({
          user_id: user.id,
          store_domain: domain,
          organization_id: organizationId || null,
          client_id: clientId.trim() || null,
          client_secret: encryptedSecret || null,
        });
      if (error) throw error;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("save-shopify-credentials error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
