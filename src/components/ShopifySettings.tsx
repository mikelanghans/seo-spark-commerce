import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Store, Loader2, Check, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string;
}

export const ShopifySettings = ({ userId }: Props) => {
  const [storeDomain, setStoreDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [existing, setExisting] = useState<{ id: string; store_domain: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConnection();
  }, []);

  const loadConnection = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("shopify_connections")
      .select("id, store_domain")
      .eq("user_id", userId)
      .maybeSingle();
    if (data) {
      setExisting(data);
      setStoreDomain(data.store_domain);
      setAccessToken("");
    }
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeDomain.trim() || (!existing && !accessToken.trim())) {
      toast.error("Please fill in all fields");
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        const updateData: Record<string, string> = { store_domain: storeDomain.trim() };
        if (accessToken.trim()) updateData.access_token = accessToken.trim();
        const { error } = await supabase
          .from("shopify_connections")
          .update(updateData)
          .eq("id", existing.id);
        if (error) throw error;
        toast.success("Shopify connection updated!");
      } else {
        const { error } = await supabase.from("shopify_connections").insert({
          user_id: userId,
          store_domain: storeDomain.trim(),
          access_token: accessToken.trim(),
        });
        if (error) throw error;
        toast.success("Shopify connected!");
      }
      setAccessToken("");
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
      <div className="flex items-center justify-center py-8">
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

      {existing && (
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
          <p className="text-xs text-muted-foreground">
            e.g. your-store.myshopify.com
          </p>
        </div>
        <div className="space-y-2">
          <Label>{existing ? "Access Token (leave blank to keep current)" : "Admin API Access Token"}</Label>
          <Input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder={existing ? "••••••••" : "shpat_..."}
            required={!existing}
          />
          <p className="text-xs text-muted-foreground">
            Create a custom app in your Shopify admin → Settings → Apps → Develop apps.
            Required scopes: <code className="rounded bg-secondary px-1">write_products</code>,{" "}
            <code className="rounded bg-secondary px-1">read_products</code>,{" "}
            <code className="rounded bg-secondary px-1">write_files</code>,{" "}
            <code className="rounded bg-secondary px-1">read_files</code>.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {existing ? "Update" : "Connect"}
          </Button>
          {existing && (
            <Button type="button" variant="outline" onClick={handleDisconnect} className="gap-2 text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" /> Disconnect
            </Button>
          )}
        </div>
      </form>
    </div>
  );
};
