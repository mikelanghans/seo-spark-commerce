import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // state contains the app origin URL for the redirect back to Brand Aura
  const origin = state ? decodeURIComponent(state) : "";

  let fallbackHref = "";
  try {
    if (origin && origin !== "*") {
      const fallbackUrl = new URL(origin);
      if (error) {
        fallbackUrl.searchParams.set("etsy_oauth_error", error);
        if (errorDescription) fallbackUrl.searchParams.set("etsy_oauth_error_description", errorDescription);
      } else if (code) {
        fallbackUrl.searchParams.set("etsy_oauth_code", code);
      }
      fallbackHref = fallbackUrl.toString();
    }
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
