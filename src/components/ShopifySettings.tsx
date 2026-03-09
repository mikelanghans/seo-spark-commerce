import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Store, Loader2, Check, Trash2, ExternalLink, KeyRound } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string;
}

const REQUIRED_SCOPES = "write_products,read_products,write_files,read_files";

export const ShopifySettings = ({ userId }: Props) => {
  const [storeDomain, setStoreDomain] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [existing, setExisting] = useState<{ id: string; store_domain: string; has_token: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);

  useEffect(() => {
    loadConnection();
  }, []);

  // Listen for OAuth callback messages
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "shopify-oauth-callback" && event.data?.code) {
        setAuthorizing(true);
        try {
          const { data, error } = await supabase.functions.invoke("shopify-oauth-callback", {
            body: { code: event.data.code, storeDomain: storeDomain },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          toast.success("Shopify connected successfully!");
          await loadConnection();
        } catch (err: any) {
          toast.error(err.message || "OAuth failed");
        } finally {
          setAuthorizing(false);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [storeDomain]);

  // Also check URL params for OAuth callback (redirect-based)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const shop = params.get("shop");
    if (code && shop) {
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
      setAuthorizing(true);
      supabase.functions.invoke("shopify-oauth-callback", {
        body: { code, storeDomain: shop },
      }).then(({ data, error }) => {
        if (error || data?.error) {
          toast.error(data?.error || error?.message || "OAuth failed");
        } else {
          toast.success("Shopify connected successfully!");
          loadConnection();
        }
        setAuthorizing(false);
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
      const row = data as any;
      setExisting({
        id: data.id,
        store_domain: data.store_domain,
        has_token: !!data.access_token && data.access_token.length > 0,
      });
      setStoreDomain(data.store_domain);
      if (row.client_id) setClientId(row.client_id);
      if (row.client_secret) setClientSecret(row.client_secret);
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
          } as any)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shopify_connections").insert({
          user_id: userId,
          store_domain: domain,
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
          access_token: "",
        } as any);
        if (error) throw error;
      }
      setStoreDomain(domain);
      toast.success("Credentials saved! Now click 'Authorize' to connect.");
      await loadConnection();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleAuthorize = () => {
    const domain = storeDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const redirectUri = window.location.origin + "/";
    const authUrl = `https://${domain}/admin/oauth/authorize?client_id=${clientId}&scope=${REQUIRED_SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    window.location.href = authUrl;
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

  if (loading || authorizing) {
    return (
      <div className="flex items-center justify-center py-8 gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        {authorizing && <span className="text-sm text-muted-foreground">Connecting to Shopify...</span>}
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

      {existing && !existing.has_token && (
        <div className="flex items-center gap-2 rounded-lg bg-yellow-500/10 px-3 py-2 text-sm text-yellow-600">
          <KeyRound className="h-4 w-4" />
          Credentials saved — click "Authorize" to complete connection
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
            placeholder="Paste your Client ID"
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Client Secret</Label>
          <Input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="Paste your Client Secret"
            required
          />
          <p className="text-xs text-muted-foreground">
            Find these in your{" "}
            <a href="https://partners.shopify.com" target="_blank" rel="noopener noreferrer" className="underline">
              Shopify Partners dashboard
            </a>{" "}
            → Apps → your app → Client credentials.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save Credentials
          </Button>
          {existing && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleAuthorize}
                disabled={!existing || existing.has_token}
                className="gap-2"
              >
                <ExternalLink className="h-4 w-4" /> Authorize
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleDisconnect}
                className="gap-2 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" /> Disconnect
              </Button>
            </>
          )}
        </div>
      </form>
    </div>
  );
};
