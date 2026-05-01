import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // state contains the origin URL for postMessage
  const origin = state ? decodeURIComponent(state) : "*";

  const message = error
    ? { type: "etsy-oauth", error, errorDescription }
    : { type: "etsy-oauth", code };
  const fallbackUrl = new URL(origin);
  if (error) {
    fallbackUrl.searchParams.set("etsy_oauth_error", error);
    if (errorDescription) fallbackUrl.searchParams.set("etsy_oauth_error_description", errorDescription);
  } else if (code) {
    fallbackUrl.searchParams.set("etsy_oauth_code", code);
  }

  const html = `<!DOCTYPE html><html><body><script>
    let delivered = false;
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(${JSON.stringify(message)}, ${JSON.stringify(origin)});
        delivered = true;
        window.close();
      }
    } catch (_) {}
    if (!delivered) {
      window.location.replace(${JSON.stringify(fallbackUrl.toString())});
    }
  </script><p>Connecting to Etsy... you can close this window.</p></body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
});
