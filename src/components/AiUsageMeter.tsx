import { Sparkles, ChevronDown, ChevronUp, Info } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { CreditPackPurchase } from "@/components/CreditPackPurchase";
import { useState } from "react";

interface AiUsageMeterProps {
  used: number;
  limit: number;
  loading?: boolean;
}

const CREDIT_ACTIONS = [
  { action: "Generate Listing", cost: 1 },
  { action: "Generate Design", cost: 1 },
  { action: "Generate Mockup", cost: 1 },
  { action: "Social Media Post", cost: 1 },
  { action: "Social Image", cost: 1 },
  { action: "Color Variants", cost: 1 },
  { action: "AI Product Analysis", cost: 1 },
  { action: "Marketing Messages", cost: 1 },
];

export function AiUsageMeter({ used, limit, loading }: AiUsageMeterProps) {
  const [showPacks, setShowPacks] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

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

      <button
        onClick={() => setShowBreakdown(!showBreakdown)}
        className="flex w-full items-center gap-1.5 px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Info className="w-3 h-3" />
        <span>What costs credits?</span>
        {showBreakdown ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
      </button>

      {showBreakdown && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">1 action = 1 credit</p>
          <div className="space-y-1">
            {CREDIT_ACTIONS.map((item) => (
              <div key={item.action} className="flex items-center justify-between text-xs">
                <span className="text-foreground">{item.action}</span>
                <span className="text-muted-foreground font-medium">{item.cost} credit</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
