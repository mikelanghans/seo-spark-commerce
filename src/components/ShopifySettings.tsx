import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Store, Loader2, Check, Trash2, KeyRound, ExternalLink, RefreshCw, Copy } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string;
  organizationId?: string;
}

export const ShopifySettings = ({ userId, organizationId }: Props) => {
  const [storeDomain, setStoreDomain] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [exchanging, setExchanging] = useState(false);
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [existing, setExisting] = useState<{
    id: string;
    store_domain: string;
    has_token: boolean;
    has_credentials: boolean;
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

  // Check URL or localStorage for OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get("shopify_oauth");
    let code = params.get("code");
    let shop = params.get("shop");

    // Also check localStorage (saved when redirected to auth)
    if (!code) {
      code = localStorage.getItem("shopify_oauth_code");
      shop = localStorage.getItem("shopify_oauth_shop");
      if (code) {
        localStorage.removeItem("shopify_oauth_code");
        localStorage.removeItem("shopify_oauth_shop");
      }
    }

    // Handle Shopify app launch (shop+hmac but no code) — auto-redirect to OAuth
    if (!code && !oauthStatus) {
      const pendingShop = params.get("shop") || localStorage.getItem("shopify_pending_shop");
      if (pendingShop) {
        localStorage.removeItem("shopify_pending_shop");
        window.history.replaceState({}, "", window.location.pathname);
        // Auto-trigger OAuth by redirecting to the authorize URL
        const domain = pendingShop.replace(/^https?:\/\//, "").replace(/\/$/, "");
        supabase
          .from("shopify_connections")
          .select("client_id")
          .eq("user_id", userId)
          .match(organizationId ? { organization_id: organizationId } : {})
          .maybeSingle()
          .then(({ data }) => {
            if (data?.client_id) {
              const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-oauth-callback`;
              const scopes = "read_products,write_products,read_files,write_files";
              const state = encodeURIComponent(window.location.origin);
              const authorizeUrl = `https://${domain}/admin/oauth/authorize?client_id=${data.client_id}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
              toast.info("Redirecting to Shopify for authorization...");
              window.location.href = authorizeUrl;
            }
          });
        return;
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
      // Exchange the code for an access token
      window.history.replaceState({}, "", window.location.pathname);
      toast.info("Exchanging authorization code...");
      supabase.functions.invoke("shopify-exchange-token", {
        body: { code },
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
      .maybeSingle();
    if (data) {
      setExisting({
        id: data.id,
        store_domain: data.store_domain,
        has_token: !!data.access_token && data.access_token.length > 0,
        has_credentials: !!data.client_id && !!data.client_secret,
      });
      setStoreDomain(data.store_domain);
    }
    setLoading(false);
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeDomain.trim() || !clientId.trim() || !clientSecret.trim()) {
      toast.error("Please fill in all fields");
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
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
        });
        if (error) throw error;
      }
      setStoreDomain(domain);
      setClientId("");
      setClientSecret("");
      toast.success("Credentials saved! Now click 'Install App' to authorize.");
      await loadConnection();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const generateInstallUrl = async () => {
    if (!existing) return;
    const { data, error } = await supabase
      .from("shopify_connections")
      .select("client_id, store_domain")
      .eq("id", existing.id)
      .single();
    if (error || !data?.client_id) {
      toast.error("Could not load Client ID. Please save credentials first.");
      return;
    }
    const domain = data.store_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-oauth-callback`;
    const scopes = "read_products,write_products,read_files,write_files";
    const state = encodeURIComponent(window.location.origin);
    setInstallUrl(`https://${domain}/admin/oauth/authorize?client_id=${data.client_id}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`);
  };

  // Generate install URL when credentials exist
  useEffect(() => {
    if (existing?.has_credentials && !existing?.has_token) {
      generateInstallUrl();
    }
  }, [existing]);

  const handleCheckConnection = async () => {
    toast.info("Checking connection...");
    await loadConnection();
    // Re-check after load
    const { data } = await supabase
      .from("shopify_connections")
      .select("access_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.access_token && data.access_token.length > 0) {
      toast.success("Shopify is connected!");
    } else {
      toast.error("No access token found yet. Make sure you completed the Shopify authorization.");
    }
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

      {existing?.has_credentials && !existing?.has_token && (
        <div className="space-y-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
          <div className="flex items-center gap-2 text-sm text-yellow-600">
            <KeyRound className="h-4 w-4" />
            Credentials saved — paste your Admin API access token from Shopify Partners below:
          </div>
          <p className="text-xs text-muted-foreground">
            Go to <strong>Shopify Partners → Apps → Brand Aura API → API credentials</strong> and copy the <strong>Admin API access token</strong>.
          </p>
          <div className="flex gap-2">
            <Input
              type="password"
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              placeholder="shpat_xxxxxxxxxxxxxxxxxxxxx"
              className="text-xs font-mono"
            />
            <Button
              type="button"
              size="sm"
              disabled={!authCode.trim() || exchanging}
              onClick={async () => {
                setExchanging(true);
                try {
                  const { error } = await supabase
                    .from("shopify_connections")
                    .update({ access_token: authCode.trim() })
                    .eq("id", existing!.id);
                  if (error) throw error;
                  toast.success("Shopify connected successfully!");
                  setAuthCode("");
                  await loadConnection();
                } catch (err: any) {
                  toast.error(err.message || "Failed to save token");
                } finally {
                  setExchanging(false);
                }
              }}
              className="shrink-0 gap-1"
            >
              {exchanging ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Connect
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={handleSaveCredentials} className="space-y-4">
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
            placeholder={existing?.has_credentials ? "••••••••  (saved)" : "Paste your Client ID"}
            required={!existing?.has_credentials}
          />
        </div>
        <div className="space-y-2">
          <Label>Client Secret</Label>
          <Input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={existing?.has_credentials ? "••••••••  (saved)" : "Paste your Client Secret"}
            required={!existing?.has_credentials}
          />
          <p className="text-xs text-muted-foreground">
            Find these in your Shopify Partners → Apps → your app → Client credentials.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {existing?.has_credentials ? "Update Credentials" : "Save Credentials"}
          </Button>
          {existing?.has_credentials && !existing?.has_token && (
            <Button
              type="button"
              variant="outline"
              onClick={handleCheckConnection}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Check Connection
            </Button>
          )}
          {existing?.has_token && (
            <a
              href={installUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button type="button" variant="secondary" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Re-authorize
              </Button>
            </a>
          )}
          {existing && (
            <Button
              type="button"
              variant="outline"
              onClick={handleDisconnect}
              className="gap-2 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> Disconnect
            </Button>
          )}
        </div>
      </form>
    </div>
  );
};
