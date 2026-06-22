import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FREE_TIER_LIMIT = 25;

async function countUsageForUser(userId: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count } = await (supabase as any)
    .from("ai_usage_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfMonth.toISOString());

  return count ?? 0;
}

async function getPurchasedCredits(userId: string): Promise<number> {
  const { data } = await (supabase as any)
    .from("user_credits")
    .select("credits")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.credits ?? 0;
}

export function useAiUsage(userId: string | null, organizationId?: string | null, subscriptionCreditsLimit?: number) {
  const [usedCount, setUsedCount] = useState(0);
  const [purchasedCredits, setPurchasedCredits] = useState(0);
  const [loading, setLoading] = useState(true);

  const subscriptionLoaded = subscriptionCreditsLimit !== undefined;
  const tierLimit = subscriptionCreditsLimit ?? FREE_TIER_LIMIT;

  const fetchUsage = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    const [count, purchased] = await Promise.all([
      countUsageForUser(userId),
      getPurchasedCredits(userId),
    ]);
    setUsedCount(count);
    setPurchasedCredits(purchased);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  const totalLimit = tierLimit + purchasedCredits;
  const canUseAi = usedCount < totalLimit;
  const remaining = Math.max(0, totalLimit - usedCount);

  const checkAndLog = useCallback(
    async (functionName: string, _userId: string): Promise<boolean> => {
      if (!userId) return false;

      const [count, purchased] = await Promise.all([
        countUsageForUser(userId),
        getPurchasedCredits(userId),
      ]);
      const limit = tierLimit + purchased;

      if (count >= limit) {
        toast.error("AI generation limit reached", {
          description: `You've used all ${limit} AI generations this month.`,
          duration: 8000,
          action: {
            label: "Upgrade",
            onClick: () => {
              // Scroll to subscription plans or open settings
            },
          },
        });
        setUsedCount(count);
        setPurchasedCredits(purchased);
        return false;
      }

      // Only warn when credits are genuinely low (≤10) AND subscription tier is loaded
      const remaining = limit - count;
      if (subscriptionLoaded && remaining <= 10 && remaining > 0) {
        toast.warning("You're running low on AI credits", {
          description: `Only ${remaining} of ${limit} credits left — don't interrupt your workflow. Top up now!`,
          duration: 6000,
        });
      }

      return true;
    },
    [userId, tierLimit, subscriptionLoaded]
  );

  const logUsage = useCallback(
    async (_functionName: string, _userId: string) => {
      if (!userId || !organizationId) return;

      // NOTE: Server-side `deductCredits` in edge functions is the authoritative
      // writer to `ai_usage_log`. We only update local state here to refresh UI
      // without double-counting against the user's monthly subscription quota.
      setUsedCount((prev) => {
        const newUsed = prev + 1;
        const limit = tierLimit + purchasedCredits;
        const left = Math.max(0, limit - newUsed);

        if (left === 0) {
          toast.warning("You've used all your AI credits!", {
            description: "Purchase more credits or upgrade your plan to continue.",
            duration: 8000,
          });
        } else if (left <= 3) {
          toast.warning(`Only ${left} AI credit${left === 1 ? "" : "s"} remaining`, {
            description: "Consider topping up soon.",
            duration: 5000,
          });
        } else if (left <= 10) {
          toast.info(`${left} AI credits remaining`, { duration: 3000 });
        }

        return newUsed;
      });
    },
    [userId, organizationId, tierLimit, purchasedCredits]
  );

  return { usedCount, remaining, limit: totalLimit, canUseAi, loading, checkAndLog, logUsage, refetch: fetchUsage, purchasedCredits };
}
