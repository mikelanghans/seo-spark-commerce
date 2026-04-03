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
  const [etsyApiKey, setEtsyApiKey] = useState("");
  const [etsyShopId, setEtsyShopId] = useState("");
  const [etsyShopName, setEtsyShopName] = useState("");
  const [savingEtsy, setSavingEtsy] = useState(false);

  // eBay state
  const [ebayConn, setEbayConn] = useState<EbayConn | null>(null);
  const [ebayClientId, setEbayClientId] = useState("");
  const [ebayClientSecret, setEbayClientSecret] = useState("");
  const [ebayRuName, setEbayRuName] = useState("");
  const [ebayEnv, setEbayEnv] = useState("sandbox");
  const [savingEbay, setSavingEbay] = useState(false);
  const [ebayCredsSaved, setEbayCredsSaved] = useState(false);


  useEffect(() => { loadConnections(); }, []);

  const loadConnections = async () => {
    setLoading(true);
    try {
      const [etsyRes, ebayRes, orgRes] = await Promise.all([
        supabase.from("etsy_connections").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("ebay_connections").select("id, user_id, client_id, ru_name, environment, created_at, updated_at").eq("user_id", userId).maybeSingle(),
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
          has_token: !!d.access_token,
        });
      }

      if (ebayRes.data) {
        const d = ebayRes.data as any;
        setEbayConn({
          id: d.id,
          client_id: d.client_id,
          environment: d.environment,
          has_token: !!d.access_token,
        });
        setEbayClientId(d.client_id || "");
        setEbayClientSecret(d.client_secret || "");
        setEbayRuName(d.ru_name || "");
        setEbayEnv(d.environment || "sandbox");
        if (d.client_id && d.client_secret && d.ru_name) {
          setEbayCredsSaved(true);
        }
      }


    } catch (e: any) {
      toast.error(e.message || "Failed to load connections");
    } finally {
      setLoading(false);
    }
  };

  const connectEtsy = async () => {
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

      // Store verifier for later token exchange
      localStorage.setItem("etsy_code_verifier", codeVerifier);

      const clientId = "3ww8h9ip1bp9fhtwcwqa123b";
      const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/etsy-oauth-callback`;
      const scopes = "shops_r%20shops_w%20listings_r%20listings_w";
      const state = encodeURIComponent(window.location.origin);

      const authUrl = `https://www.etsy.com/oauth/connect?response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&client_id=${clientId}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

      const popup = window.open(authUrl, "etsy-oauth", "width=600,height=700");

      const handler = async (e: MessageEvent) => {
        if (e.data?.type !== "etsy-oauth") return;
        window.removeEventListener("message", handler);

        if (e.data.error) {
          toast.error("Etsy authorization failed");
          setSavingEtsy(false);
          return;
        }

        try {
          const storedVerifier = localStorage.getItem("etsy_code_verifier");
          localStorage.removeItem("etsy_code_verifier");

          const { data: result, error } = await supabase.functions.invoke("etsy-exchange-token", {
            body: {
              code: e.data.code,
              codeVerifier: storedVerifier,
              redirectUri,
            },
          });

          if (error) throw error;
          if (result?.error) throw new Error(result.error);

          toast.success(`Etsy connected! ${result.shopName ? `Shop: ${result.shopName}` : ""}`);
          loadConnections();
        } catch (err: any) {
          toast.error(err.message || "Failed to connect Etsy");
        } finally {
          setSavingEtsy(false);
        }
      };

      window.addEventListener("message", handler);

      // Fallback if popup is closed without completing
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          setSavingEtsy(false);
        }
      }, 1000);
    } catch (e: any) {
      toast.error(e.message || "Failed to start Etsy OAuth");
      setSavingEtsy(false);
    }
  };

  const saveEbayCreds = async () => {
    if (!ebayClientId.trim() || !ebayClientSecret.trim() || !ebayRuName.trim()) {
      toast.error("Client ID, Client Secret, and RuName are all required");
      return;
    }
    setSavingEbay(true);
    try {
      // Upsert credentials into ebay_connections (no token yet)
      const payload = {
        user_id: userId,
        client_id: ebayClientId,
        client_secret: ebayClientSecret,
        ru_name: ebayRuName,
        environment: ebayEnv,
        updated_at: new Date().toISOString(),
      } as any;

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
      // Use the user's own Client ID for the OAuth consent screen
      const savedClientId = ebayClientId || ebayConn?.client_id;
      if (!savedClientId) {
        toast.error("Save your eBay credentials first");
        setSavingEbay(false);
        return;
      }

      // Fetch the saved RuName from the connection
      let ruName = ebayRuName;
      if (!ruName && ebayConn) {
        const { data: connData } = await supabase.from("ebay_connections").select("ru_name").eq("id", ebayConn.id).maybeSingle();
        ruName = (connData as any)?.ru_name || "";
      }
      if (!ruName) {
        toast.error("RuName is required. Please save your credentials with a RuName first.");
        setSavingEbay(false);
        return;
      }

      const isSandbox = ebayEnv === "sandbox";
      const authBase = isSandbox
        ? "https://auth.sandbox.ebay.com/oauth2/authorize"
        : "https://auth.ebay.com/oauth2/authorize";

      const scopes = encodeURIComponent("https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.marketing https://api.ebay.com/oauth/api_scope/sell.account");
      const state = encodeURIComponent(JSON.stringify({ origin: window.location.origin, environment: ebayEnv }));

      const authUrl = `${authBase}?client_id=${savedClientId}&response_type=code&redirect_uri=${ruName}&scope=${scopes}&state=${state}`;
      console.log("eBay OAuth URL:", authUrl);

      const popup = window.open(authUrl, "ebay-oauth", "width=600,height=700");

      const handler = async (e: MessageEvent) => {
        if (e.data?.type !== "ebay-oauth") return;
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
              redirectUri: ruName,
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

      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          setSavingEbay(false);
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
      if (platform === "etsy") { setEtsyConn(null); setEtsyApiKey(""); setEtsyShopId(""); setEtsyShopName(""); }
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
          {etsyConn ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-300">
                <Check className="h-3 w-3 mr-1" /> Connected
              </Badge>
              <Button variant="ghost" size="icon" onClick={() => deleteConnection("etsy")}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ) : (
            <Badge variant="secondary">Not connected</Badge>
          )}
        </div>

        {etsyConn ? (
          <div className="text-sm text-muted-foreground">
            <p>Shop: <span className="text-foreground font-medium">{etsyConn.shop_name || etsyConn.shop_id}</span></p>
            {etsyConn.has_token && <p className="text-green-600 dark:text-green-400">OAuth token active</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect your Etsy shop to push AI-generated listings directly. Click below to authorize via Etsy.
            </p>
            <Button onClick={connectEtsy} disabled={savingEtsy} className="gap-2">
              {savingEtsy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />}
              {savingEtsy ? "Connecting..." : "Connect Etsy Shop"}
            </Button>
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
                <Input type="password" value={ebayClientSecret} onChange={(e) => setEbayClientSecret(e.target.value)} placeholder="Your eBay Cert ID" />
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
