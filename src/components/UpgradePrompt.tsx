import { Lock, Zap, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type AppFeature, requiredTier, FEATURE_LABELS } from "@/lib/featureGates";

interface UpgradePromptProps {
  feature: AppFeature;
  onUpgrade: () => void;
}

export function UpgradePrompt({ feature, onUpgrade }: UpgradePromptProps) {
  const tier = requiredTier(feature);
  const label = FEATURE_LABELS[feature];
  const TierIcon = tier === "pro" ? Crown : Zap;
  const tierName = tier === "pro" ? "Pro" : "Starter";
  const tierPrice = tier === "pro" ? "$29/mo" : "$9/mo";

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center space-y-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
        <Lock className="h-6 w-6 text-primary" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold text-foreground">{label}</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          This feature is available on the{" "}
          <span className="font-medium text-foreground">{tierName}</span> plan and above.
        </p>
      </div>
      <Button onClick={onUpgrade} className="gap-2">
        <TierIcon className="h-4 w-4" />
        Upgrade to {tierName} — {tierPrice}
      </Button>
    </div>
  );
}
