import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Zap, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const PACKS = [
  { id: "10", credits: 10, price: "$3", label: "Starter", icon: Sparkles, popular: false },
  { id: "50", credits: 50, price: "$10", label: "Popular", icon: Zap, popular: true },
  { id: "200", credits: 200, price: "$29", label: "Pro", icon: Crown, popular: false },
] as const;

export function CreditPackPurchase() {
  const [loadingPack, setLoadingPack] = useState<string | null>(null);

  const handlePurchase = async (packId: string) => {
    setLoadingPack(packId);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { pack: packId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (err: any) {
      toast.error("Failed to start checkout: " + err.message);
    } finally {
      setLoadingPack(null);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">Get More AI Credits</h3>
      <div className="grid grid-cols-3 gap-2">
        {PACKS.map((pack) => {
          const Icon = pack.icon;
          return (
            <button
              key={pack.id}
              onClick={() => handlePurchase(pack.id)}
              disabled={loadingPack !== null}
              className={`relative flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all hover:border-primary/50 hover:bg-accent/50 disabled:opacity-50 ${
                pack.popular
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card"
              }`}
            >
              {pack.popular && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                  Best Value
                </span>
              )}
              {loadingPack === pack.id ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <Icon className="h-4 w-4 text-primary" />
              )}
              <span className="text-lg font-bold text-foreground">{pack.credits}</span>
              <span className="text-xs text-muted-foreground">{pack.price}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
