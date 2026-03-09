import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Store, Loader2, Check, Trash2, KeyRound } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string;
}

export const ShopifySettings = ({ userId }: Props) => {
  const [storeDomain, setStoreDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [existing, setExisting] = useState<{ id: string; store_domain: string; has_token: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConnection();
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
      });
      setStoreDomain(data.store_domain);
    }
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeDomain.trim() || !accessToken.trim()) {
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
            access_token: accessToken.trim(),
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shopify_connections").insert({
          user_id: userId,
          store_domain: domain,
          access_token: accessToken.trim(),
        });
        if (error) throw error;
      }
      setStoreDomain(domain);
      setAccessToken("");
      toast.success("Shopify connected successfully!");
      await loadConnection();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
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
    setAccessToken("");
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

      <form onSubmit={handleSave} className="space-y-4">
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
          <Label>Admin API Access Token</Label>
          <Input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder={existing?.has_token ? "••••••••  (token saved)" : "Paste your access token"}
            required={!existing?.has_token}
          />
          <p className="text-xs text-muted-foreground">
            Go to your store admin → Settings → Apps and sales channels → Develop apps → Create an app → Configure Admin API scopes → Install → Copy the access token.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {existing?.has_token ? "Update Connection" : "Connect"}
          </Button>
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
