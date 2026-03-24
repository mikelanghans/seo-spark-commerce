export type AppFeature =
  | "ai-listings"
  | "color-variants"
  | "social-posts"
  | "bulk-upload"
  | "content-calendar"
  | "autopilot"
  | "shopify-sync"
  | "marketplace-push"
  | "team-collaboration"
  | "shopify-enrich";

type Tier = "free" | "starter" | "pro";

const FEATURE_TIERS: Record<AppFeature, Tier> = {
  "ai-listings": "starter",
  "color-variants": "starter",
  "social-posts": "starter",
  "bulk-upload": "starter",
  "content-calendar": "starter",
  "shopify-enrich": "starter",
  "autopilot": "pro",
  "shopify-sync": "pro",
  "marketplace-push": "pro",
  "team-collaboration": "pro",
};

const TIER_RANK: Record<Tier, number> = { free: 0, starter: 1, pro: 2 };

export function canAccess(userTier: Tier, feature: AppFeature): boolean {
  const requiredTier = FEATURE_TIERS[feature];
  return TIER_RANK[userTier] >= TIER_RANK[requiredTier];
}

export function requiredTier(feature: AppFeature): Tier {
  return FEATURE_TIERS[feature];
}

export const FEATURE_LABELS: Record<AppFeature, string> = {
  "ai-listings": "AI Listings",
  "color-variants": "Color Variant Mockups",
  "social-posts": "Social Post Generator",
  "bulk-upload": "Bulk Upload",
  "content-calendar": "Content Calendar",
  "shopify-enrich": "Shopify Enrich",
  "autopilot": "Autopilot Pipeline",
  "shopify-sync": "Shopify Sync & Push",
  "marketplace-push": "Marketplace Push",
  "team-collaboration": "Team Collaboration",
};
