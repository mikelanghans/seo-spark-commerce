import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // state contains the origin URL for postMessage
  const origin = state ? decodeURIComponent(state) : "*";

  const html = `<!DOCTYPE html><html><body><script>
    window.opener.postMessage({
      type: "etsy-oauth",
      ${error ? `error: "${error}"` : `code: "${code}"`}
    }, "${origin}");
    window.close();
  </script><p>Connecting to Etsy... you can close this window.</p></body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
});
