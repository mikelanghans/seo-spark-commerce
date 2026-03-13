import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FREE_TIER_LIMIT = 20;

// TODO: Replace with your Polar checkout URL when ready
const UPGRADE_URL = "https://polar.sh";

/** Count AI usage this month for a specific user (across all orgs) */
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

/**
 * Per-user AI usage tracking.
 * Each user gets their own pool of FREE_TIER_LIMIT credits per month,
 * regardless of which brand they're working on.
 *
 * @param userId - The authenticated user's id
 * @param organizationId - The org for logging purposes (analytics)
 */
export function useAiUsage(userId: string | null, organizationId?: string | null) {
  const [usedCount, setUsedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchUsage = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    const count = await countUsageForUser(userId);
    setUsedCount(count);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  const canUseAi = usedCount < FREE_TIER_LIMIT;
  const remaining = Math.max(0, FREE_TIER_LIMIT - usedCount);

  const checkAndLog = useCallback(
    async (functionName: string, _userId: string): Promise<boolean> => {
      if (!userId) return false;

      const count = await countUsageForUser(userId);

      if (count >= FREE_TIER_LIMIT) {
        toast.error("AI generation limit reached", {
          description: `You've used all ${FREE_TIER_LIMIT} free AI generations this month.`,
          duration: 8000,
          action: {
            label: "Upgrade to Pro",
            onClick: () => window.open(UPGRADE_URL, "_blank"),
          },
        });
        setUsedCount(count);
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

  return { usedCount, remaining, limit: FREE_TIER_LIMIT, canUseAi, loading, checkAndLog, logUsage, refetch: fetchUsage };
}
