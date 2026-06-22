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
  const errorDescription = url.searchParams.get("error_description");

  const origin = state ? decodeURIComponent(state) : "";

  if (!origin || !isAllowedOrigin(origin)) {
    return new Response("Invalid Etsy callback state. Please return to Brand Aura and try again.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  let fallbackHref = "";
  try {
    const fallbackUrl = new URL(origin);
    if (error) {
      fallbackUrl.searchParams.set("etsy_oauth_error", error);
      if (errorDescription) fallbackUrl.searchParams.set("etsy_oauth_error_description", errorDescription);
    } else if (code) {
      fallbackUrl.searchParams.set("etsy_oauth_code", code);
    }
    fallbackHref = fallbackUrl.toString();
  } catch (_) {
    fallbackHref = "";
  }

  if (fallbackHref) {
    return Response.redirect(fallbackHref, 302);
  }

  return new Response("Missing Etsy callback state. Please return to Brand Aura and try again.", {
    status: 400,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
});
