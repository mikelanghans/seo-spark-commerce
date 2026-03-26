import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const shop = url.searchParams.get("shop");
    const stateRaw = url.searchParams.get("state") || "";

    if (!code || !shop) {
      throw new Error("Missing code or shop parameter from Shopify");
    }

    const domain = shop.replace(/^https?:\/\//, "").replace(/\/$/, "");

    // Parse state - supports both legacy (plain origin string) and new JSON format
    let origin = "";
    let organizationId: string | null = null;
    try {
      const decoded = decodeURIComponent(stateRaw);
      const parsed = JSON.parse(decoded);
      origin = parsed.origin || "";
      organizationId = parsed.organizationId || null;
    } catch {
      // Legacy format: state is just the origin string
      origin = decodeURIComponent(stateRaw);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Find the connection by store domain + organization_id for precision
    let query = adminClient
      .from("shopify_connections")
      .select("id, user_id, client_id, client_secret")
      .eq("store_domain", domain);

    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }

    const { data: connection, error: connError } = await query.maybeSingle();

    if (connError || !connection) {
      throw new Error("No matching Shopify connection found for this store domain.");
    }

    // Use per-org credentials from the connection row, fall back to env vars for legacy
    const clientId = connection.client_id || Deno.env.get("SHOPIFY_CLIENT_ID")!;
    const clientSecret = connection.client_secret || Deno.env.get("SHOPIFY_CLIENT_SECRET")!;

    if (!clientId || !clientSecret) {
      throw new Error("No Shopify app credentials configured for this brand. Please add your Client ID and Client Secret in Shopify settings.");
    }

    // Exchange the authorization code for an access token
    const tokenResponse = await fetch(`https://${domain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
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

    // Return a silent HTML page that posts to opener and closes/redirects immediately
    const targetOrigin = (origin || "*").replace(/"/g, "");
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Connecting...</title>
  <script>
    (function () {
      if (window.opener) {
        window.opener.postMessage({ type: "shopify-oauth-success" }, "${targetOrigin}");
        window.close();
      } else {
        window.location.replace("${origin || "/"}?shopify_oauth=success");
      }
    })();
  </script>
</head>
<body></body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (e) {
    console.error("shopify-oauth-callback error:", e);
    const errorMsg = e instanceof Error ? e.message : "Unknown error";
    const safeError = errorMsg.replace(/"/g, "\\\"").replace(/\n/g, " ");
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Connection Error</title>
  <script>
    (function () {
      if (window.opener) {
        window.opener.postMessage({ type: "shopify-oauth-error", error: "${safeError}" }, "*");
        window.close();
      } else {
        window.location.replace("/?shopify_oauth=error&error=${encodeURIComponent(errorMsg)}");
      }
    })();
  </script>
</head>
<body></body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
});
