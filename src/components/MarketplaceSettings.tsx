import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, Trash2, ExternalLink, ShoppingBag, Package, HelpCircle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string;
  organizationId?: string;
}

interface EtsyConn {
  id: string;
  shop_id: string;
  shop_name: string;
  api_key: string;
  client_id: string;
  has_token: boolean;
}

interface EbayConn {
  id: string;
  client_id: string;
  environment: string;
  has_token: boolean;
}


export const MarketplaceSettings = ({ userId, organizationId }: Props) => {
  const [loading, setLoading] = useState(true);


  // Etsy state (Printify moved to PrintifySettings)
  const [etsyConn, setEtsyConn] = useState<EtsyConn | null>(null);
  const [etsyClientId, setEtsyClientId] = useState("");
  const [etsyClientSecret, setEtsyClientSecret] = useState("");
  const [savingEtsy, setSavingEtsy] = useState(false);
  const [etsyCredsSaved, setEtsyCredsSaved] = useState(false);

  // eBay state
  const [ebayConn, setEbayConn] = useState<EbayConn | null>(null);
  const [ebayClientId, setEbayClientId] = useState("");
  const [ebayClientSecret, setEbayClientSecret] = useState("");
  const [ebayRuName, setEbayRuName] = useState("");
  const [ebayEnv, setEbayEnv] = useState("sandbox");
  const [savingEbay, setSavingEbay] = useState(false);
  const [ebayCredsSaved, setEbayCredsSaved] = useState(false);


  useEffect(() => {
    const handleEtsyOAuthReturn = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("etsy_oauth_code");
      const error = params.get("etsy_oauth_error");
      const errorDescription = params.get("etsy_oauth_error_description");

      if (!code && !error) return;

      params.delete("etsy_oauth_code");
      params.delete("etsy_oauth_error");
      params.delete("etsy_oauth_error_description");
      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", nextUrl);

      if (error) {
        toast.error(errorDescription || error || "Etsy authorization failed");
        localStorage.removeItem("etsy_code_verifier");
        return;
      }

      const storedVerifier = localStorage.getItem("etsy_code_verifier");
      if (!storedVerifier) {
        toast.error("Etsy authorization expired. Please try again.");
        return;
      }

      setSavingEtsy(true);
      try {
        const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/etsy-oauth-callback`;
        const { data: result, error: exchangeError } = await supabase.functions.invoke("etsy-exchange-token", {
          body: { code, codeVerifier: storedVerifier, redirectUri },
        });

        if (exchangeError) throw exchangeError;
        if (result?.error) throw new Error(result.error);

        toast.success(`Etsy connected! ${result.shopName ? `Shop: ${result.shopName}` : ""}`);
      } catch (err: any) {
        toast.error(err.message || "Failed to connect Etsy");
      } finally {
        localStorage.removeItem("etsy_code_verifier");
        setSavingEtsy(false);
        await loadConnections();
      }
    };

    loadConnections();
    handleEtsyOAuthReturn();
  }, []);

  const loadConnections = async () => {
    setLoading(true);
    try {
      const [etsyRes, ebayRes, orgRes] = await Promise.all([
        supabase
          .from("etsy_connections")
          .select("id, shop_id, shop_name, api_key, client_id, token_expires_at")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase.from("ebay_connections").select("id, user_id, client_id, ru_name, environment, token_expires_at, created_at, updated_at").eq("user_id", userId).maybeSingle(),
        organizationId
          ? supabase.from("organizations").select("id").eq("id", organizationId).single()
          : Promise.resolve({ data: null }),
      ]);

      if (etsyRes.data) {
        const d = etsyRes.data as any;
        setEtsyConn({
          id: d.id,
          shop_id: d.shop_id,
          shop_name: d.shop_name,
          api_key: d.api_key,
          client_id: d.client_id || "",
          has_token: !!d.token_expires_at,
        });
        setEtsyClientId(d.client_id || "");
        if (d.client_id) setEtsyCredsSaved(true);
      }

      if (ebayRes.data) {
        const d = ebayRes.data as any;
        setEbayConn({
          id: d.id,
          client_id: d.client_id,
          environment: d.environment,
          has_token: !!d.token_expires_at,
        });
        setEbayClientId(d.client_id || "");
        // client_secret is hidden from SELECT for security; leave blank but mark as saved
        setEbayRuName(d.ru_name || "");
        setEbayEnv(d.environment || "sandbox");
        if (d.client_id && d.ru_name) {
          setEbayCredsSaved(true);
        }
      }


    } catch (e: any) {
      toast.error(e.message || "Failed to load connections");
    } finally {
      setLoading(false);
    }
  };

  const saveEtsyCreds = async () => {
    if (!etsyClientId.trim()) {
      toast.error("Etsy Keystring (Client ID) is required");
      return;
    }
    setSavingEtsy(true);
    try {
      const payload: any = {
        user_id: userId,
        client_id: etsyClientId.trim(),
        updated_at: new Date().toISOString(),
      };
      if (etsyClientSecret.trim()) payload.client_secret = etsyClientSecret.trim();

      // Ensure NOT NULL columns get values on insert
      if (!etsyConn) {
        payload.shop_id = "pending";
        payload.shop_name = "";
        payload.api_key = etsyClientId.trim();
      }

      const { error } = etsyConn
        ? await supabase.from("etsy_connections").update(payload).eq("id", etsyConn.id)
        : await supabase.from("etsy_connections").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;

      setEtsyCredsSaved(true);
      toast.success("Etsy credentials saved! Now authorize your shop.");
      await loadConnections();
    } catch (e: any) {
      toast.error(e.message || "Failed to save Etsy credentials");
    } finally {
      setSavingEtsy(false);
    }
  };

  const connectEtsy = async () => {
    const clientId = etsyClientId.trim() || etsyConn?.client_id;
    if (!clientId) {
      toast.error("Save your Etsy Keystring (Client ID) first");
      return;
    }
    setSavingEtsy(true);
    try {
      // Generate PKCE code_verifier and code_challenge
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      const codeVerifier = btoa(String.fromCharCode(...array))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

      const encoder = new TextEncoder();
      const data = encoder.encode(codeVerifier);
      const digest = await crypto.subtle.digest("SHA-256", data);
      const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

      localStorage.setItem("etsy_code_verifier", codeVerifier);

      const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/etsy-oauth-callback`;
      const scopes = "shops_r%20shops_w%20listings_r%20listings_w";
      // state must be the app origin so the callback can redirect back here
      const state = encodeURIComponent(window.location.origin);

      const authUrl = `https://www.etsy.com/oauth/connect?response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&client_id=${clientId}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

      toast.message("Redirecting to Etsy. If Etsy asks for verification, complete it there and you'll be returned automatically.");
      window.location.href = authUrl;
    } catch (e: any) {
      toast.error(e.message || "Failed to start Etsy OAuth");
      setSavingEtsy(false);
    }
  };

  const saveEbayCreds = async () => {
    if (!ebayClientId.trim() || !ebayRuName.trim()) {
      toast.error("Client ID and RuName are required");
      return;
    }
    // Require secret on first save only
    if (!ebayConn && !ebayClientSecret.trim()) {
      toast.error("Client Secret is required");
      return;
    }
    setSavingEbay(true);
    try {
      // Upsert credentials into ebay_connections (no token yet)
      const payload = {
        user_id: userId,
        client_id: ebayClientId,
        ru_name: ebayRuName,
        environment: ebayEnv,
        updated_at: new Date().toISOString(),
      } as any;

      // Only include client_secret if user entered a new value
      if (ebayClientSecret.trim()) {
        payload.client_secret = ebayClientSecret;
      }

      const { error } = ebayConn
        ? await supabase.from("ebay_connections").update(payload).eq("id", ebayConn.id)
        : await supabase.from("ebay_connections").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;

      setEbayCredsSaved(true);
      toast.success("eBay credentials saved! Now authorize your account.");
      await loadConnections();
    } catch (e: any) {
      toast.error(e.message || "Failed to save eBay credentials");
    } finally {
      setSavingEbay(false);
    }
  };

  const connectEbay = async () => {
    setSavingEbay(true);
    try {
      if (!ebayClientId.trim() || !ebayRuName.trim()) {
        toast.error("App ID and RuName are required");
        setSavingEbay(false);
        return;
      }
      if (!ebayConn && !ebayClientSecret.trim()) {
        toast.error("Cert ID is required");
        setSavingEbay(false);
        return;
      }

      const payload = {
        user_id: userId,
        client_id: ebayClientId.trim(),
        ru_name: ebayRuName.trim(),
        environment: ebayEnv,
        updated_at: new Date().toISOString(),
      } as any;

      if (ebayClientSecret.trim()) {
        payload.client_secret = ebayClientSecret.trim();
      }

      const { data: savedConn, error: saveError } = ebayConn
        ? await supabase.from("ebay_connections").update(payload).eq("id", ebayConn.id).select("id, client_id, ru_name, environment").single()
        : await supabase.from("ebay_connections").upsert(payload, { onConflict: "user_id" }).select("id, client_id, ru_name, environment").single();
      if (saveError) throw saveError;
      setEbayConn({
        id: (savedConn as any).id,
        client_id: (savedConn as any).client_id,
        environment: (savedConn as any).environment,
        has_token: false,
      });
      setEbayCredsSaved(true);

      // Use the user's own Client ID for the OAuth consent screen
      const savedClientId = (savedConn as any)?.client_id || ebayClientId || ebayConn?.client_id;
      if (!savedClientId) {
        toast.error("Save your eBay credentials first");
        setSavingEbay(false);
        return;
      }

      // Fetch the saved RuName from the connection
      let ruName = (savedConn as any)?.ru_name || ebayRuName;
      if (!ruName && (savedConn || ebayConn)) {
        const { data: connData } = await supabase.from("ebay_connections").select("ru_name").eq("id", (savedConn as any)?.id || ebayConn?.id).maybeSingle();
        ruName = (connData as any)?.ru_name || "";
      }
      if (!ruName) {
        toast.error("RuName is required. Please save your credentials with a RuName first.");
        setSavingEbay(false);
        return;
      }

      const activeEnv = (savedConn as any)?.environment || ebayEnv;
      const isSandbox = activeEnv === "sandbox";
      const authBase = isSandbox
        ? "https://auth.sandbox.ebay.com/oauth2/authorize"
        : "https://auth.ebay.com/oauth2/authorize";

      const scopes = encodeURIComponent("https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.marketing https://api.ebay.com/oauth/api_scope/sell.account");
      const state = encodeURIComponent(JSON.stringify({ origin: window.location.origin, environment: activeEnv, redirectUri: ruName }));

      let messageHandled = false;
      const handler = async (e: MessageEvent) => {
        if (e.data?.type !== "ebay-oauth") return;
        if (e.origin !== window.location.origin) return;
        messageHandled = true;
        window.removeEventListener("message", handler);

        if (e.data.error) {
          toast.error("eBay authorization failed");
          setSavingEbay(false);
          return;
        }

        try {
          const { data: result, error } = await supabase.functions.invoke("ebay-exchange-token", {
            body: {
              code: e.data.code,
              redirectUri: e.data.redirectUri || ruName,
              environment: e.data.environment || ebayEnv,
            },
          });

          if (error) throw error;
          if (result?.error) throw new Error(result.error);

          toast.success(`eBay connected! (${result.environment || ebayEnv})`);
          loadConnections();
        } catch (err: any) {
          toast.error(err.message || "Failed to connect eBay");
        } finally {
          setSavingEbay(false);
        }
      };

      window.addEventListener("message", handler);

      const authUrl = `${authBase}?client_id=${encodeURIComponent(savedClientId)}&response_type=code&redirect_uri=${encodeURIComponent(ruName)}&scope=${scopes}&state=${state}`;
      console.log("eBay OAuth URL:", authUrl);

      const popup = window.open(authUrl, "ebay-oauth", "width=600,height=700");
      if (!popup) {
        window.removeEventListener("message", handler);
        toast.error("Popup blocked. Please allow popups for Brand Aura and try again.");
        setSavingEbay(false);
        return;
      }

      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          if (!messageHandled) {
            window.removeEventListener("message", handler);
            toast.error("eBay authorization window closed before the connection finished.");
            setSavingEbay(false);
          }
        }
      }, 1000);
    } catch (e: any) {
      toast.error(e.message || "Failed to start eBay OAuth");
      setSavingEbay(false);
    }
  };


  const deleteConnection = async (platform: "etsy" | "ebay") => {
    const table = platform === "etsy" ? "etsy_connections" : "ebay_connections";
    const id = platform === "etsy" ? etsyConn?.id : ebayConn?.id;
    if (!id) return;

    try {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
      if (platform === "etsy") { setEtsyConn(null); setEtsyClientId(""); setEtsyClientSecret(""); setEtsyCredsSaved(false); }
      else { setEbayConn(null); setEbayClientId(""); setEbayClientSecret(""); setEbayRuName(""); }
      toast.success(`${platform === "etsy" ? "Etsy" : "eBay"} disconnected`);
    } catch (e: any) {
      toast.error(e.message || "Failed to disconnect");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Marketplace Connections</h3>


      {/* Etsy */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-orange-500" />
            <span className="font-semibold">Etsy</span>
          </div>
          {etsyConn?.has_token ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-300">
                <Check className="h-3 w-3 mr-1" /> Connected
              </Badge>
              <Button variant="ghost" size="icon" onClick={() => deleteConnection("etsy")}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ) : etsyConn ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-300">
                Credentials saved
              </Badge>
              <Button variant="ghost" size="icon" onClick={() => deleteConnection("etsy")}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ) : (
            <Badge variant="secondary">Not connected</Badge>
          )}
        </div>

        {etsyConn?.has_token ? (
          <div className="text-sm text-muted-foreground">
            <p>Shop: <span className="text-foreground font-medium">{etsyConn.shop_name || etsyConn.shop_id}</span></p>
            <p className="text-green-600 dark:text-green-400">OAuth token active</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect your Etsy shop to push AI-generated listings. Enter your Keystring (Client ID) from the{" "}
              <a href="https://www.etsy.com/developers/your-apps" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary">
                Etsy Developer Portal <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <div className="grid gap-3">
              <div>
                <Label>Keystring (Client ID)</Label>
                <Input value={etsyClientId} onChange={(e) => setEtsyClientId(e.target.value)} placeholder="Your Etsy app keystring" />
              </div>
              <div>
                <Label>Shared Secret (optional)</Label>
                <Input
                  type="password"
                  value={etsyClientSecret}
                  onChange={(e) => setEtsyClientSecret(e.target.value)}
                  placeholder={etsyConn ? "••••••••  (saved — enter new value to change)" : "Your Etsy shared secret"}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Etsy uses PKCE so a secret isn't required, but you can store it for refresh flows.
                </p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Set this Callback URL in your Etsy app:</p>
                <code className="break-all">{import.meta.env.VITE_SUPABASE_URL}/functions/v1/etsy-oauth-callback</code>
              </div>
            </div>
            {!etsyCredsSaved && !etsyConn ? (
              <Button onClick={saveEtsyCreds} disabled={savingEtsy} className="gap-2">
                {savingEtsy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save Credentials
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button onClick={saveEtsyCreds} disabled={savingEtsy} variant="outline" className="gap-2">
                  <Check className="h-4 w-4" />
                  Update Credentials
                </Button>
                <Button onClick={connectEtsy} disabled={savingEtsy} className="gap-2">
                  {savingEtsy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />}
                  {savingEtsy ? "Connecting..." : "Authorize Etsy Shop"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>


      {/* eBay */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-500" />
            <span className="font-semibold">eBay</span>
          </div>
          {ebayConn?.has_token ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-300">
                <Check className="h-3 w-3 mr-1" /> Connected
              </Badge>
              <Button variant="ghost" size="icon" onClick={() => deleteConnection("ebay")}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ) : ebayConn ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-300">
                Credentials saved
              </Badge>
              <Button variant="ghost" size="icon" onClick={() => deleteConnection("ebay")}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ) : (
            <Badge variant="secondary">Not connected</Badge>
          )}
        </div>

        {ebayConn?.has_token ? (
          <div className="text-sm text-muted-foreground">
            <p>Environment: <span className="text-foreground font-medium capitalize">{ebayConn.environment}</span></p>
            <p className="text-green-600 dark:text-green-400">OAuth token active</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect your eBay account to push listings. Enter your App ID and Cert ID from the{" "}
              <a href="https://developer.ebay.com/my/keys" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary">
                eBay Developer Portal <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <div className="grid gap-3">
              <div>
                <Label>App ID (Client ID)</Label>
                <Input value={ebayClientId} onChange={(e) => setEbayClientId(e.target.value)} placeholder="Your eBay App ID" />
              </div>
              <div>
                <Label>Cert ID (Client Secret)</Label>
                <Input type="password" value={ebayClientSecret} onChange={(e) => setEbayClientSecret(e.target.value)} placeholder={ebayConn ? "••••••••  (saved — enter new value to change)" : "Your eBay Cert ID"} />
              </div>
              <div>
                <Label>RuName (Redirect URL Name)</Label>
                <Input value={ebayRuName} onChange={(e) => setEbayRuName(e.target.value)} placeholder="e.g. Your_Brand-YourApp-SBX-xxxxxxxx" />
                <p className="text-xs text-muted-foreground mt-1">
                  Found in eBay Developer Portal → User Tokens → Get a Token from eBay via Your Application
                </p>
              </div>
              <div>
                <Label>Environment</Label>
                <select
                  value={ebayEnv}
                  onChange={(e) => setEbayEnv(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="sandbox">Sandbox (Testing)</option>
                  <option value="production">Production (Live)</option>
                </select>
              </div>
            </div>
            {!ebayCredsSaved && !ebayConn ? (
              <Button onClick={saveEbayCreds} disabled={savingEbay} className="gap-2">
                {savingEbay ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save Credentials
              </Button>
            ) : (
              <Button onClick={connectEbay} disabled={savingEbay} className="gap-2">
                {savingEbay ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                {savingEbay ? "Connecting..." : "Authorize eBay Account"}
              </Button>
            )}
          </div>
        )}
      </div>

    </div>
  );
};
