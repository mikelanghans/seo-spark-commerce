import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const shop = url.searchParams.get("shop");

    if (!code || !shop) {
      throw new Error("Missing code or shop parameter from Shopify");
    }

    const domain = shop.replace(/^https?:\/\//, "").replace(/\/$/, "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Find the connection by store domain to get client credentials
    const { data: connection, error: connError } = await adminClient
      .from("shopify_connections")
      .select("id, client_id, client_secret, user_id")
      .eq("store_domain", domain)
      .single();

    if (connError || !connection?.client_id || !connection?.client_secret) {
      throw new Error("No matching Shopify connection found for this store domain.");
    }

    // Exchange the authorization code for an access token
    const tokenResponse = await fetch(`https://${domain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: connection.client_id,
        client_secret: connection.client_secret,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Shopify OAuth error:", tokenResponse.status, errorText);
      throw new Error(`Shopify OAuth error (${tokenResponse.status}): ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      throw new Error("No access token received from Shopify");
    }

    // Update the connection with the access token
    const { error: updateError } = await adminClient
      .from("shopify_connections")
      .update({ access_token: accessToken })
      .eq("id", connection.id);

    if (updateError) throw updateError;

    // Redirect back to the app with success
    const appUrl = url.searchParams.get("state") || "https://id-preview--eb06a1c3-53d9-4b7e-8736-6817bf737974.lovable.app";
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${appUrl}?shopify_oauth=success`,
      },
    });
  } catch (e) {
    console.error("shopify-oauth-callback error:", e);
    const errorMsg = encodeURIComponent(e instanceof Error ? e.message : "Unknown error");
    return new Response(null, {
      status: 302,
      headers: {
        Location: `https://id-preview--eb06a1c3-53d9-4b7e-8736-6817bf737974.lovable.app?shopify_oauth=error&error=${errorMsg}`,
      },
    });
  }
});
