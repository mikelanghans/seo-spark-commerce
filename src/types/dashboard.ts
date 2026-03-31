export interface Organization {
  id: string;
  user_id: string;
  name: string;
  niche: string;
  tone: string;
  audience: string;
  template_image_url?: string | null;
  logo_url?: string | null;
  brand_font?: string;
  brand_color?: string;
  brand_font_size?: string;
  brand_style_notes?: string;
  design_styles?: string[];
  printify_shop_id?: number | null;
  deleted_at?: string | null;
  enabled_marketplaces?: string[];
  enabled_product_types?: string[];
  enabled_social_platforms?: string[];
  default_size_pricing?: Record<string, Record<string, string>>;
  mockup_templates?: Record<string, string>;
  design_variant_mode?: "both" | "light-only" | "dark-only";
}

export interface Product {
  id: string;
  organization_id: string;
  title: string;
  description: string;
  keywords: string;
  category: string;
  price: string;
  features: string;
  image_url: string | null;
  shopify_product_id: number | null;
  printify_product_id: string | null;
  size_pricing: Record<string, string> | null;
  tags: string[];
  archived_at: string | null;
}

export interface Listing {
  id: string;
  product_id: string;
  marketplace: string;
  title: string;
  description: string;
  bullet_points: string[];
  tags: string[];
  seo_title: string;
  seo_description: string;
  url_handle: string;
  alt_text: string;
}

export type View = "orgs" | "org-form" | "products" | "product-form" | "product-detail" | "bulk-upload" | "autopilot" | "shopify-enrich" | "settings";

export const ALL_MARKETPLACES = ["etsy", "ebay"] as const;
export const ALL_PUSH_CHANNELS = ["etsy", "ebay"] as const;

export const EMPTY_ORG_FORM = {
  name: "",
  niche: "",
  tone: "",
  audience: "",
  brand_font: "",
  brand_color: "",
  brand_font_size: "large",
  brand_style_notes: "",
  design_styles: ["text-only"] as string[],
  printify_shop_id: null as number | null,
  enabled_marketplaces: [] as string[],
  enabled_product_types: ["t-shirt"] as string[],
  enabled_social_platforms: [] as string[],
  default_size_pricing: {} as Record<string, Record<string, string>>,
  design_variant_mode: "both" as "both" | "light-only" | "dark-only",
};

export type OrgFormState = typeof EMPTY_ORG_FORM;

export const EMPTY_PRODUCT_FORM = {
  title: "",
  description: "",
  keywords: "",
  category: "",
  price: "",
  features: "",
};

export type ProductFormState = typeof EMPTY_PRODUCT_FORM;
