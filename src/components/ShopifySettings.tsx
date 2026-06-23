import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Store,
  Loader2,
  Check,
  Trash2,
  RefreshCw,
  KeyRound,
  Copy,
  Truck,
} from "lucide-react";
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
    shipping_profile_id: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [shippingProfiles, setShippingProfiles] = useState<
    { id: string; name: string; default: boolean }[]
  >([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null);
  const [copiedAuthUrl, setCopiedAuthUrl] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waitingToastRef = useRef<string | number | null>(null);

  const SHOPIFY_REDIRECT_URI = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-oauth-callback`;
  // If a single shared Shopify app is configured (VITE_SHOPIFY_CLIENT_ID set,
  // matching SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET set as edge function
  // secrets), customers just enter their store domain — no app creation
  // needed on their end. Existing connections that already have their own
  // per-user client_id (the older "bring your own custom app" model) keep
  // using that instead, so nothing breaks for anyone already connected.
  const GLOBAL_SHOPIFY_CLIENT_ID = import.meta.env.VITE_SHOPIFY_CLIENT_ID as
    | string
    | undefined;
  const usingGlobalApp =
    Boolean(GLOBAL_SHOPIFY_CLIENT_ID) && !existing?.client_id;

  useEffect(() => {
    loadConnection();
  }, []);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (waitingToastRef.current !== null) {
        toast.dismiss(waitingToastRef.current);
        waitingToastRef.current = null;
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
        if (waitingToastRef.current !== null) {
          toast.dismiss(waitingToastRef.current);
          waitingToastRef.current = null;
        }
        toast.success("Shopify connected successfully!");
        loadConnection();
      } else if (event.data?.type === "shopify-oauth-error") {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (waitingToastRef.current !== null) {
          toast.dismiss(waitingToastRef.current);
          waitingToastRef.current = null;
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
      supabase.functions
        .invoke("shopify-exchange-token", {
          body: { code, organizationId },
        })
        .then(({ data, error }) => {
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
      const { data, error } = await supabase.functions.invoke(
        "save-shopify-credentials",
        {
          body: { action: "check", organizationId: organizationId || null },
        },
      );
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
          shipping_profile_id: conn.shipping_profile_id ?? null,
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
    const scopes =
      "read_products,write_products,read_files,write_files,read_shipping,write_shipping";
    const statePayload = JSON.stringify({
      origin: window.location.origin,
      organizationId: organizationId || null,
    });
    const state = encodeURIComponent(statePayload);
    return `https://${domain}/admin/oauth/authorize?client_id=${appClientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(SHOPIFY_REDIRECT_URI)}&state=${state}`;
  };

  const saveCredentialsViaEdgeFunction = async (
    domain: string,
    appClientId: string,
    appClientSecret: string,
  ) => {
    const { data, error } = await supabase.functions.invoke(
      "save-shopify-credentials",
      {
        body: {
          storeDomain: domain,
          clientId: appClientId,
          clientSecret: appClientSecret,
          organizationId: organizationId || null,
        },
      },
    );
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
  };

  const clearOauthUiState = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (waitingToastRef.current !== null) {
      toast.dismiss(waitingToastRef.current);
      waitingToastRef.current = null;
    }
  };

  // Poll for connection status after opening OAuth popup
  const startPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    let attempts = 0;
    const maxAttempts = 60; // poll for up to 2 minutes

    const pollOnce = async () => {
      attempts++;

      if (attempts > maxAttempts) {
        clearOauthUiState();
        toast.error(
          "Authorization timed out. Verify your Shopify app allows this redirect URL: " +
            SHOPIFY_REDIRECT_URI,
        );
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke(
          "save-shopify-credentials",
          {
            body: { action: "check", organizationId: organizationId || null },
          },
        );

        if (error || data?.error) {
          clearOauthUiState();
          toast.error(
            data?.error ||
              error?.message ||
              "Failed to verify Shopify authorization status",
          );
          return;
        }

        if (data?.connection?.has_token) {
          clearOauthUiState();
          toast.success("Shopify connected successfully!");
          loadConnection();
          return;
        }
      } catch (err) {
        console.warn("Shopify OAuth polling check failed:", err);
      }
    };

    void pollOnce();
    pollIntervalRef.current = setInterval(() => {
      void pollOnce();
    }, 2000);
  };

  const launchShopifyOauth = (installUrl: string) => {
    setPendingAuthUrl(installUrl);
    toast.info(
      "Credentials ready. Click 'Open Shopify Authorization' to continue.",
    );
  };

  const handleCopyAuthUrl = async () => {
    if (!pendingAuthUrl) return;
    try {
      await navigator.clipboard.writeText(pendingAuthUrl);
      setCopiedAuthUrl(true);
      toast.success("Authorization URL copied. Paste it in a new Safari tab.");
      setTimeout(() => setCopiedAuthUrl(false), 2000);
    } catch {
      toast.error(
        "Could not copy automatically. Please copy the URL manually.",
      );
    }
  };

  const handleAuthorizationLinkClick = () => {
    if (!pendingAuthUrl) return;
    if (waitingToastRef.current !== null) {
      toast.dismiss(waitingToastRef.current);
    }
    waitingToastRef.current = toast.info(
      "Waiting for Shopify authorization — complete the process in the new tab...",
      { duration: 120000 },
    );
    startPolling();

    // Open as a real scripted popup (not a plain <a target="_blank"> link) so the
    // callback page retains a window.opener reference. That lets it postMessage
    // back to this tab and call window.close() on itself once Shopify redirects
    // back — without this, browsers block script-initiated close() on tabs that
    // weren't opened by script, and the success page stays open indefinitely.
    const popup = window.open(
      pendingAuthUrl,
      "shopify-oauth",
      "popup,width=600,height=720",
    );
    if (!popup) {
      // Popup blocked — fall back to the manual copy-URL flow. Polling above
      // still works to detect success even without the popup/postMessage path.
      toast.error(
        "Popup blocked. Use 'Copy URL' below and open it in a new tab manually.",
      );
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeDomain.trim()) {
      toast.error("Please enter your store domain");
      return;
    }
    if (!usingGlobalApp && (!clientId.trim() || !clientSecret.trim())) {
      toast.error("Please enter your Shopify app Client ID and Client Secret");
      return;
    }

    const domain = storeDomain
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    const effectiveClientId = usingGlobalApp
      ? GLOBAL_SHOPIFY_CLIENT_ID!
      : clientId.trim();
    const installUrl = buildInstallUrl(domain, effectiveClientId);

    setSaving(true);
    try {
      await saveCredentialsViaEdgeFunction(
        domain,
        usingGlobalApp ? "" : clientId.trim(),
        usingGlobalApp ? "" : clientSecret.trim(),
      );
      setStoreDomain(domain);
      setPendingAuthUrl(installUrl);
      await loadConnection();
      toast.success(
        usingGlobalApp
          ? "Store domain saved. Click 'Open Shopify Authorization' to continue."
          : "Credentials saved. Click 'Open Shopify Authorization' to continue.",
      );
    } catch (err: any) {
      clearOauthUiState();
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleReauthorize = () => {
    if (!existing) return;
    const effectiveClientId = existing.client_id || GLOBAL_SHOPIFY_CLIENT_ID;
    if (!effectiveClientId) return;
    const installUrl = buildInstallUrl(
      existing.store_domain,
      effectiveClientId,
    );
    launchShopifyOauth(installUrl);
  };

  const handleDisconnect = async () => {
    if (!existing) return;
    const { error } = await supabase
      .from("shopify_connections")
      .delete()
      .eq("id", existing.id);
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
      await saveCredentialsViaEdgeFunction(
        existing.store_domain,
        clientId.trim(),
        clientSecret.trim(),
      );
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

  const isPreviewEnvironment =
    window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovableproject.com");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Store className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Shopify Connection</h3>
      </div>

      {isPreviewEnvironment && !existing?.has_token && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Safari may block Shopify auth from preview. If it fails, use the{" "}
          <span className="font-medium text-foreground">published app URL</span>{" "}
          to complete authorization.
        </div>
      )}

      {existing?.has_token && (
        <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-600">
          <Check className="h-4 w-4" />
          Connected to{" "}
          <span className="font-medium">{existing.store_domain}</span>
        </div>
      )}

      {existing?.has_token && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">
              Default Shipping Profile
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Pushed products will be added to this shipping/delivery profile.
            Leave on "General profile (default)" to use Shopify's default.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <Select
              value={existing.shipping_profile_id || "__default__"}
              onValueChange={async (val) => {
                setSavingProfile(true);
                try {
                  const newId = val === "__default__" ? null : val;
                  const { error } = await supabase.functions.invoke(
                    "save-shopify-credentials",
                    {
                      body: {
                        action: "set_shipping_profile",
                        organizationId: organizationId || null,
                        shippingProfileId: newId,
                      },
                    },
                  );
                  if (error) throw error;
                  setExisting((prev) =>
                    prev ? { ...prev, shipping_profile_id: newId } : prev,
                  );
                  toast.success("Shipping profile updated");
                } catch (err: any) {
                  toast.error(err.message || "Failed to save shipping profile");
                } finally {
                  setSavingProfile(false);
                }
              }}
              disabled={savingProfile || loadingProfiles}
            >
              <SelectTrigger className="min-w-[260px] flex-1">
                <SelectValue placeholder="General profile (default)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">
                  General profile (default)
                </SelectItem>
                {shippingProfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.default ? " (default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={loadingProfiles}
              onClick={async () => {
                setLoadingProfiles(true);
                try {
                  const { data, error } = await supabase.functions.invoke(
                    "fetch-shopify-shipping-profiles",
                    {
                      body: { organizationId: organizationId || null },
                    },
                  );
                  if (error) throw error;
                  if (data?.error) throw new Error(data.error);
                  setShippingProfiles(data?.profiles || []);
                  if (data?.scopeMissing) {
                    toast.warning(
                      data.message ||
                        "Shopify did not grant shipping profile access. General profile is still available.",
                    );
                    return;
                  }
                  toast.success(
                    `Loaded ${(data?.profiles || []).length} profiles`,
                  );
                } catch (err: any) {
                  toast.error(err.message || "Failed to load profiles");
                } finally {
                  setLoadingProfiles(false);
                }
              }}
            >
              {loadingProfiles ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Load profiles
            </Button>
          </div>
        </div>
      )}

      {!existing?.has_token && (
        <form onSubmit={handleConnect} className="space-y-4">
          {existing && existing.has_credentials && (
            <div className="space-y-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                {pendingAuthUrl ? (
                  <>
                    Almost there — click{" "}
                    <span className="font-medium">
                      "Open Shopify Authorization"
                    </span>{" "}
                    below to finish connecting{" "}
                    <span className="font-medium">{existing.store_domain}</span>
                    .
                  </>
                ) : usingGlobalApp ? (
                  <>
                    Store domain saved for{" "}
                    <span className="font-medium">{existing.store_domain}</span>
                    , but authorization is incomplete. Click{" "}
                    <span className="font-medium">"Install &amp; Connect"</span>{" "}
                    below to regenerate the authorization link.
                  </>
                ) : (
                  <>
                    Credentials saved for{" "}
                    <span className="font-medium">{existing.store_domain}</span>
                    , but authorization is incomplete. Re-enter your Client
                    Secret and click{" "}
                    <span className="font-medium">"Install &amp; Connect"</span>{" "}
                    below to regenerate the authorization link.
                  </>
                )}
              </div>
              <p className="text-xs text-amber-700/90">
                If this keeps repeating, verify your app redirect URL is
                exactly:{" "}
                <span className="font-mono">{SHOPIFY_REDIRECT_URI}</span>
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

          {!usingGlobalApp && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  App Credentials
                </span>
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
                Find these in your{" "}
                <span className="text-foreground font-medium">
                  Shopify Partners
                </span>{" "}
                dashboard → Apps → your app → Client credentials.
              </p>
            </div>
          )}

          <Button
            type="submit"
            variant={pendingAuthUrl ? "outline" : "default"}
            disabled={saving}
            className="gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Store className="h-4 w-4" />
            )}
            Install & Connect
          </Button>

          {pendingAuthUrl && (
            <div className="space-y-2">
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  className="gap-2"
                  onClick={handleAuthorizationLinkClick}
                >
                  <RefreshCw className="h-4 w-4" />
                  Open Shopify Authorization
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={handleCopyAuthUrl}
                >
                  <Copy className="h-4 w-4" />
                  {copiedAuthUrl ? "Copied" : "Copy URL"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                If Safari shows the COOP error, paste the copied URL directly
                into a brand-new tab and continue there.
              </p>
            </div>
          )}
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
                disabled={!existing.client_id && !GLOBAL_SHOPIFY_CLIENT_ID}
              >
                <RefreshCw className="h-4 w-4" />
                Re-authorize
              </Button>
            )}
            {!usingGlobalApp && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCredentials(!showCredentials);
                  setClientSecret("");
                }}
                className="gap-2"
              >
                <KeyRound className="h-4 w-4" />
                {showCredentials ? "Hide" : "Edit"} App Credentials
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

          {!usingGlobalApp && showCredentials && (
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
                  placeholder={
                    existing.has_credentials
                      ? "••••••••  (enter new value to change)"
                      : "Your Shopify app Client Secret"
                  }
                  className="text-sm"
                />
              </div>
              <Button
                size="sm"
                onClick={handleUpdateCredentials}
                disabled={saving}
                className="gap-2"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Save Credentials
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
