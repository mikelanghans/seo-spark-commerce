import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FREE_TIER_LIMIT = 20;

/**
 * Account-level AI usage tracking.
 * Credits are pooled across ALL brands owned by the account owner.
 * When a collaborator uses AI on a shared brand, it counts against the brand owner's pool.
 * 
 * @param ownerId - The user_id of the brand/org owner (from organizations.user_id)
 * @param organizationId - The specific org for logging purposes (analytics)
 */
export function useAiUsage(ownerId: string | null, organizationId?: string | null) {
  const [usedCount, setUsedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchUsage = useCallback(async () => {
    if (!ownerId) { setLoading(false); return; }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Get all orgs owned by this account
    const { data: ownedOrgs } = await supabase
      .from("organizations")
      .select("id")
      .eq("user_id", ownerId)
      .is("deleted_at", null);

    const orgIds = (ownedOrgs || []).map((o: any) => o.id);
    if (orgIds.length === 0) { setUsedCount(0); setLoading(false); return; }

    // Count usage across ALL owned orgs (account-level pool)
    const { count, error } = await (supabase as any)
      .from("ai_usage_log")
      .select("*", { count: "exact", head: true })
      .in("organization_id", orgIds)
      .gte("created_at", startOfMonth.toISOString());

    if (!error) setUsedCount(count ?? 0);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  const canUseAi = usedCount < FREE_TIER_LIMIT;
  const remaining = Math.max(0, FREE_TIER_LIMIT - usedCount);

  const checkAndLog = useCallback(
    async (functionName: string, userId: string): Promise<boolean> => {
      if (!ownerId) return false;

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      // Get all orgs owned by the account owner
      const { data: ownedOrgs } = await supabase
        .from("organizations")
        .select("id")
        .eq("user_id", ownerId)
        .is("deleted_at", null);

      const orgIds = (ownedOrgs || []).map((o: any) => o.id);
      if (orgIds.length === 0) return false;

      const { count } = await (supabase as any)
        .from("ai_usage_log")
        .select("*", { count: "exact", head: true })
        .in("organization_id", orgIds)
        .gte("created_at", startOfMonth.toISOString());

      if ((count ?? 0) >= FREE_TIER_LIMIT) {
        toast.error("AI generation limit reached", {
          description: `You've used all ${FREE_TIER_LIMIT} free AI generations this month across your brands. Upgrade to Pro for unlimited access.`,
          duration: 8000,
        });
        setUsedCount(count ?? 0);
        return false;
      }

      return true;
    },
    [ownerId]
  );

  const logUsage = useCallback(
    async (functionName: string, userId: string) => {
      if (!organizationId) return;
      await (supabase as any).from("ai_usage_log").insert({
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
