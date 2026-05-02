import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function isAllowedOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname;
    if (host === "brandaura.syncopateddynamics.com") return true;
    if (host === "seo-spark-commerce.lovable.app") return true;
    if (host.endsWith(".lovable.app")) return true;
    if (host.endsWith(".lovableproject.com")) return true;
    if (host === "localhost" || host === "127.0.0.1") return true;
    return false;
  } catch {
    return false;
  }
}

function sanitizeOrigin(value: string): string {
  if (!value) return "";
  try {
    const u = new URL(value);
    return isAllowedOrigin(u.origin) ? u.origin : "";
  } catch {
    return "";
  }
}

function sanitizeReturnTo(value: string): string {
  if (!value) return "";
  try {
    const u = new URL(value);
    return isAllowedOrigin(u.origin) ? u.toString() : "";
  } catch {
    return "";
  }
}

function htmlEncode(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const parseOauthState = (stateRaw: string | null) => {
  let origin = "";
  let returnTo = "";
  let organizationId: string | null = null;

  if (!stateRaw) return { origin, returnTo, organizationId };

  const candidates = [stateRaw];
  try {
    candidates.push(decodeURIComponent(stateRaw));
  } catch {
    // no-op
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      origin = typeof parsed.origin === "string" ? parsed.origin : origin;
      returnTo = typeof parsed.returnTo === "string" ? parsed.returnTo : returnTo;
      organizationId = typeof parsed.organizationId === "string" ? parsed.organizationId : organizationId;
      break;
    } catch {
      if (!origin && /^https?:\/\//i.test(candidate)) {
        origin = candidate;
      }
    }
  }

  if (!origin && returnTo) {
    try {
      origin = new URL(returnTo).origin;
    } catch {
      // no-op
    }
  }

  return { origin, returnTo, organizationId };
};

const buildAppRedirectUrl = (base: string, status: "success" | "error", errorMessage?: string) => {
  const fallbackBase = base || "/";

  try {
    const url = new URL(fallbackBase);
    url.searchParams.set("shopify_oauth", status);
    if (status === "error" && errorMessage) {
      url.searchParams.set("error", errorMessage);
    } else {
      url.searchParams.delete("error");
    }
    return url.toString();
  } catch {
    const sep = fallbackBase.includes("?") ? "&" : "?";
    const errorPart = status === "error" && errorMessage
      ? `&error=${encodeURIComponent(errorMessage)}`
      : "";
    return `${fallbackBase}${sep}shopify_oauth=${status}${errorPart}`;
  }
};

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const shop = url.searchParams.get("shop");
    const stateRaw = url.searchParams.get("state") || "";

    const { origin: rawOrigin, returnTo: rawReturnTo, organizationId } = parseOauthState(stateRaw);
    // Allowlist origin/returnTo to prevent open-redirect & XSS via attacker-controlled state.
    const origin = sanitizeOrigin(rawOrigin);
    const returnTo = sanitizeReturnTo(rawReturnTo);

    console.log("shopify-oauth-callback request", {
      hasCode: !!code,
      shop,
      hasState: !!stateRaw,
      hasOrganizationId: !!organizationId,
    });

    if (!code || !shop) {
      throw new Error("Missing code or shop parameter from Shopify");
    }

    // Validate shop domain matches Shopify's expected pattern (myshop.myshopify.com).
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop.replace(/^https?:\/\//, "").replace(/\/$/, ""))) {
      throw new Error("Invalid shop domain");
    }

    const domain = shop.replace(/^https?:\/\//, "").replace(/\/$/, "");

    const redirectBase = returnTo || origin || "/";
    const successRedirect = buildAppRedirectUrl(redirectBase, "success");
    const targetOrigin = (() => {
      if (origin) return origin;
      try {
        return new URL(redirectBase).origin;
      } catch {
        return "*";
      }
    })();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // SAFETY GUARD: When organizationId is present in state, look up the brand's
    // expected store_domain FIRST and compare against what Shopify returned.
    // This catches the common Safari/Chrome scenario where the user is logged
    // into a different Shopify store in their browser, and Shopify silently
    // swaps the target store on the OAuth redirect.
    if (organizationId) {
      const { data: expected, error: expectedError } = await adminClient
        .from("shopify_connections")
        .select("id, user_id, client_id, client_secret, store_domain")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (expectedError || !expected) {
        throw new Error("No Shopify connection found for this brand. Please save your store domain and credentials first.");
      }

      const expectedDomain = (expected.store_domain || "").replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
      if (expectedDomain && expectedDomain !== domain.toLowerCase()) {
        throw new Error(
          `Store mismatch: this brand is configured for "${expectedDomain}", but Shopify authorized "${domain}". ` +
          `This usually means a different Shopify store is logged in to your browser. ` +
          `Please log out of all Shopify admin sessions (or use a private/incognito window), then try connecting again.`
        );
      }

      // Use the brand's connection row directly — no risk of matching the wrong row.
      var connection: { id: string; user_id: string; client_id: string | null; client_secret: string | null } = {
        id: expected.id,
        user_id: expected.user_id,
        client_id: expected.client_id,
        client_secret: expected.client_secret,
      };
    } else {
      // Legacy path: no organizationId in state — fall back to domain-only lookup.
      const { data: connectionRow, error: connError } = await adminClient
        .from("shopify_connections")
        .select("id, user_id, client_id, client_secret")
        .eq("store_domain", domain)
        .maybeSingle();

      if (connError || !connectionRow) {
        throw new Error("No matching Shopify connection found for this store domain.");
      }
      var connection: { id: string; user_id: string; client_id: string | null; client_secret: string | null } = connectionRow;
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

    // Return an HTML page that posts to opener if available.
    // Do not auto-redirect when opener is unavailable (common with Safari/COOP).
    const safeTargetOrigin = targetOrigin.replace(/"/g, "");
    const safeSuccessRedirect = successRedirect.replace(/"/g, "\\\"");
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Shopify Connected</title>
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
      if (window.opener) {
        try {
          window.opener.postMessage({ type: "shopify-oauth-success" }, "${safeTargetOrigin}");
        } catch (err) {
          // no-op
        }
        try {
          window.close();
        } catch (err) {
          // no-op
        }
      }

      window.__returnToApp = function () {
        window.location.replace("${safeSuccessRedirect}");
      };

      window.__closeTab = function () {
        window.close();
      };
    })();
  </script>
</head>
<body>
  <div class="card">
    <h1>Shopify authorization completed</h1>
    <p>You can now return to the app tab. The connection status should update automatically.</p>
    <div class="actions">
      <button class="primary" onclick="window.__returnToApp()">Return to app</button>
      <button onclick="window.__closeTab()">Close tab</button>
    </div>
  </div>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (e) {
    console.error("shopify-oauth-callback error:", e);
    const errorMsg = e instanceof Error ? e.message : "Unknown error";
    const safeError = errorMsg.replace(/"/g, "\\\"").replace(/\n/g, " ");

    // Best-effort parse of state, so fallback redirect lands back in app.
    const fallbackUrl = new URL(req.url);
    const stateRaw = fallbackUrl.searchParams.get("state");
    const { origin, returnTo } = parseOauthState(stateRaw);
    const redirectBase = returnTo || origin || "/";
    const redirectTarget = buildAppRedirectUrl(redirectBase, "error", errorMsg).replace(/"/g, "\\\"");

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

      // No automatic redirect: in Safari/COOP contexts this can fail or lead to blank pages.
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
