import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const shop = url.searchParams.get("shop");
    const state = url.searchParams.get("state") || "";

    if (!code || !shop) {
      throw new Error("Missing code or shop parameter from Shopify");
    }

    const domain = shop.replace(/^https?:\/\//, "").replace(/\/$/, "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Find the connection by store domain
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

    // Return an HTML page that posts a message to the opener and closes itself
    const origin = decodeURIComponent(state);
    const html = `<!DOCTYPE html>
<html><head><title>Shopify Connected</title></head>
<body>
<h2>Shopify connected successfully!</h2>
<p>This window will close automatically.</p>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: "shopify-oauth-success" }, "${origin || "*"}");
    setTimeout(() => window.close(), 1500);
  } else {
    window.location.href = "${origin || "/"}?shopify_oauth=success";
  }
</script>
</body></html>`;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (e) {
    console.error("shopify-oauth-callback error:", e);
    const errorMsg = e instanceof Error ? e.message : "Unknown error";
    const html = `<!DOCTYPE html>
<html><head><title>Shopify Error</title></head>
<body>
<h2>Connection failed</h2>
<p>${errorMsg}</p>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: "shopify-oauth-error", error: "${errorMsg.replace(/"/g, '\\"')}" }, "*");
    setTimeout(() => window.close(), 3000);
  }
</script>
</body></html>`;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
});
