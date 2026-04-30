import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) throw new Error("Unauthorized");
    const userId = user.id;

    const { code, redirectUri, environment } = await req.json();
    if (!code || !redirectUri) throw new Error("code and redirectUri are required");

    // Read user's own credentials from the database
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: conn } = await adminClient
      .from("ebay_connections")
      .select("id, client_id, client_secret, environment")
      .eq("user_id", userId)
      .maybeSingle();

    const clientId = String(conn?.client_id || "").trim();
    const clientSecret = String(conn?.client_secret || "").trim();

    if (!conn || !clientId || !clientSecret) {
      throw new Error("No eBay credentials found. Please save your Client ID and Secret first.");
    }

    const isSandbox = (environment || conn.environment) === "sandbox";
    const tokenUrl = isSandbox
      ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
      : "https://api.ebay.com/identity/v1/oauth2/token";

    // Exchange authorization code for tokens using user's own credentials
    const creds = btoa(`${clientId}:${clientSecret}`);
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("eBay token exchange error:", errText);
      if (errText.includes("invalid_client")) {
        const validationRes = await fetch(tokenUrl, {
          method: "POST",
          headers: {
            Authorization: `Basic ${creds}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            scope: "https://api.ebay.com/oauth/api_scope",
          }).toString(),
        });
        await validationRes.text();

        if (validationRes.ok) {
          throw new Error("The saved eBay App ID and Cert ID are valid, but eBay rejected this authorization code. Start authorization from Brand Aura again and use the matching Production RuName OAuth consent link, not the Developer Portal token button.");
        }

        throw new Error("eBay rejected the App ID or Cert ID. Re-paste the Production App ID and Production Cert ID from the same eBay keyset, then authorize again.");
      }
      throw new Error(`eBay token exchange failed (${tokenRes.status})`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 7200;

    if (!accessToken) throw new Error("No access token received from eBay");

    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Update the existing connection with tokens
    await adminClient
      .from("ebay_connections")
      .update({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: tokenExpiresAt,
        environment: environment || conn.environment,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conn.id);

    return new Response(JSON.stringify({ success: true, environment: environment || conn.environment }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ebay-exchange-token error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
