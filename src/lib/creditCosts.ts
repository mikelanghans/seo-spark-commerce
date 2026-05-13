/**
 * Credit costs per AI action — mirrors the edge function costs.
 * Used by the frontend to display costs to users.
 */
export const CREDIT_COSTS: Record<string, { cost: number; label: string }> = {
  "analyze-product": { cost: 1, label: "Product Analysis" },
  "recommend-colors": { cost: 1, label: "Color Recommendations" },
  "suggest-pricing": { cost: 1, label: "Pricing Analysis" },
  "check-listing-health": { cost: 1, label: "Listing Health Check" },
  "generate-social-posts": { cost: 1, label: "Social Posts" },
  "generate-messages": { cost: 2, label: "Message Generation" },
  "generate-listings": { cost: 2, label: "Marketplace Listings" },
  "generate-color-variants": { cost: 2, label: "Color Variant (per color)" },
  "generate-design-standard": { cost: 4, label: "Design Generation (Standard)" },
  "generate-design": { cost: 8, label: "Design Generation (Pro)" },
  "generate-dark-design-standard": { cost: 2, label: "Dark Variant (Standard)" },
  "generate-dark-design": { cost: 5, label: "Dark Variant (Pro)" },
  "generate-mockup": { cost: 3, label: "Mockup Generation" },
  "generate-social-image": { cost: 3, label: "Social Image" },
};
