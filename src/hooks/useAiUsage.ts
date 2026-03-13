import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FREE_TIER_LIMIT = 20;

/** Helper: count AI usage this month for a given user's owned orgs */
async function countUsageForUser(userId: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: ownedOrgs } = await supabase
    .from("organizations")
    .select("id")
    .eq("user_id", userId)
    .is("deleted_at", null);

  const orgIds = (ownedOrgs || []).map((o: any) => o.id);
  if (orgIds.length === 0) return 0;

  const { count } = await (supabase as any)
    .from("ai_usage_log")
    .select("*", { count: "exact", head: true })
    .in("organization_id", orgIds)
    .gte("created_at", startOfMonth.toISOString());

  return count ?? 0;
}

/**
 * Account-level AI usage tracking.
 * Credits are pooled across ALL brands owned by the account owner.
 * When a collaborator uses AI on a shared brand, it counts against the brand owner's pool.
 * If the owner's pool is exhausted, collaborators can optionally contribute from their own pool.
 *
 * @param ownerId - The user_id of the brand/org owner (from organizations.user_id)
 * @param organizationId - The specific org for logging purposes (analytics)
 */
export function useAiUsage(ownerId: string | null, organizationId?: string | null) {
  const [usedCount, setUsedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  // Track when a collaborator uses their own credits
  const usedOwnCreditsRef = useRef(false);

  const fetchUsage = useCallback(async () => {
    if (!ownerId) { setLoading(false); return; }
    const count = await countUsageForUser(ownerId);
    setUsedCount(count);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  const canUseAi = usedCount < FREE_TIER_LIMIT;
  const remaining = Math.max(0, FREE_TIER_LIMIT - usedCount);

  const checkAndLog = useCallback(
    async (functionName: string, userId: string): Promise<boolean> => {
      if (!ownerId) return false;
      usedOwnCreditsRef.current = false;

      // 1. Check owner's pool first
      const ownerCount = await countUsageForUser(ownerId);

      if (ownerCount < FREE_TIER_LIMIT) {
        return true; // Owner has credits
      }

      // 2. Owner is exhausted — if the acting user IS the owner, block
      if (userId === ownerId) {
        toast.error("AI generation limit reached", {
          description: `You've used all ${FREE_TIER_LIMIT} free AI generations this month across your brands. Upgrade to Pro for unlimited access.`,
          duration: 8000,
        });
        setUsedCount(ownerCount);
        return false;
      }

      // 3. Acting user is a collaborator — check THEIR own pool
      const collabCount = await countUsageForUser(userId);

      if (collabCount >= FREE_TIER_LIMIT) {
        toast.error("AI generation limit reached", {
          description: `The brand owner's credits are used up, and you've also used all ${FREE_TIER_LIMIT} of your own free AI generations this month.`,
          duration: 8000,
        });
        return false;
      }

      // 4. Collaborator can contribute from their own pool
      usedOwnCreditsRef.current = true;
      toast.info("Using your own AI credits", {
        description: "The brand owner's credits are used up. This generation will count against your personal pool.",
        duration: 5000,
      });
      return true;
    },
    [ownerId]
  );

  const logUsage = useCallback(
    async (functionName: string, userId: string) => {
      if (usedOwnCreditsRef.current) {
        // Log against the collaborator's own org instead of the shared brand
        const { data: ownOrgs } = await supabase
          .from("organizations")
          .select("id")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .limit(1);

        const logOrgId = ownOrgs?.[0]?.id || organizationId;
        if (!logOrgId) return;

        await (supabase as any).from("ai_usage_log").insert({
          organization_id: logOrgId,
          user_id: userId,
          function_name: functionName,
        });
        usedOwnCreditsRef.current = false;
      } else {
        if (!organizationId) return;
        await (supabase as any).from("ai_usage_log").insert({
          organization_id: organizationId,
          user_id: userId,
          function_name: functionName,
        });
        setUsedCount((prev) => prev + 1);
      }
    },
    [organizationId]
  );

  return { usedCount, remaining, limit: FREE_TIER_LIMIT, canUseAi, loading, checkAndLog, logUsage, refetch: fetchUsage };
}
