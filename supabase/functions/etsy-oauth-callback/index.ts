import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // state contains the origin URL for postMessage / fallback redirect
  const origin = state ? decodeURIComponent(state) : "";

  const message: Record<string, unknown> = error
    ? { type: "etsy-oauth", error, errorDescription }
    : { type: "etsy-oauth", code };

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

  const targetOrigin = origin && origin !== "" ? origin : "*";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Connecting Etsy…</title>
<style>body{font-family:system-ui,sans-serif;background:#0b0b14;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:1rem}a{color:#c084fc}</style>
</head><body><div>
<h2>${error ? "Etsy authorization failed" : "Connecting to Etsy…"}</h2>
<p id="msg">${error ? (errorDescription || error) : "Finishing up — this window will close automatically."}</p>
${fallbackHref ? `<p><a id="continue" href="${fallbackHref}">Continue to app →</a></p>` : ""}
</div>
<script>
(function(){
  var delivered = false;
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(${JSON.stringify(message)}, ${JSON.stringify(targetOrigin)});
      delivered = true;
      setTimeout(function(){ try { window.close(); } catch(_){} }, 300);
    }
  } catch (_) {}
  if (!delivered) {
    var href = ${JSON.stringify(fallbackHref)};
    if (href) {
      // Redirect the current tab back to the app with the code in the URL
      setTimeout(function(){ window.location.replace(href); }, 400);
    } else {
      document.getElementById('msg').textContent = 'Please return to the Brand Aura tab — your authorization is complete.';
    }
  }
})();
</script>
</body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});
