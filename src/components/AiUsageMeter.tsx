import { Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { CreditPackPurchase } from "@/components/CreditPackPurchase";
import { useState } from "react";

interface AiUsageMeterProps {
  used: number;
  limit: number;
  loading?: boolean;
}

export function AiUsageMeter({ used, limit, loading }: AiUsageMeterProps) {
  const [showPacks, setShowPacks] = useState(false);

  if (loading) return null;

  const pct = Math.min(100, (used / limit) * 100);
  const remaining = Math.max(0, limit - used);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setShowPacks(!showPacks)}
        className="flex w-full items-center gap-3 px-3 py-2 rounded-lg bg-muted/50 border border-border hover:bg-muted/80 transition-colors text-left"
      >
        <Sparkles className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">AI Credits</span>
            <span className="font-medium text-foreground">
              {remaining} left
            </span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>
      </button>
      {showPacks && <CreditPackPurchase />}
    </div>
  );
}
