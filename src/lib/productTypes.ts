/**
 * Product Type Registry
 * Defines color palettes, size charts, mockup config, and design placement per product type.
 */

export type ProductTypeKey = "t-shirt" | "hoodie" | "mug";

export interface ProductTypeColor {
  name: string;
  hex: string;
}

export interface ProductTypeConfig {
  key: ProductTypeKey;
  label: string;
  category: string;
  /** Colors available for this product type */
  colors: ProductTypeColor[];
  /** Colors considered "light" (use dark-ink design) */
  lightColors: Set<string>;
  /** Color swatch hints for AI recoloring (descriptive target for the AI) */
  swatchHints: Record<string, string>;
  /** Design placement description for mockup generation */
  designPlacement: string;
  /** Size chart public URL (null if none) */
  sizeChartUrl: string | null;
  /** Shopify tags to auto-add */
  shopifyTags: string[];
  /** Default price suggestion */
  defaultPrice: string;
  /** Max concurrent AI generations */
  concurrency: number;
}

// ─── Comfort Colors 1717 (T-Shirt) ────────────────────────────────

const CC1717_COLORS: ProductTypeColor[] = [
  { name: "Black", hex: "#1a1a1a" },
  { name: "White", hex: "#f5f5f0" },
  { name: "True Navy", hex: "#1e2d4a" },
  { name: "Red", hex: "#b22234" },
  { name: "Moss", hex: "#5a6e3c" },
  { name: "Grey", hex: "#9a9a96" },
  { name: "Blue Jean", hex: "#6b8cae" },
  { name: "Pepper", hex: "#3d3a38" },
  { name: "Island Green", hex: "#5a9e8f" },
  { name: "Ivory", hex: "#f0e8d8" },
  { name: "Crimson", hex: "#8b1a2b" },
  { name: "Espresso", hex: "#3b2a20" },
  { name: "Midnight", hex: "#1a1a2e" },
  { name: "Sage", hex: "#a3b09e" },
  { name: "Chambray", hex: "#8ba3c4" },
];

const CC1717_LIGHT = new Set([
  "ivory", "butter", "banana", "blossom", "orchid", "chalky mint",
  "island reef", "chambray", "white", "flo blue", "watermelon",
  "neon pink", "neon green", "lagoon blue", "yam", "terracotta",
  "light green", "bay", "sage",
]);

const CC1717_SWATCH_HINTS: Record<string, string> = {
  black: "deep neutral black (near #1A1A1A)",
  white: "soft natural cotton white (near #F5F5EF)",
  "true navy": "deep classic navy (near #1F2A44)",
  red: "clean medium red (near #B3272D)",
  moss: "muted earthy olive green (near #6F7A5D)",
  grey: "medium neutral heather gray (near #78797D)",
  "blue jean": "washed dusty denim blue (near #6E8090)",
  pepper: "washed charcoal black with subtle warm tone (near #2F3133)",
  "island green": "rich green-teal (near #2F8E79)",
  ivory: "warm off-white cream (near #F2E9D6)",
  crimson: "deep crimson red (near #8E1D2E)",
  espresso: "dark warm brown (near #3A2A21)",
  midnight: "very dark navy with cool undertone (near #1B2230)",
  sage: "muted light sage green (near #9BAC95)",
  chambray: "light muted blue-gray (near #8EA3B6)",
};

// ─── Comfort Colors 1566 (Hoodie) ─────────────────────────────────

const CC1566_COLORS: ProductTypeColor[] = [
  { name: "Black", hex: "#1a1a1a" },
  { name: "White", hex: "#f5f5f0" },
  { name: "True Navy", hex: "#1e2d4a" },
  { name: "Grey", hex: "#9a9a96" },
  { name: "Pepper", hex: "#3d3a38" },
  { name: "Moss", hex: "#5a6e3c" },
  { name: "Ivory", hex: "#f0e8d8" },
  { name: "Blue Jean", hex: "#6b8cae" },
  { name: "Crimson", hex: "#8b1a2b" },
  { name: "Espresso", hex: "#3b2a20" },
  { name: "Midnight", hex: "#1a1a2e" },
  { name: "Sage", hex: "#a3b09e" },
];

const CC1566_SWATCH_HINTS: Record<string, string> = {
  black: "deep neutral black (near #1A1A1A)",
  white: "soft natural cotton white (near #F5F5EF)",
  "true navy": "deep classic navy (near #1F2A44)",
  grey: "medium neutral heather gray (near #78797D)",
  pepper: "washed charcoal black (near #2F3133)",
  moss: "muted earthy olive green (near #6F7A5D)",
  ivory: "warm off-white cream (near #F2E9D6)",
  "blue jean": "washed dusty denim blue (near #6E8090)",
  crimson: "deep crimson red (near #8E1D2E)",
  espresso: "dark warm brown (near #3A2A21)",
  midnight: "very dark navy (near #1B2230)",
  sage: "muted light sage green (near #9BAC95)",
};

// ─── Mugs ──────────────────────────────────────────────────────────

const MUG_COLORS: ProductTypeColor[] = [
  { name: "White", hex: "#ffffff" },
  { name: "Black", hex: "#1a1a1a" },
  { name: "Navy", hex: "#1e2d4a" },
  { name: "Red", hex: "#c0392b" },
  { name: "Green", hex: "#2e7d32" },
  { name: "Light Blue", hex: "#90caf9" },
  { name: "Pink", hex: "#f48fb1" },
  { name: "Yellow", hex: "#fff176" },
];

const MUG_LIGHT = new Set([
  "white", "light blue", "pink", "yellow",
]);

const MUG_SWATCH_HINTS: Record<string, string> = {
  white: "clean glossy ceramic white (#FFFFFF)",
  black: "matte black ceramic (#1A1A1A)",
  navy: "deep navy ceramic glaze (#1E2D4A)",
  red: "classic red ceramic glaze (#C0392B)",
  green: "forest green ceramic glaze (#2E7D32)",
  "light blue": "pastel sky blue ceramic (#90CAF9)",
  pink: "soft blush pink ceramic (#F48FB1)",
  yellow: "warm butter yellow ceramic (#FFF176)",
};

// ─── Registry ──────────────────────────────────────────────────────

const CC1717_SIZE_CHART_URL =
  "https://qhlrjoytvowzsxulfnku.supabase.co/storage/v1/object/public/product-images/shared/cc1717-size-chart.png";

export const PRODUCT_TYPES: Record<ProductTypeKey, ProductTypeConfig> = {
  "t-shirt": {
    key: "t-shirt",
    label: "T-Shirt",
    category: "T-Shirt",
    colors: CC1717_COLORS,
    lightColors: CC1717_LIGHT,
    swatchHints: CC1717_SWATCH_HINTS,
    designPlacement: "center-chest print area, 60% width, positioned at 25% from top",
    sizeChartUrl: CC1717_SIZE_CHART_URL,
    shopifyTags: ["T-shirts"],
    defaultPrice: "$29.99",
    concurrency: 2,
  },
  hoodie: {
    key: "hoodie",
    label: "Hoodie / Sweatshirt",
    category: "Hoodie",
    colors: CC1566_COLORS,
    lightColors: CC1717_LIGHT, // reuse same light classification
    swatchHints: CC1566_SWATCH_HINTS,
    designPlacement: "center-chest print area on hoodie, 55% width, positioned at 28% from top",
    sizeChartUrl: null, // TODO: upload hoodie size chart
    shopifyTags: ["Hoodies", "Sweatshirts"],
    defaultPrice: "$44.99",
    concurrency: 2,
  },
  mug: {
    key: "mug",
    label: "Mug / Drinkware",
    category: "Mug",
    colors: MUG_COLORS,
    lightColors: MUG_LIGHT,
    swatchHints: MUG_SWATCH_HINTS,
    designPlacement: "wrap-around print on 11oz ceramic mug, design centered on front face",
    sizeChartUrl: null,
    shopifyTags: ["Mugs", "Drinkware"],
    defaultPrice: "$16.99",
    concurrency: 2,
  },
};

/** Get product type config from a category string (fuzzy match) */
export function getProductType(category: string): ProductTypeConfig {
  const lower = (category || "").toLowerCase();
  if (lower.includes("hoodie") || lower.includes("sweatshirt")) return PRODUCT_TYPES.hoodie;
  if (lower.includes("mug") || lower.includes("drinkware") || lower.includes("cup")) return PRODUCT_TYPES.mug;
  // Default to t-shirt
  return PRODUCT_TYPES["t-shirt"];
}

/** Get color hex map for a product type */
export function getColorHexMap(config: ProductTypeConfig): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of config.colors) {
    map[c.name.toLowerCase()] = c.hex;
  }
  return map;
}

/** Get suggested color names for a product type */
export function getSuggestedColors(config: ProductTypeConfig): string[] {
  return config.colors.map((c) => c.name);
}

/** Check if a color is "light" for a given product type */
export function isLightColor(config: ProductTypeConfig, colorName: string): boolean {
  return config.lightColors.has(colorName.toLowerCase().trim());
}

/** Get available palette description for AI prompts */
export function getPaletteDescription(config: ProductTypeConfig): string {
  return config.colors.map((c) => c.name).join(", ");
}
