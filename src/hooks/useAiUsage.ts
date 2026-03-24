import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FREE_TIER_LIMIT = 50;

const UPGRADE_URL = "https://polar.sh";

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

export function useAiUsage(userId: string | null, organizationId?: string | null) {
  const [usedCount, setUsedCount] = useState(0);
  const [purchasedCredits, setPurchasedCredits] = useState(0);
  const [loading, setLoading] = useState(true);

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

  const totalLimit = FREE_TIER_LIMIT + purchasedCredits;
  const canUseAi = usedCount < totalLimit;
  const remaining = Math.max(0, totalLimit - usedCount);

  const checkAndLog = useCallback(
    async (functionName: string, _userId: string): Promise<boolean> => {
      if (!userId) return false;

      const [count, purchased] = await Promise.all([
        countUsageForUser(userId),
        getPurchasedCredits(userId),
      ]);
      const limit = FREE_TIER_LIMIT + purchased;

      if (count >= limit) {
        toast.error("AI generation limit reached", {
          description: `You've used all ${limit} AI generations this month.`,
          duration: 8000,
          action: {
            label: "Buy Credits",
            onClick: () => window.open(UPGRADE_URL, "_blank"),
          },
        });
        setUsedCount(count);
        setPurchasedCredits(purchased);
        return false;
      }

      return true;
    },
    [userId]
  );

  const logUsage = useCallback(
    async (functionName: string, _userId: string) => {
      if (!userId || !organizationId) return;

      await (supabase as any).from("ai_usage_log").insert({
        organization_id: organizationId,
        user_id: userId,
        function_name: functionName,
      });
      setUsedCount((prev) => prev + 1);
    },
    [userId, organizationId]
  );

  return { usedCount, remaining, limit: totalLimit, canUseAi, loading, checkAndLog, logUsage, refetch: fetchUsage, purchasedCredits };
}
