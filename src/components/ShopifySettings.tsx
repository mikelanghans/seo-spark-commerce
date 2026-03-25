import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Store, Loader2, Check, Trash2, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string;
  organizationId?: string;
}

export const ShopifySettings = ({ userId, organizationId }: Props) => {
  const [storeDomain, setStoreDomain] = useState("");
  const [existing, setExisting] = useState<{
    id: string;
    store_domain: string;
    has_token: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConnection();
  }, []);

  // Listen for OAuth callback messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "shopify-oauth-success") {
        toast.success("Shopify connected successfully!");
        loadConnection();
      } else if (event.data?.type === "shopify-oauth-error") {
        toast.error(event.data.error || "OAuth failed");
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Check URL for OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get("shopify_oauth");
    let code = params.get("code");

    if (!code) {
      code = localStorage.getItem("shopify_oauth_code");
      if (code) {
        localStorage.removeItem("shopify_oauth_code");
        localStorage.removeItem("shopify_oauth_shop");
      }
    }

    if (oauthStatus === "success") {
      toast.success("Shopify connected successfully!");
      loadConnection();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (oauthStatus === "error") {
      toast.error(params.get("error") || "OAuth failed");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (code) {
      window.history.replaceState({}, "", window.location.pathname);
      toast.info("Exchanging authorization code...");
      supabase.functions.invoke("shopify-exchange-token", {
        body: { code, organizationId },
      }).then(({ data, error }) => {
        if (error) {
          toast.error("Failed to exchange token: " + error.message);
        } else if (data?.error) {
          toast.error(data.error);
        } else {
          toast.success("Shopify connected successfully!");
          loadConnection();
        }
      });
    }
  }, []);

  const loadConnection = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("shopify_connections")
      .select("*")
      .eq("user_id", userId)
      .match(organizationId ? { organization_id: organizationId } : {})
      .maybeSingle();
    if (data) {
      setExisting({
        id: data.id,
        store_domain: data.store_domain,
        has_token: !!data.access_token && data.access_token.length > 0,
      });
      setStoreDomain(data.store_domain);
    }
    setLoading(false);
  };

  const buildInstallUrl = (domain: string) => {
    const clientId = "c7c3d792101f944f3c3486949ff0bc05";
    const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-oauth-callback`;
    const scopes = "read_products,write_products,read_files,write_files";
    const statePayload = JSON.stringify({ origin: window.location.origin, organizationId: organizationId || null });
    const state = encodeURIComponent(statePayload);
    return `https://${domain}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeDomain.trim()) {
      toast.error("Please enter your store domain");
      return;
    }
    setSaving(true);
    try {
      const domain = storeDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");

      if (existing) {
        const { error } = await supabase
          .from("shopify_connections")
          .update({ store_domain: domain })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shopify_connections").insert({
          user_id: userId,
          store_domain: domain,
          organization_id: organizationId || null,
        });
        if (error) throw error;
      }

      setStoreDomain(domain);
      await loadConnection();

      // Redirect to Shopify OAuth
      const installUrl = buildInstallUrl(domain);
      window.location.href = installUrl;
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleReauthorize = () => {
    if (!existing) return;
    const installUrl = buildInstallUrl(existing.store_domain);
    window.location.href = installUrl;
  };

  const handleDisconnect = async () => {
    if (!existing) return;
    const { error } = await supabase.from("shopify_connections").delete().eq("id", existing.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setExisting(null);
    setStoreDomain("");
    toast.success("Shopify disconnected");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Store className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Shopify Connection</h3>
      </div>

      {existing?.has_token && (
        <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-600">
          <Check className="h-4 w-4" />
          Connected to <span className="font-medium">{existing.store_domain}</span>
        </div>
      )}

      {!existing?.has_token && (
        <form onSubmit={handleConnect} className="space-y-4">
          <div className="space-y-2">
            <Label>Store Domain</Label>
            <Input
              value={storeDomain}
              onChange={(e) => setStoreDomain(e.target.value)}
              placeholder="your-store.myshopify.com"
              required
            />
            <p className="text-xs text-muted-foreground">
              Enter your Shopify store domain and click Install to connect.
            </p>
          </div>
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
            Install & Connect
          </Button>
        </form>
      )}

      {existing && (
        <div className="flex gap-2 flex-wrap">
          {existing.has_token && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleReauthorize}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Re-authorize
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={handleDisconnect}
            className="gap-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Disconnect
          </Button>
        </div>
      )}
    </div>
  );
};
