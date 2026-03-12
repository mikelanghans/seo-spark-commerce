import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FREE_TIER_LIMIT = 5;

export function useAiUsage(organizationId: string | null) {
  const [usedCount, setUsedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchUsage = useCallback(async () => {
    if (!organizationId) { setLoading(false); return; }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count, error } = await supabase
      .from("ai_usage_log")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", startOfMonth.toISOString());

    if (!error) setUsedCount(count ?? 0);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  const canUseAi = usedCount < FREE_TIER_LIMIT;
  const remaining = Math.max(0, FREE_TIER_LIMIT - usedCount);

  const checkAndLog = useCallback(
    async (functionName: string, userId: string): Promise<boolean> => {
      if (!organizationId) return false;

      // Re-check fresh count
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count } = await supabase
        .from("ai_usage_log")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("created_at", startOfMonth.toISOString());

      if ((count ?? 0) >= FREE_TIER_LIMIT) {
        toast.error("AI generation limit reached", {
          description: `You've used all ${FREE_TIER_LIMIT} free AI generations this month. Upgrade to Pro for unlimited access.`,
          duration: 8000,
        });
        setUsedCount(count ?? 0);
        return false;
      }

      return true;
    },
    [organizationId]
  );

  const logUsage = useCallback(
    async (functionName: string, userId: string) => {
      if (!organizationId) return;
      await supabase.from("ai_usage_log").insert({
        organization_id: organizationId,
        user_id: userId,
        function_name: functionName,
      });
      setUsedCount((prev) => prev + 1);
    },
    [organizationId]
  );

  return { usedCount, remaining, limit: FREE_TIER_LIMIT, canUseAi, loading, checkAndLog, logUsage, refetch: fetchUsage };
}
