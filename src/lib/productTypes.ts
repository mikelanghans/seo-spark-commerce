/**
 * Product Type Registry
 * Defines color palettes, size charts, mockup config, and design placement per product type.
 */

export type ProductTypeKey = "t-shirt" | "long-sleeve" | "sweatshirt" | "hoodie" | "mug" | "tote" | "canvas" | "journal" | "notebook" | "other";

export interface ProductTypeColor {
  name: string;
  hex: string;
}

export interface ProductTypeConfig {
  key: ProductTypeKey;
  label: string;
  category: string;
  /** Available sizes for this product type (empty = one-size / no sizes) */
  sizes: string[];
  /** Default price per size */
  defaultSizePricing: Record<string, string>;
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
  /** Default price suggestion (base / display price) */
  defaultPrice: string;
  /** Max concurrent AI generations */
  concurrency: number;
}

/** Size pricing map: product type key → size → price string */
export type SizePricingMap = Record<string, Record<string, string>>;

// ─── Comfort Colors 1717 (T-Shirt) ────────────────────────────────

const CC1717_COLORS: ProductTypeColor[] = [
  { name: "Black", hex: "#1a1a1a" },
  { name: "White", hex: "#f5f5f0" },
  { name: "True Navy", hex: "#1e2d4a" },
  { name: "Red", hex: "#b22234" },
  { name: "Moss", hex: "#5a6e3c" },
  { name: "Grey", hex: "#9a9a96" },
  { name: "Blue Jean", hex: "#6b8cae" },
  { name: "Pepper", hex: "#6b6866" },
  { name: "Island Green", hex: "#5a9e8f" },
  { name: "Ivory", hex: "#f0e8d8" },
  { name: "Chili", hex: "#8b2332" },
  { name: "Brick", hex: "#a05a50" },
  { name: "Espresso", hex: "#4a3228" },
  { name: "Midnight", hex: "#4a5568" },
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
  "true navy": "deep classic navy blue — clearly blue, not black (near #1F2A44)",
  red: "clean medium red (near #B3272D)",
  moss: "muted earthy olive green (near #6F7A5D)",
  grey: "medium neutral heather gray (near #78797D)",
  "blue jean": "washed dusty denim blue (near #6E8090)",
  pepper: "Comfort Colors 1717 PEPPER — a distinctly gray garment, not black. Target hex #6B6866. Think well-faded warm charcoal gray with visible lift and softness",
  "island green": "rich green-teal (near #2F8E79)",
  ivory: "warm off-white cream (near #F2E9D6)",
  chili: "deep dark red with brown warmth — like dried chili pepper (near #8B2332)",
  brick: "muted warm terracotta-red, dusty and earthy (near #A05A50)",
  espresso: "dark warm brown — clearly brown, not black (near #4A3228)",
  midnight: "medium-dark slate blue-gray — NOT dark navy and NOT black. A muted cool steel tone with subtle blue undertone (near #4A5568)",
  sage: "muted light sage green (near #9BAC95)",
  chambray: "light muted blue-gray (near #8EA3B6)",
};

// ─── Comfort Colors 1566 (Hoodie) ─────────────────────────────────

const CC1566_COLORS: ProductTypeColor[] = [
  { name: "Black", hex: "#1a1a1a" },
  { name: "White", hex: "#f5f5f0" },
  { name: "True Navy", hex: "#1e2d4a" },
  { name: "Grey", hex: "#9a9a96" },
  { name: "Pepper", hex: "#6b6866" },
  { name: "Moss", hex: "#5a6e3c" },
  { name: "Ivory", hex: "#f0e8d8" },
  { name: "Blue Jean", hex: "#6b8cae" },
  { name: "Chili", hex: "#8b2332" },
  { name: "Brick", hex: "#a05a50" },
  { name: "Espresso", hex: "#4a3228" },
  { name: "Midnight", hex: "#253147" },
  { name: "Sage", hex: "#a3b09e" },
];

const CC1566_SWATCH_HINTS: Record<string, string> = {
  black: "deep neutral black (near #1A1A1A)",
  white: "soft natural cotton white (near #F5F5EF)",
  "true navy": "deep classic navy blue — clearly blue, not black (near #1F2A44)",
  grey: "medium neutral heather gray (near #78797D)",
  pepper: "Comfort Colors PEPPER — warm charcoal gray, clearly lighter than black (near #6B6866)",
  moss: "muted earthy olive green (near #6F7A5D)",
  ivory: "warm off-white cream (near #F2E9D6)",
  "blue jean": "washed dusty denim blue (near #6E8090)",
  chili: "deep dark red with brown warmth — like dried chili pepper (near #8B2332)",
  brick: "muted warm terracotta-red, dusty and earthy (near #A05A50)",
  espresso: "dark warm brown — clearly brown, not black (near #4A3228)",
  midnight: "dark navy blue — not black. Visible blue undertone (near #253147)",
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

const APPAREL_SIZES = ["S", "M", "L", "XL", "2XL", "3XL"];

function apparelPricing(base: string, upcharge2xl = "2", upcharge3xl = "4"): Record<string, string> {
  const b = parseFloat(base);
  const u2 = parseFloat(upcharge2xl);
  const u3 = parseFloat(upcharge3xl);
  return {
    S: b.toFixed(2),
    M: b.toFixed(2),
    L: b.toFixed(2),
    XL: b.toFixed(2),
    "2XL": (b + u2).toFixed(2),
    "3XL": (b + u3).toFixed(2),
  };
}

export const PRODUCT_TYPES: Record<ProductTypeKey, ProductTypeConfig> = {
  "t-shirt": {
    key: "t-shirt",
    label: "T-Shirt",
    category: "T-Shirt",
    sizes: APPAREL_SIZES,
    defaultSizePricing: apparelPricing("29.99"),
    colors: CC1717_COLORS,
    lightColors: CC1717_LIGHT,
    swatchHints: CC1717_SWATCH_HINTS,
    designPlacement: "center-chest print area, 60% width, positioned at 25% from top",
    sizeChartUrl: CC1717_SIZE_CHART_URL,
    shopifyTags: ["T-shirts"],
    defaultPrice: "$29.99",
    concurrency: 2,
  },
  "long-sleeve": {
    key: "long-sleeve",
    label: "Long Sleeve",
    category: "Long Sleeve",
    sizes: APPAREL_SIZES,
    defaultSizePricing: apparelPricing("34.99"),
    colors: CC1717_COLORS,
    lightColors: CC1717_LIGHT,
    swatchHints: CC1717_SWATCH_HINTS,
    designPlacement: "center-chest print area on long sleeve tee, 55% width, positioned at 25% from top",
    sizeChartUrl: null,
    shopifyTags: ["Long Sleeve"],
    defaultPrice: "$34.99",
    concurrency: 2,
  },
  sweatshirt: {
    key: "sweatshirt",
    label: "Sweatshirt",
    category: "Sweatshirt",
    sizes: APPAREL_SIZES,
    defaultSizePricing: apparelPricing("39.99"),
    colors: CC1566_COLORS,
    lightColors: CC1717_LIGHT,
    swatchHints: CC1566_SWATCH_HINTS,
    designPlacement: "center-chest print area on crewneck sweatshirt, 55% width, positioned at 28% from top",
    sizeChartUrl: null,
    shopifyTags: ["Sweatshirts"],
    defaultPrice: "$39.99",
    concurrency: 2,
  },
  hoodie: {
    key: "hoodie",
    label: "Hoodie",
    category: "Hoodie",
    sizes: APPAREL_SIZES,
    defaultSizePricing: apparelPricing("44.99"),
    colors: CC1566_COLORS,
    lightColors: CC1717_LIGHT,
    swatchHints: CC1566_SWATCH_HINTS,
    designPlacement: "center-chest print area on hoodie, 55% width, positioned at 28% from top",
    sizeChartUrl: null,
    shopifyTags: ["Hoodies"],
    defaultPrice: "$44.99",
    concurrency: 2,
  },
  mug: {
    key: "mug",
    label: "Mug / Drinkware",
    category: "Mug",
    sizes: ["11oz", "15oz"],
    defaultSizePricing: { "11oz": "16.99", "15oz": "19.99" },
    colors: MUG_COLORS,
    lightColors: MUG_LIGHT,
    swatchHints: MUG_SWATCH_HINTS,
    designPlacement: "wrap-around print on 11oz ceramic mug, design centered on front face",
    sizeChartUrl: null,
    shopifyTags: ["Mugs", "Drinkware"],
    defaultPrice: "$16.99",
    concurrency: 2,
  },
  tote: {
    key: "tote",
    label: "Tote Bag",
    category: "Tote",
    sizes: [],
    defaultSizePricing: {},
    colors: [
      { name: "Natural", hex: "#f5f0e1" },
      { name: "Black", hex: "#1a1a1a" },
      { name: "Navy", hex: "#1e2d4a" },
    ],
    lightColors: new Set(["natural"]),
    swatchHints: { natural: "natural canvas tote (#F5F0E1)", black: "black canvas (#1A1A1A)", navy: "navy canvas (#1E2D4A)" },
    designPlacement: "center print area on tote bag, 70% width",
    sizeChartUrl: null,
    shopifyTags: ["Tote Bags", "Accessories"],
    defaultPrice: "$19.99",
    concurrency: 2,
  },
  canvas: {
    key: "canvas",
    label: "Canvas Print",
    category: "Canvas",
    sizes: ["8x10", "11x14", "16x20", "24x36"],
    defaultSizePricing: { "8x10": "29.99", "11x14": "39.99", "16x20": "59.99", "24x36": "89.99" },
    colors: [{ name: "White", hex: "#ffffff" }],
    lightColors: new Set(["white"]),
    swatchHints: { white: "white canvas (#FFFFFF)" },
    designPlacement: "full bleed canvas print",
    sizeChartUrl: null,
    shopifyTags: ["Canvas", "Wall Art"],
    defaultPrice: "$39.99",
    concurrency: 2,
  },
  journal: {
    key: "journal",
    label: "Journal",
    category: "Journal",
    sizes: [],
    defaultSizePricing: {},
    colors: [
      { name: "Black", hex: "#1a1a1a" },
      { name: "White", hex: "#ffffff" },
    ],
    lightColors: new Set(["white"]),
    swatchHints: { black: "black cover (#1A1A1A)", white: "white cover (#FFFFFF)" },
    designPlacement: "front cover print, full bleed",
    sizeChartUrl: null,
    shopifyTags: ["Journals", "Stationery"],
    defaultPrice: "$24.99",
    concurrency: 2,
  },
  notebook: {
    key: "notebook",
    label: "Notebook",
    category: "Notebook",
    sizes: [],
    defaultSizePricing: {},
    colors: [
      { name: "Black", hex: "#1a1a1a" },
      { name: "White", hex: "#ffffff" },
    ],
    lightColors: new Set(["white"]),
    swatchHints: { black: "black cover (#1A1A1A)", white: "white cover (#FFFFFF)" },
    designPlacement: "front cover print, full bleed",
    sizeChartUrl: null,
    shopifyTags: ["Notebooks", "Stationery"],
    defaultPrice: "$19.99",
    concurrency: 2,
  },
  other: {
    key: "other",
    label: "Other",
    category: "Other",
    sizes: [],
    defaultSizePricing: {},
    colors: [
      { name: "White", hex: "#ffffff" },
      { name: "Black", hex: "#1a1a1a" },
    ],
    lightColors: new Set(["white"]),
    swatchHints: { white: "white (#FFFFFF)", black: "black (#1A1A1A)" },
    designPlacement: "center print area, 60% width",
    sizeChartUrl: null,
    shopifyTags: [],
    defaultPrice: "$24.99",
    concurrency: 2,
  },
};

/** Get product type config from a category string (fuzzy match) */
export function getProductType(category: string): ProductTypeConfig {
  const lower = (category || "").toLowerCase();
  if (lower.includes("hoodie")) return PRODUCT_TYPES.hoodie;
  if (lower.includes("sweatshirt") || lower.includes("crewneck")) return PRODUCT_TYPES.sweatshirt;
  if (lower.includes("long sleeve")) return PRODUCT_TYPES["long-sleeve"];
  if (lower.includes("mug") || lower.includes("drinkware") || lower.includes("cup")) return PRODUCT_TYPES.mug;
  if (lower.includes("tote")) return PRODUCT_TYPES.tote;
  if (lower.includes("canvas") || lower.includes("wall art")) return PRODUCT_TYPES.canvas;
  if (lower.includes("journal")) return PRODUCT_TYPES.journal;
  if (lower.includes("notebook")) return PRODUCT_TYPES.notebook;
  if (lower.includes("t-shirt") || lower.includes("tee") || lower.includes("shirt")) return PRODUCT_TYPES["t-shirt"];
  return PRODUCT_TYPES.other;
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
