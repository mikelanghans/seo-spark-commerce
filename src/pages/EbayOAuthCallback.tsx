import { useEffect } from "react";
import { Loader2 } from "lucide-react";

const EbayOAuthCallback = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");
    const environment = params.get("environment") || "sandbox";

    const payload = {
      type: "ebay-oauth",
      environment,
      ...(error ? { error } : { code }),
    };

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, window.location.origin);
      window.close();
      return;
    }

    window.location.replace("/");
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Finishing eBay connection...
      </div>
    </div>
  );
};

export default EbayOAuthCallback;