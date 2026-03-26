import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Store, Loader2, Check, Trash2, RefreshCw, KeyRound } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string;
  organizationId?: string;
}

export const ShopifySettings = ({ userId, organizationId }: Props) => {
  const [storeDomain, setStoreDomain] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [existing, setExisting] = useState<{
    id: string;
    store_domain: string;
    has_token: boolean;
    client_id: string | null;
    client_secret: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);

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
        client_id: data.client_id,
        client_secret: data.client_secret,
      });
      setStoreDomain(data.store_domain);
      setClientId(data.client_id || "");
      setClientSecret(data.client_secret || "");
    }
    setLoading(false);
  };

  const buildInstallUrl = (domain: string, appClientId: string) => {
    const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-oauth-callback`;
    const scopes = "read_products,write_products,read_files,write_files";
    const statePayload = JSON.stringify({ origin: window.location.origin, organizationId: organizationId || null });
    const state = encodeURIComponent(statePayload);
    return `https://${domain}/admin/oauth/authorize?client_id=${appClientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeDomain.trim()) {
      toast.error("Please enter your store domain");
      return;
    }
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error("Please enter your Shopify app Client ID and Client Secret");
      return;
    }
    setSaving(true);
    try {
      const domain = storeDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");

      if (existing) {
        const { error } = await supabase
          .from("shopify_connections")
          .update({
            store_domain: domain,
            client_id: clientId.trim(),
            client_secret: clientSecret.trim(),
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shopify_connections").insert({
          user_id: userId,
          store_domain: domain,
          organization_id: organizationId || null,
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
        });
        if (error) throw error;
      }

      setStoreDomain(domain);
      await loadConnection();

      // Redirect to Shopify OAuth
      const installUrl = buildInstallUrl(domain, clientId.trim());
      window.location.href = installUrl;
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleReauthorize = () => {
    if (!existing || !existing.client_id) return;
    const installUrl = buildInstallUrl(existing.store_domain, existing.client_id);
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
    setClientId("");
    setClientSecret("");
    toast.success("Shopify disconnected");
  };

  const handleUpdateCredentials = async () => {
    if (!existing || !clientId.trim() || !clientSecret.trim()) {
      toast.error("Please fill in both Client ID and Client Secret");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("shopify_connections")
        .update({
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
        })
        .eq("id", existing.id);
      if (error) throw error;
      toast.success("App credentials updated");
      setShowCredentials(false);
      await loadConnection();
    } catch (err: any) {
      toast.error(err.message || "Failed to update credentials");
    } finally {
      setSaving(false);
    }
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
          </div>
          <div className="space-y-2">
            <Label>Client ID</Label>
            <Input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Your Shopify app Client ID"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Client Secret</Label>
            <Input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="Your Shopify app Client Secret"
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Enter your Shopify app credentials from your Shopify Partners dashboard. Each brand uses its own Shopify app.
          </p>
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
            Install & Connect
          </Button>
        </form>
      )}

      {existing && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            {existing.has_token && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleReauthorize}
                className="gap-2"
                disabled={!existing.client_id}
              >
                <RefreshCw className="h-4 w-4" />
                Re-authorize
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCredentials(!showCredentials)}
              className="gap-2"
            >
              <KeyRound className="h-4 w-4" />
              {showCredentials ? "Hide" : "Edit"} App Credentials
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDisconnect}
              className="gap-2 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> Disconnect
            </Button>
          </div>

          {showCredentials && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="space-y-2">
                <Label className="text-xs">Client ID</Label>
                <Input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="Your Shopify app Client ID"
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Client Secret</Label>
                <Input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="Your Shopify app Client Secret"
                  className="text-sm"
                />
              </div>
              <Button size="sm" onClick={handleUpdateCredentials} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save Credentials
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
