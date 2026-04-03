import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // state contains JSON with origin + environment
  let origin = "*";
  let environment = "sandbox";
  try {
    const parsed = JSON.parse(decodeURIComponent(state || "{}"));
    origin = parsed.origin || "*";
    environment = parsed.environment || "sandbox";
  } catch {
    origin = state ? decodeURIComponent(state) : "*";
  }

  try {
    const redirectUrl = new URL("/oauth/ebay/callback", origin);
    if (error) redirectUrl.searchParams.set("error", error);
    if (code) redirectUrl.searchParams.set("code", code);
    redirectUrl.searchParams.set("environment", environment);

    return Response.redirect(redirectUrl.toString(), 302);
  } catch {
    return new Response("Invalid OAuth state", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
});
