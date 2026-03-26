import { useState, useEffect, useRef } from "react";
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
    has_credentials: boolean;
    client_id: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const SHOPIFY_REDIRECT_URI = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-oauth-callback`;

  useEffect(() => {
    loadConnection();
  }, []);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // Listen for OAuth callback messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "shopify-oauth-success") {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        toast.success("Shopify connected successfully!");
        loadConnection();
      } else if (event.data?.type === "shopify-oauth-error") {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
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
    try {
      // Use edge function to read connection status (avoids column-level permission issues)
      const { data, error } = await supabase.functions.invoke("save-shopify-credentials", {
        body: { action: "check", organizationId: organizationId || null },
      });
      if (error) {
        console.error("Failed to check Shopify connection:", error);
        setLoading(false);
        return;
      }
      const conn = data?.connection;
      if (conn) {
        setExisting({
          id: conn.id,
          store_domain: conn.store_domain,
          has_token: conn.has_token,
          has_credentials: conn.has_credentials,
          client_id: conn.client_id,
        });
        setStoreDomain(conn.store_domain);
        setClientId(conn.client_id || "");
        setClientSecret("");
      } else {
        setExisting(null);
      }
    } catch (err) {
      console.error("Failed to load Shopify connection:", err);
    }
    setLoading(false);
  };

  const buildInstallUrl = (domain: string, appClientId: string) => {
    const scopes = "read_products,write_products,read_files,write_files";
    const statePayload = JSON.stringify({ origin: window.location.origin, organizationId: organizationId || null });
    const state = encodeURIComponent(statePayload);
    return `https://${domain}/admin/oauth/authorize?client_id=${appClientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(SHOPIFY_REDIRECT_URI)}&state=${state}`;
  };

  const saveCredentialsViaEdgeFunction = async (domain: string, appClientId: string, appClientSecret: string) => {
    const { data, error } = await supabase.functions.invoke("save-shopify-credentials", {
      body: {
        storeDomain: domain,
        clientId: appClientId,
        clientSecret: appClientSecret,
        organizationId: organizationId || null,
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
  };

  // Poll for connection status after opening OAuth popup
  const startPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    let attempts = 0;
    const maxAttempts = 60; // poll for up to 2 minutes

    pollIntervalRef.current = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        toast.error("Authorization timed out. Verify your Shopify app allows this redirect URL: " + SHOPIFY_REDIRECT_URI);
        return;
      }

      const { data, error } = await supabase.functions.invoke("save-shopify-credentials", {
        body: { action: "check", organizationId: organizationId || null },
      });

      if (error || data?.error) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        toast.error(data?.error || error?.message || "Failed to verify Shopify authorization status");
        return;
      }

      if (data?.connection?.has_token) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        toast.success("Shopify connected successfully!");
        loadConnection();
      }
    }, 2000);
  };

  const isSafariBrowser = () => {
    const ua = navigator.userAgent;
    return /Safari/i.test(ua) && !/Chrome|CriOS|Edg|OPR|Firefox|FxiOS/i.test(ua);
  };

  const launchShopifyOauth = (installUrl: string) => {
    if (isSafariBrowser()) {
      toast.info("Opening Shopify in this tab (Safari popup restrictions detected)...");
      window.location.assign(installUrl);
      return;
    }

    const popup = window.open(installUrl, "shopify-oauth", "width=600,height=700,noopener,noreferrer");

    if (!popup) {
      toast.info("Popup blocked. Opening Shopify in this tab instead...");
      window.location.assign(installUrl);
      return;
    }

    toast.info("Waiting for Shopify authorization...");
    startPolling();
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

      // Save credentials securely via edge function (never writes secret from frontend)
      await saveCredentialsViaEdgeFunction(domain, clientId.trim(), clientSecret.trim());

      setStoreDomain(domain);
      await loadConnection();

      // Redirect to Shopify OAuth
      const installUrl = buildInstallUrl(domain, clientId.trim());
      launchShopifyOauth(installUrl);
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleReauthorize = () => {
    if (!existing || !existing.client_id) return;
    const installUrl = buildInstallUrl(existing.store_domain, existing.client_id);
    launchShopifyOauth(installUrl);
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
      await saveCredentialsViaEdgeFunction(existing.store_domain, clientId.trim(), clientSecret.trim());
      toast.success("App credentials updated");
      setShowCredentials(false);
      setClientSecret("");
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
          {existing && existing.has_credentials && (
            <div className="space-y-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Credentials saved for <span className="font-medium">{existing.store_domain}</span> but authorization is incomplete. Re-enter your Client Secret and click Install &amp; Connect to finish.
              </div>
              <p className="text-xs text-amber-700/90">
                If this keeps repeating, verify your app redirect URL is exactly: <span className="font-mono">{SHOPIFY_REDIRECT_URI}</span>
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label>Store Domain</Label>
            <Input
              value={storeDomain}
              onChange={(e) => setStoreDomain(e.target.value)}
              placeholder="your-store.myshopify.com"
              required
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">App Credentials</span>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Client ID</Label>
              <Input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="e.g. 1a2b3c4d5e6f..."
                className="font-mono text-sm"
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Client Secret</Label>
              <Input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="e.g. shpss_abc123..."
                className="font-mono text-sm"
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Find these in your <span className="text-foreground font-medium">Shopify Partners</span> dashboard → Apps → your app → Client credentials.
            </p>
          </div>

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
              onClick={() => { setShowCredentials(!showCredentials); setClientSecret(""); }}
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
                  placeholder={existing.has_credentials ? "••••••••  (enter new value to change)" : "Your Shopify app Client Secret"}
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