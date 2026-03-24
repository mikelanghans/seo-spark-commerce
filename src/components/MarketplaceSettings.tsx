import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, Trash2, ExternalLink, ShoppingBag, Package, Facebook, Printer } from "lucide-react";
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

interface MetaConn {
  id: string;
  catalog_id: string;
  page_id: string;
  has_token: boolean;
}

export const MarketplaceSettings = ({ userId, organizationId }: Props) => {
  const [loading, setLoading] = useState(true);

  // Printify state
  const [printifyToken, setPrintifyToken] = useState("");
  const [printifyHasToken, setPrintifyHasToken] = useState(false);
  const [savingPrintify, setSavingPrintify] = useState(false);

  // Etsy state
  const [etsyConn, setEtsyConn] = useState<EtsyConn | null>(null);
  const [etsyApiKey, setEtsyApiKey] = useState("");
  const [etsyShopId, setEtsyShopId] = useState("");
  const [etsyShopName, setEtsyShopName] = useState("");
  const [savingEtsy, setSavingEtsy] = useState(false);

  // eBay state
  const [ebayConn, setEbayConn] = useState<EbayConn | null>(null);
  const [ebayClientId, setEbayClientId] = useState("");
  const [ebayClientSecret, setEbayClientSecret] = useState("");
  const [ebayEnv, setEbayEnv] = useState("sandbox");
  const [savingEbay, setSavingEbay] = useState(false);

  // Meta state
  const [metaConn, setMetaConn] = useState<MetaConn | null>(null);
  const [metaCatalogId, setMetaCatalogId] = useState("");
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [metaPageId, setMetaPageId] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);

  useEffect(() => { loadConnections(); }, []);

  const loadConnections = async () => {
    setLoading(true);
    try {
      const [etsyRes, ebayRes, metaRes] = await Promise.all([
        supabase.from("etsy_connections").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("ebay_connections").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("meta_connections").select("*").eq("user_id", userId).maybeSingle(),
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
      }

      if (metaRes.data) {
        const d = metaRes.data as any;
        setMetaConn({
          id: d.id,
          catalog_id: d.catalog_id,
          page_id: d.page_id,
          has_token: !!d.access_token,
        });
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to load connections");
    } finally {
      setLoading(false);
    }
  };

  const saveEtsy = async () => {
    if (!etsyApiKey.trim() || !etsyShopId.trim()) {
      toast.error("API key and Shop ID are required");
      return;
    }
    setSavingEtsy(true);
    try {
      if (etsyConn) {
        const { error } = await supabase
          .from("etsy_connections")
          .update({ api_key: etsyApiKey, shop_id: etsyShopId, shop_name: etsyShopName || etsyShopId, updated_at: new Date().toISOString() } as any)
          .eq("id", etsyConn.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("etsy_connections")
          .insert({ user_id: userId, api_key: etsyApiKey, shop_id: etsyShopId, shop_name: etsyShopName || etsyShopId } as any);
        if (error) throw error;
      }
      toast.success("Etsy connection saved!");
      loadConnections();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSavingEtsy(false);
    }
  };

  const saveEbay = async () => {
    if (!ebayClientId.trim() || !ebayClientSecret.trim()) {
      toast.error("Client ID and Secret are required");
      return;
    }
    setSavingEbay(true);
    try {
      if (ebayConn) {
        const { error } = await supabase
          .from("ebay_connections")
          .update({ client_id: ebayClientId, client_secret: ebayClientSecret, environment: ebayEnv, updated_at: new Date().toISOString() } as any)
          .eq("id", ebayConn.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ebay_connections")
          .insert({ user_id: userId, client_id: ebayClientId, client_secret: ebayClientSecret, environment: ebayEnv } as any);
        if (error) throw error;
      }
      toast.success("eBay connection saved!");
      loadConnections();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSavingEbay(false);
    }
  };

  const saveMeta = async () => {
    if (!metaCatalogId.trim() || !metaAccessToken.trim()) {
      toast.error("Catalog ID and Access Token are required");
      return;
    }
    setSavingMeta(true);
    try {
      if (metaConn) {
        const { error } = await supabase
          .from("meta_connections")
          .update({ catalog_id: metaCatalogId, access_token: metaAccessToken, page_id: metaPageId, updated_at: new Date().toISOString() } as any)
          .eq("id", metaConn.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("meta_connections")
          .insert({ user_id: userId, catalog_id: metaCatalogId, access_token: metaAccessToken, page_id: metaPageId } as any);
        if (error) throw error;
      }
      toast.success("Meta connection saved!");
      loadConnections();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSavingMeta(false);
    }
  };

  const deleteConnection = async (platform: "etsy" | "ebay" | "meta") => {
    const table = platform === "etsy" ? "etsy_connections" : platform === "ebay" ? "ebay_connections" : "meta_connections";
    const id = platform === "etsy" ? etsyConn?.id : platform === "ebay" ? ebayConn?.id : metaConn?.id;
    if (!id) return;

    try {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
      if (platform === "etsy") { setEtsyConn(null); setEtsyApiKey(""); setEtsyShopId(""); setEtsyShopName(""); }
      else if (platform === "ebay") { setEbayConn(null); setEbayClientId(""); setEbayClientSecret(""); }
      else { setMetaConn(null); setMetaCatalogId(""); setMetaAccessToken(""); setMetaPageId(""); }
      toast.success(`${platform === "etsy" ? "Etsy" : platform === "ebay" ? "eBay" : "Meta"} disconnected`);
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
            <p>API Key: <span className="text-foreground font-mono text-xs">{etsyConn.api_key.slice(0, 8)}…</span></p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect your Etsy shop to push AI-generated listings directly.
              <a href="https://www.etsy.com/developers/your-apps" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary ml-1">
                Get API key <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <div className="grid gap-3">
              <div>
                <Label>API Key (Keystring)</Label>
                <Input value={etsyApiKey} onChange={(e) => setEtsyApiKey(e.target.value)} placeholder="Your Etsy API keystring" />
              </div>
              <div>
                <Label>Shop ID</Label>
                <Input value={etsyShopId} onChange={(e) => setEtsyShopId(e.target.value)} placeholder="e.g. 12345678 or YourShopName" />
              </div>
              <div>
                <Label>Shop Name (optional)</Label>
                <Input value={etsyShopName} onChange={(e) => setEtsyShopName(e.target.value)} placeholder="Display name for your shop" />
              </div>
            </div>
            <Button onClick={saveEtsy} disabled={savingEtsy} className="gap-2">
              {savingEtsy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Connect Etsy
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
          {ebayConn ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-300">
                <Check className="h-3 w-3 mr-1" /> Connected
              </Badge>
              <Button variant="ghost" size="icon" onClick={() => deleteConnection("ebay")}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ) : (
            <Badge variant="secondary">Not connected</Badge>
          )}
        </div>

        {ebayConn ? (
          <div className="text-sm text-muted-foreground">
            <p>Client ID: <span className="text-foreground font-mono text-xs">{ebayConn.client_id.slice(0, 12)}…</span></p>
            <p>Environment: <span className="text-foreground font-medium capitalize">{ebayConn.environment}</span></p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect your eBay account to push listings.
              <a href="https://developer.ebay.com/my/keys" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary ml-1">
                Get credentials <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <div className="grid gap-3">
              <div>
                <Label>Client ID (App ID)</Label>
                <Input value={ebayClientId} onChange={(e) => setEbayClientId(e.target.value)} placeholder="Your eBay Client ID" />
              </div>
              <div>
                <Label>Client Secret (Cert ID)</Label>
                <Input type="password" value={ebayClientSecret} onChange={(e) => setEbayClientSecret(e.target.value)} placeholder="Your eBay Client Secret" />
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
            <Button onClick={saveEbay} disabled={savingEbay} className="gap-2">
              {savingEbay ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Connect eBay
            </Button>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Facebook className="h-5 w-5 text-blue-600" />
            <span className="font-semibold">Meta (Facebook Shop)</span>
          </div>
          {metaConn ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-300">
                <Check className="h-3 w-3 mr-1" /> Connected
              </Badge>
              <Button variant="ghost" size="icon" onClick={() => deleteConnection("meta")}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ) : (
            <Badge variant="secondary">Not connected</Badge>
          )}
        </div>

        {metaConn ? (
          <div className="text-sm text-muted-foreground">
            <p>Catalog ID: <span className="text-foreground font-mono text-xs">{metaConn.catalog_id.slice(0, 12)}…</span></p>
            {metaConn.page_id && <p>Page ID: <span className="text-foreground font-mono text-xs">{metaConn.page_id.slice(0, 12)}…</span></p>}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Push products as drafts to your Facebook Shop catalog.
              <a href="https://business.facebook.com/commerce" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary ml-1">
                Commerce Manager <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <div className="grid gap-3">
              <div>
                <Label>Catalog ID</Label>
                <Input value={metaCatalogId} onChange={(e) => setMetaCatalogId(e.target.value)} placeholder="Your Meta Commerce catalog ID" />
              </div>
              <div>
                <Label>System User Access Token</Label>
                <Input type="password" value={metaAccessToken} onChange={(e) => setMetaAccessToken(e.target.value)} placeholder="Your system user access token" />
              </div>
              <div>
                <Label>Page ID (optional)</Label>
                <Input value={metaPageId} onChange={(e) => setMetaPageId(e.target.value)} placeholder="Facebook Page ID" />
              </div>
            </div>
            <Button onClick={saveMeta} disabled={savingMeta} className="gap-2">
              {savingMeta ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Connect Meta
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
