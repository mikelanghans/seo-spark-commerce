export type TourCompletionKey =
  | "hasBrand"
  | "selectedBrand"
  | "hasProduct"
  | "hasListing"
  | "hasMarketplace";

export type TourCompletion = Record<TourCompletionKey, boolean>;

export type ProductsTab =
  | "messages"
  | "products"
  | "autopilot"
  | "social"
  | "calendar"
  | "sync"
  | "analytics"
  | "brand-settings";

export interface TourStep {
  id: string;
  title: string;
  description: string;
  /** CSS selector for the element to spotlight. */
  target?: string;
  /** Dashboard view to navigate to before showing this step. */
  navigateTo?:
    | "orgs"
    | "products"
    | "settings"
    | "autopilot"
    | "bulk-upload"
    | "shopify-enrich";
  /** When navigating to "products", which inner tab to open. */
  productsTab?: ProductsTab;
  /** Auto-advance when this completion key flips to true. */
  autoComplete?: TourCompletionKey;
  /** Tip shown in the spotlight tooltip. */
  tip?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "create-brand",
    title: "Create your first brand",
    description:
      "A brand is your store identity — name, niche, tone, and audience. Everything Brand Aura generates is tailored to it.",
    target: '[data-tour="create-brand"]',
    navigateTo: "orgs",
    autoComplete: "hasBrand",
    tip: "You can create multiple brands later — each has its own products and settings.",
  },
  {
    id: "open-brand",
    title: "Open your brand",
    description: "Click your brand card to start adding products and generating content.",
    target: '[data-tour="org-card"]',
    navigateTo: "orgs",
    autoComplete: "selectedBrand",
  },
  {
    id: "add-product",
    title: "Add your first product",
    description:
      "Add a product manually, import from Shopify, or use Bulk Upload. Toggle AI Auto-fill on the form to extract details from your image.",
    target: '[data-tour="add-product"]',
    navigateTo: "products",
    autoComplete: "hasProduct",
  },
  {
    id: "message-ideas",
    title: "Generate Message Ideas",
    description:
      "The Message Ideas tab generates AI marketing copy and matching designs for your products. Swipe right to keep, left to skip.",
    target: '[data-tour="tab-messages"]',
    navigateTo: "products",
    productsTab: "messages",
  },
  {
    id: "mockups-and-listings",
    title: "Mockups & SEO listings",
    description:
      "Open any product to generate color-variant mockups, then generate SEO-optimized listings for Etsy, eBay, and Shopify with one click.",
    target: '[data-tour="tab-products"]',
    navigateTo: "products",
    productsTab: "products",
    autoComplete: "hasListing",
  },
  {
    id: "autopilot",
    title: "Try Autopilot",
    description:
      "Drop a folder of design images and Autopilot creates products, generates mockups, writes listings, and pushes to Printify + Shopify — hands-free.",
    target: '[data-tour="tab-autopilot"]',
    navigateTo: "products",
    productsTab: "autopilot",
    tip: "Great way to launch a full collection in minutes.",
  },
  {
    id: "connect-marketplace",
    title: "Connect a marketplace",
    description:
      "Connect Shopify, Printify, Etsy, eBay, or Meta in Settings so you can push products directly to your stores.",
    target: '[data-tour="open-settings"]',
    navigateTo: "settings",
    autoComplete: "hasMarketplace",
  },
];
