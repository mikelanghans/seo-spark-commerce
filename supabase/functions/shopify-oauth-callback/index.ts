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

    // Best-effort parse of origin from state, so fallback redirect lands back in app.
    const fallbackUrl = new URL(req.url);
    const stateRaw = fallbackUrl.searchParams.get("state") || "";
    let origin = "";
    try {
      const decoded = decodeURIComponent(stateRaw);
      const parsed = JSON.parse(decoded);
      origin = parsed.origin || "";
    } catch {
      try {
        origin = decodeURIComponent(stateRaw);
      } catch {
        origin = "";
      }
    }

    const redirectTarget = origin
      ? `${origin}?shopify_oauth=error&error=${encodeURIComponent(errorMsg)}`
      : `/?shopify_oauth=error&error=${encodeURIComponent(errorMsg)}`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Connection Error</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #1f2937;
      background: #fff;
      line-height: 1.5;
    }
    .card {
      max-width: 560px;
      margin: 0 auto;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 16px;
    }
    h1 { margin: 0 0 8px; font-size: 18px; }
    p { margin: 0 0 10px; }
    code {
      display: block;
      white-space: pre-wrap;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px;
      margin-top: 8px;
      font-size: 12px;
    }
    .actions {
      margin-top: 14px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    button {
      border: 1px solid #d1d5db;
      border-radius: 8px;
      background: #fff;
      color: #111827;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 14px;
    }
    button.primary {
      background: #111827;
      color: #fff;
      border-color: #111827;
    }
  </style>
  <script>
    (function () {
      var hadOpener = !!window.opener;
      if (hadOpener) {
        try {
          window.opener.postMessage({ type: "shopify-oauth-error", error: "${safeError}" }, "*");
        } catch (err) {
          // no-op: opener messaging can be blocked by browser COOP policies
        }
      }

      window.__redirectToApp = function () {
        window.location.replace("${redirectTarget}");
      };

      window.__closePopup = function () {
        window.close();
      };

      // If there's no opener, redirect back to app immediately so the user sees the error there.
      if (!hadOpener) {
        window.__redirectToApp();
      }
    })();
  </script>
</head>
<body>
  <div class="card">
    <h1>Shopify authorization failed</h1>
    <p>We couldn't complete the connection. Please return to the app and try again.</p>
    <code>${safeError}</code>
    <div class="actions">
      <button class="primary" onclick="window.__redirectToApp()">Return to app</button>
      <button onclick="window.__closePopup()">Close window</button>
    </div>
  </div>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
});
