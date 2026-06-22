import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const EbayOAuthCallback = () => {
  useEffect(() => {
    let isMounted = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");
    const environment = params.get("environment") || "sandbox";
    const redirectUri = params.get("redirectUri") || "";

    const payload = {
      type: "ebay-oauth",
      environment,
      redirectUri,
      ...(error ? { error } : { code }),
    };

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, window.location.origin);
      window.close();
      return;
    }

    const finishInThisWindow = async () => {
      if (error) {
        toast.error("eBay authorization failed");
        window.location.replace("/");
        return;
      }

      if (!code || !redirectUri) {
        toast.error("Missing eBay authorization details");
        window.location.replace("/");
        return;
      }

      try {
        const { data: result, error: invokeError } = await supabase.functions.invoke("ebay-exchange-token", {
          body: { code, redirectUri, environment },
        });

        if (invokeError) throw invokeError;
        if (result?.error) throw new Error(result.error);

        toast.success(`eBay connected! (${result.environment || environment})`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to connect eBay");
      } finally {
        if (isMounted) window.location.replace("/");
      }
    };

    finishInThisWindow();

    return () => {
      isMounted = false;
    };
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