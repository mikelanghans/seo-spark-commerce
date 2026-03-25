import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, RefreshCw, Check, X, Loader2, TrendingDown, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface QueueItem {
  id: string;
  product_id: string;
  organization_id: string;
  reason: string;
  sales_current: number;
  sales_previous: number;
  velocity_drop_pct: number;
  status: string;
  created_at: string;
  product?: { title: string; id: string };
}

interface Props {
  organizationId: string;
  userId: string;
}

export const ListingRefreshQueue = ({ organizationId, userId }: Props) => {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  useEffect(() => {
    loadQueue();
  }, [organizationId]);

  const loadQueue = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("listing_refresh_queue")
      .select("*, product:products(id, title)")
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .order("velocity_drop_pct", { ascending: true });

    setItems((data as any) || []);
    setLoading(false);
  };

  const runHealthCheck = async () => {
    setScanning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("check-listing-health", {
        body: { organizationId },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });
      if (error) throw error;
      toast.success(data.message || "Health check complete");
      await loadQueue();
    } catch (err: any) {
      toast.error(err.message || "Health check failed");
    } finally {
      setScanning(false);
    }
  };

  const handleRegenerate = async (item: QueueItem) => {
    setRegeneratingId(item.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Call generate-listings to create fresh SEO metadata
      const { data, error } = await supabase.functions.invoke("generate-listings", {
        body: {
          productId: item.product_id,
          organizationId,
          refresh: true,
        },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });

      if (error) throw error;

      // Mark as regenerated (pending review before push)
      await supabase
        .from("listing_refresh_queue")
        .update({ status: "regenerated", reviewed_at: new Date().toISOString() })
        .eq("id", item.id);

      toast.success(`New listings generated for "${item.product?.title}" — review in Products tab before pushing`);
      await loadQueue();
    } catch (err: any) {
      toast.error(err.message || "Regeneration failed");
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleDismiss = async (id: string) => {
    await supabase
      .from("listing_refresh_queue")
      .update({ status: "dismissed", reviewed_at: new Date().toISOString() })
      .eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success("Dismissed");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-destructive" />
            Listing Auto-Replenish
          </h3>
          <p className="text-xs text-muted-foreground">
            Products with declining Shopify sales velocity are flagged for SEO refresh
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={runHealthCheck}
          disabled={scanning}
          className="gap-2"
        >
          {scanning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Scan Now
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center">
          <Check className="mx-auto h-8 w-8 text-green-500 mb-2" />
          <p className="text-sm font-medium">All listings are healthy</p>
          <p className="text-xs text-muted-foreground mt-1">
            No products show declining sales velocity. Click "Scan Now" to run a fresh check.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {item.product?.title || "Unknown product"}
                </p>
                <p className="text-xs text-muted-foreground">{item.reason}</p>
              </div>
              <Badge
                variant="secondary"
                className="shrink-0 text-destructive bg-destructive/10"
              >
                {item.velocity_drop_pct}%
              </Badge>
              <div className="flex gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="default"
                  className="gap-1.5"
                  disabled={regeneratingId === item.id}
                  onClick={() => handleRegenerate(item)}
                >
                  {regeneratingId === item.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Regenerate
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDismiss(item.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
