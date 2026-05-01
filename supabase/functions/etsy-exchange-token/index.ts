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

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) throw new Error("Unauthorized");
    const userId = claims.claims.sub as string;

    const { code, codeVerifier, redirectUri } = await req.json();
    if (!code || !codeVerifier || !redirectUri) {
      throw new Error("code, codeVerifier, and redirectUri are required");
    }

    // Look up the user's saved Etsy app credentials (client_id is the Etsy keystring).
    // Use service role to read because client_secret is REVOKEd from authenticated.
    const adminLookup = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: existingConn } = await adminLookup
      .from("etsy_connections")
      .select("id, client_id")
      .eq("user_id", userId)
      .maybeSingle();

    const clientId = existingConn?.client_id || Deno.env.get("ETSY_CLIENT_ID");
    if (!clientId) throw new Error("Etsy Client ID (Keystring) not set. Save your app credentials first.");

    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://api.etsy.com/v3/public/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: redirectUri,
        code,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Etsy token exchange error:", errText);
      throw new Error(`Etsy token exchange failed (${tokenRes.status}): ${errText}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 3600;

    if (!accessToken) throw new Error("No access token received from Etsy");

    // Get shop info using the new token
    const shopRes = await fetch("https://openapi.etsy.com/v3/application/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-api-key": clientId,
      },
    });

    let shopId = "";
    let shopName = "";

    if (shopRes.ok) {
      const userData = await shopRes.json();
      shopId = String(userData.shop_id || "");
      shopName = userData.shop_name || userData.login_name || "";
    }

    // Store connection using service role for reliability
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Upsert: update if exists, insert if not
    const { data: existing } = await adminClient
      .from("etsy_connections")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      await adminClient
        .from("etsy_connections")
        .update({
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expires_at: tokenExpiresAt,
          api_key: clientId,
          shop_id: shopId,
          shop_name: shopName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await adminClient
        .from("etsy_connections")
        .insert({
          user_id: userId,
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expires_at: tokenExpiresAt,
          api_key: clientId,
          shop_id: shopId || "pending",
          shop_name: shopName || "My Etsy Shop",
        });
    }

    return new Response(JSON.stringify({ success: true, shopName: shopName || shopId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("etsy-exchange-token error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
