import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  let origin = "";
  let environment = "sandbox";
  let redirectUri = "";
  try {
    const parsed = JSON.parse(decodeURIComponent(state || "{}"));
    origin = parsed.origin || "";
    environment = parsed.environment || "sandbox";
    redirectUri = parsed.redirectUri || "";
  } catch {
    origin = state ? decodeURIComponent(state) : "";
  }

  if (!origin || !isAllowedOrigin(origin)) {
    return new Response("Invalid OAuth state", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const redirectUrl = new URL("/oauth/ebay/callback", origin);
    if (error) redirectUrl.searchParams.set("error", error);
    if (code) redirectUrl.searchParams.set("code", code);
    redirectUrl.searchParams.set("environment", environment);
    if (redirectUri) redirectUrl.searchParams.set("redirectUri", redirectUri);

    return Response.redirect(redirectUrl.toString(), 302);
  } catch {
    return new Response("Invalid OAuth state", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
});
