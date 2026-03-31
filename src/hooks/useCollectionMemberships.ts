import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ShopifyCollection {
  id: number;
  title: string;
  handle: string;
  collection_type: "custom" | "smart";
  image?: { src: string } | null;
}

export interface CollectionMembershipData {
  collections: ShopifyCollection[];
  /** Map of collection ID → array of Shopify product IDs */
  memberships: Record<string, number[]>;
}

const CACHE_KEY_PREFIX = "collection_memberships_";
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

export function useCollectionMemberships(organizationId: string | undefined) {
  const [data, setData] = useState<CollectionMembershipData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<number | null>(null);

  // Load from cache on mount
  useEffect(() => {
    if (!organizationId) return;
    const cacheKey = CACHE_KEY_PREFIX + organizationId;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.ts && Date.now() - parsed.ts < CACHE_TTL) {
          setData(parsed.data);
          setLastFetched(parsed.ts);
        }
      }
    } catch { /* ignore */ }
  }, [organizationId]);

  const fetchMemberships = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke(
        "fetch-shopify-collection-memberships",
        { body: { organizationId } }
      );
      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      const membershipData: CollectionMembershipData = {
        collections: result.collections || [],
        memberships: result.memberships || {},
      };
      setData(membershipData);
      const now = Date.now();
      setLastFetched(now);

      // Cache
      const cacheKey = CACHE_KEY_PREFIX + organizationId;
      localStorage.setItem(cacheKey, JSON.stringify({ data: membershipData, ts: now }));
    } catch (err: any) {
      console.error("Failed to fetch collection memberships:", err);
      toast.error("Failed to load Shopify collections");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  // Auto-fetch if no cached data
  useEffect(() => {
    if (organizationId && !data && !loading) {
      fetchMemberships();
    }
  }, [organizationId, data, loading, fetchMemberships]);

  return { data, loading, lastFetched, refresh: fetchMemberships };
}
