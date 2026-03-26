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

  const html = `<!DOCTYPE html><html><body><script>
    window.opener.postMessage({
      type: "ebay-oauth",
      ${error ? `error: "${error}"` : `code: "${code}"`},
      environment: "${environment}"
    }, "${origin}");
    window.close();
  </script><p>Connecting to eBay... you can close this window.</p></body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
});
