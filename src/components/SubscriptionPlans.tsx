import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TIER_CONFIG } from "@/hooks/useSubscription";
import { Loader2, Check, Crown, Zap, Sparkles, Gift } from "lucide-react";

interface SubscriptionPlansProps {
  currentTier: "free" | "starter" | "pro";
  isFf: boolean;
  onRefresh: () => Promise<void>;
}

export function SubscriptionPlans({ currentTier, isFf, onRefresh }: SubscriptionPlansProps) {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [showFfInput, setShowFfInput] = useState(false);
  const [ffCode, setFfCode] = useState("");
  const [redeemingCode, setRedeemingCode] = useState(false);

  const handleSubscribe = async (tier: "starter" | "pro") => {
    setLoadingTier(tier);
    try {
      const priceId = TIER_CONFIG[tier].priceId;
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { pack: null, priceId, mode: "subscription" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) window.open(data.url, "_blank");
    } catch (err: any) {
      toast.error("Failed to start checkout: " + err.message);
    } finally {
      setLoadingTier(null);
    }
  };

  const handleManage = async () => {
    setLoadingTier("manage");
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) window.open(data.url, "_blank");
    } catch (err: any) {
      toast.error("Failed to open portal: " + err.message);
    } finally {
      setLoadingTier(null);
    }
  };

  const handleRedeemCode = async () => {
    if (!ffCode.trim()) return;
    setRedeemingCode(true);
    try {
      const { data, error } = await supabase.functions.invoke("redeem-ff-code", {
        body: { code: ffCode.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Invite code redeemed! You now have Pro access.");
      setFfCode("");
      setShowFfInput(false);
      await onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRedeemingCode(false);
    }
  };

  const tiers = [
    {
      key: "free" as const,
      icon: Sparkles,
      features: ["25 AI credits/month", "Products & AI messages", "Basic design generation"],
      equivalents: ["~6 product generations", "~12 SEO descriptions", "~3 full workflows"],
    },
    {
      key: "starter" as const,
      icon: Zap,
      features: ["175 AI credits/month", "AI SEO listings", "Color variant mockups", "Social posts & calendar", "Bulk upload / CSV import", "24h email support"],
      equivalents: ["~40 product generations", "~80 SEO descriptions", "~25 full workflows"],
    },
    {
      key: "pro" as const,
      icon: Crown,
      features: ["700 AI credits/month", "Everything in Starter", "Autopilot pipeline", "Shopify sync & push", "Marketplace push (Etsy/eBay/Meta)", "Team collaboration", "12h priority support"],
      equivalents: ["~160 product generations", "~400+ outputs", "~100 full workflows"],
    },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-foreground">Subscription Plans</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {tiers.map(({ key, icon: Icon, features, equivalents }) => {
          const config = TIER_CONFIG[key];
          const isCurrent = currentTier === key;
          const isRecommended = key === "starter";
          return (
            <div
              key={key}
              className={`relative flex flex-col rounded-lg border p-5 transition-all ${
                isCurrent
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : isRecommended
                  ? "border-primary/50 bg-primary/[0.03] ring-1 ring-primary/10"
                  : "border-border bg-card hover:border-primary/30"
              }`}
            >
              {isRecommended && !isCurrent && (
                <span className="absolute -top-2.5 right-3 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                  Most Popular
                </span>
              )}
              {isCurrent && (
                <span className="absolute -top-2.5 left-3 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                  {isFf ? "F&F" : "Current"}
                </span>
              )}
              <div className="flex items-center gap-2 mb-3">
                <Icon className="h-4 w-4 text-primary" />
                <span className="font-semibold text-foreground">{config.name}</span>
              </div>
              <div className="text-2xl font-bold text-foreground mb-4">{config.price}</div>
              <ul className="space-y-2 mb-3">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="rounded-lg bg-muted/50 border border-border/50 px-3 py-2.5 mb-auto pb-5 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">That's roughly</p>
                {equivalents.map((eq) => (
                  <p key={eq} className="text-xs text-foreground/80">{eq}</p>
                ))}
              </div>
              {isCurrent ? (
                currentTier !== "free" && !isFf ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={handleManage}
                    disabled={loadingTier !== null}
                  >
                    {loadingTier === "manage" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Manage"}
                  </Button>
                ) : null
              ) : key !== "free" ? (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => handleSubscribe(key)}
                  disabled={loadingTier !== null || isFf}
                >
                  {loadingTier === key ? <Loader2 className="h-3 w-3 animate-spin" /> : "Subscribe"}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* F&F Code */}
      {!isFf && currentTier === "free" && (
        <div className="pt-2">
          {showFfInput ? (
            <div className="flex gap-2">
              <Input
                placeholder="Enter invite code"
                value={ffCode}
                onChange={(e) => setFfCode(e.target.value)}
                className="flex-1"
              />
              <Button size="sm" onClick={handleRedeemCode} disabled={redeemingCode || !ffCode.trim()}>
                {redeemingCode ? <Loader2 className="h-3 w-3 animate-spin" /> : "Redeem"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowFfInput(false)}>✕</Button>
            </div>
          ) : (
            <button
              onClick={() => setShowFfInput(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Gift className="h-3 w-3" />
              Have an invite code?
            </button>
          )}
        </div>
      )}
    </div>
  );
}
