import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SubscriptionState {
  subscribed: boolean;
  tier: "free" | "starter" | "pro";
  creditsLimit: number;
  subscriptionEnd: string | null;
  isFf: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

export const TIER_CONFIG = {
  free: { name: "Free", credits: 50, price: "$0" },
  starter: { name: "Starter", credits: 200, price: "$9/mo", priceId: "price_1TEdLUJJmvlin3UXUBU44XE8", productId: "prod_UD3S6uDlK4MVKO" },
  pro: { name: "Pro", credits: 1000, price: "$29/mo", priceId: "price_1TEdLrJJmvlin3UX00I7FbQX", productId: "prod_UD3SXkUfbBbDNn" },
} as const;

export function useSubscription(userId: string | null) {
  const [state, setState] = useState<Omit<SubscriptionState, "refresh" | "loading">>({
    subscribed: false,
    tier: "free",
    creditsLimit: 50,
    subscriptionEnd: null,
    isFf: false,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setState({
        subscribed: data.subscribed ?? false,
        tier: (data.tier as "free" | "starter" | "pro") ?? "free",
        creditsLimit: data.credits_limit ?? 50,
        subscriptionEnd: data.subscription_end ?? null,
        isFf: data.is_ff ?? false,
      });
    } catch (e) {
      console.error("check-subscription error:", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-refresh every 60s
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [userId, refresh]);

  return { ...state, loading, refresh };
}
