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
  const [shopifyConnected, setShopifyConnected] = useState<boolean | null>(null);

  // Check if Shopify is connected before attempting to fetch
  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from("shopify_connections")
      .select("id, access_token")
      .eq("organization_id", organizationId)
      .maybeSingle()
      .then(({ data: conn }) => setShopifyConnected(!!conn?.access_token));
  }, [organizationId]);

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
      // Only show toast if this was a manual refresh, not auto-fetch
      if (data) {
        toast.error("Failed to load Shopify collections");
      }
    } finally {
      setLoading(false);
    }
  }, [organizationId, data]);

  // Auto-fetch only if Shopify is connected and no cached data
  useEffect(() => {
    if (organizationId && shopifyConnected === true && !data && !loading) {
      fetchMemberships();
    }
  }, [organizationId, shopifyConnected, data, loading, fetchMemberships]);

  return { data, loading, lastFetched, refresh: fetchMemberships, shopifyConnected };
}
