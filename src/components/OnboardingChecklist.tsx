import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Check, Building2, Package, Store, Sparkles, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  completed: boolean;
  action?: () => void;
  actionLabel?: string;
}

interface OnboardingChecklistProps {
  userId: string;
  onNavigate: (target: string) => void;
}

export function OnboardingChecklist({ userId, onNavigate }: OnboardingChecklistProps) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("brand_aura_checklist_dismissed") === "1");

  useEffect(() => {
    if (dismissed) return;
    checkProgress();
  }, [userId, dismissed]);

  const checkProgress = async () => {
    setLoading(true);
    try {
      const [orgsRes, productsRes, shopifyRes, listingsRes] = await Promise.all([
        supabase.from("organizations").select("id").is("deleted_at", null).limit(1),
        supabase.from("products").select("id").limit(1),
        supabase.from("shopify_connections").select("id").eq("user_id", userId).limit(1),
        supabase.from("listings").select("id").limit(1),
      ]);

      const hasBrand = (orgsRes.data?.length ?? 0) > 0;
      const hasProduct = (productsRes.data?.length ?? 0) > 0;
      const hasMarketplace = (shopifyRes.data?.length ?? 0) > 0;
      const hasListing = (listingsRes.data?.length ?? 0) > 0;

      setItems([
        {
          id: "brand",
          label: "Create your first brand",
          description: "Set up your brand name, niche, tone, and audience to power AI content.",
          icon: <Building2 className="h-4 w-4" />,
          completed: hasBrand,
          action: () => onNavigate("org-form"),
          actionLabel: "Create Brand",
        },
        {
          id: "product",
          label: "Add your first product",
          description: "Add a product with title, description, and image for AI to work with.",
          icon: <Package className="h-4 w-4" />,
          completed: hasProduct,
          action: () => onNavigate("product-form"),
          actionLabel: "Add Product",
        },
        {
          id: "listing",
          label: "Generate AI listings",
          description: "Create SEO-optimized marketplace listings with one click.",
          icon: <Sparkles className="h-4 w-4" />,
          completed: hasListing,
        },
        {
          id: "marketplace",
          label: "Connect a marketplace",
          description: "Link your Shopify store to push products directly.",
          icon: <Store className="h-4 w-4" />,
          completed: hasMarketplace,
          action: () => onNavigate("settings"),
          actionLabel: "Connect Store",
        },
      ]);
    } catch (err) {
      console.error("Checklist check failed:", err);
    } finally {
      setLoading(false);
    }
  };

  if (dismissed || loading) return null;

  const completedCount = items.filter((i) => i.completed).length;
  const allDone = completedCount === items.length;
  const progressPct = items.length > 0 ? (completedCount / items.length) * 100 : 0;

  if (allDone) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Get Started</h3>
            <p className="text-xs text-muted-foreground">{completedCount} of {items.length} complete</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-24">
            <Progress value={progressPct} className="h-1.5" />
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => {
              localStorage.setItem("brand_aura_checklist_dismissed", "1");
              setDismissed(true);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Steps */}
      {!collapsed && (
        <div className="border-t border-border divide-y divide-border">
          {items.map((item) => (
            <div key={item.id} className={`flex items-center gap-3 px-5 py-3 transition-colors ${item.completed ? "opacity-60" : ""}`}>
              <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                item.completed
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/30"
              }`}>
                {item.completed && <Check className="h-3.5 w-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${item.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {item.label}
                </p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              {!item.completed && item.action && (
                <Button variant="outline" size="sm" onClick={item.action} className="shrink-0 text-xs h-7">
                  {item.actionLabel}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
