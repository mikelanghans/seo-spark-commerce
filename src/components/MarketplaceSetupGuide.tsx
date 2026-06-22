import { ExternalLink, ShoppingBag, Package, ChevronDown, Store, Printer } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";

const ETSY_GUIDE = {
  lastUpdated: "2026-03-30",
  steps: [
    {
      title: "Create an Etsy Developer Account",
      description: "Sign in with your Etsy seller account and register as a developer.",
      link: "https://www.etsy.com/developers/register",
      linkLabel: "Etsy Developer Portal",
    },
    {
      title: 'Create a New App',
      description: 'Click "Create a New App" in the developer dashboard. Set the app type to "Seller Tools" for "General Public" with Commercial set to "Yes".',
    },
    {
      title: "Enable Permissions",
      description: 'Make sure "Upload or edit listings" is enabled under your app permissions.',
    },
    {
      title: "Connect in Settings",
      description: 'Click "Connect Etsy Shop" above — the app handles the OAuth authorization flow automatically. No API key copy-paste needed!',
    },
  ],
};

const EBAY_GUIDE = {
  lastUpdated: "2026-03-30",
  steps: [
  {
    title: "Sign Up for an eBay Developer Account",
    description: "Create or sign in to the eBay Developer Program.",
    link: "https://developer.ebay.com/signin",
    linkLabel: "eBay Developer Program",
  },
  {
    title: "Create Application Keys",
    description: 'Go to "Application Keys" → "Create a keyset". Choose Production for live selling or Sandbox for testing.',
    link: "https://developer.ebay.com/my/keys",
    linkLabel: "Manage App Keys",
  },
  {
    title: "Copy Your Credentials",
    description: "Copy your App ID (Client ID) and Cert ID (Client Secret). You'll paste these in the eBay connection form above.",
  },
  {
    title: "Configure OAuth Redirect URI",
    description: "In your eBay app settings, add the following as an accepted redirect URI:",
    code: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ebay-oauth-callback`,
  },
  {
    title: "Set Up Account Deletion Notifications",
    description: 'eBay requires a "Marketplace Account Deletion" notification. Go to your app\'s Alerts & Notifications and set it to "Platform Notifications (push)" for testing.',
    link: "https://developer.ebay.com/my/keys",
    linkLabel: "App Settings",
  },
  ],
};

const SHOPIFY_GUIDE = {
  lastUpdated: "2026-04-02",
  steps: [
    {
      title: "Create a Shopify Partner Account",
      description: "Sign up for the Shopify Partner Program (free). This gives you access to create apps and development stores.",
      link: "https://partners.shopify.com/signup",
      linkLabel: "Shopify Partners",
    },
    {
      title: "Create a Custom App",
      description: 'In the Partner Dashboard, go to "Apps" → "Create app" → "Create app manually". Give it a name (e.g. your brand name).',
    },
    {
      title: "Configure App Scopes",
      description: 'Under "Configuration", set the required scopes: read_products, write_products, read_files, write_files. These allow the app to manage your product catalog.',
    },
    {
      title: "Set the Redirect URL",
      description: "Add the following as your app's allowed redirection URL:",
      code: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-oauth-callback`,
    },
    {
      title: "Copy Client Credentials",
      description: 'Copy the Client ID and Client Secret from your app\'s "Client credentials" section. You\'ll paste these in the Shopify connection settings under your brand.',
    },
    {
      title: "Connect in Brand Settings",
      description: 'Go to your brand\'s Settings tab → Shopify section. Enter your store domain, Client ID, and Client Secret, then click "Connect Shopify".',
    },
  ],
};

const PRINTIFY_GUIDE = {
  lastUpdated: "2026-04-02",
  steps: [
    {
      title: "Create a Printify Account",
      description: "Sign up or log in to Printify. A free account works for getting started.",
      link: "https://printify.com/app/register",
      linkLabel: "Printify Sign Up",
    },
    {
      title: "Generate a Personal Access Token",
      description: 'Go to "My Account" → "Connections" → "Personal access tokens" → "Generate new token". Name it something recognizable (e.g. your brand name).',
      link: "https://printify.com/app/account/connections",
      linkLabel: "Printify Connections",
    },
    {
      title: "Copy the Token",
      description: "Copy the generated token immediately — it won't be shown again. This is the API token you'll paste into your brand settings.",
    },
    {
      title: "Connect in Brand Settings",
      description: 'Go to your brand\'s Settings tab → Printify section. Paste your API token and click "Save". The app will automatically detect your shops.',
    },
    {
      title: "Select Your Shop",
      description: "If you have multiple Printify shops, pick the one to use for this brand. Products will be pushed to that shop for fulfillment.",
    },
  ],
};

type Platform = "etsy" | "ebay" | "shopify" | "printify";

interface GuideProps {
  platform: Platform;
}

interface Step {
  title: string;
  description: string;
  link?: string;
  linkLabel?: string;
  code?: string;
}

const PLATFORM_CONFIG: Record<Platform, { guide: typeof ETSY_GUIDE; icon: React.ReactNode; label: string }> = {
  etsy: { guide: ETSY_GUIDE, icon: <ShoppingBag className="h-4 w-4 text-orange-500" />, label: "Etsy" },
  ebay: { guide: EBAY_GUIDE, icon: <Package className="h-4 w-4 text-blue-500" />, label: "eBay" },
  shopify: { guide: SHOPIFY_GUIDE, icon: <Store className="h-4 w-4 text-green-500" />, label: "Shopify" },
  printify: { guide: PRINTIFY_GUIDE, icon: <Printer className="h-4 w-4 text-purple-500" />, label: "Printify" },
};

const StepList = ({ steps }: { steps: Step[] }) => (
  <ol className="space-y-4 mt-3">
    {steps.map((step, i) => (
      <li key={i} className="flex gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {i + 1}
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{step.title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
          {step.code && (
            <code className="block mt-1 rounded-md bg-muted px-3 py-2 text-xs font-mono text-foreground break-all select-all">
              {step.code}
            </code>
          )}
          {step.link && (
            <a
              href={step.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
            >
              {step.linkLabel} <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </li>
    ))}
  </ol>
);

const PlatformGuide = ({ platform }: GuideProps) => {
  const [open, setOpen] = useState(false);
  const config = PLATFORM_CONFIG[platform];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3 text-left transition-colors hover:bg-muted/60">
        <div className="flex items-center gap-2">
          {config.icon}
          <span className="text-sm font-medium">
            How to set up {config.label}
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 pt-1">
        <StepList steps={config.guide.steps} />
        <p className="text-[11px] text-muted-foreground mt-3">
          Last updated: {config.guide.lastUpdated}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
};

export const MarketplaceSetupGuide = () => (
  <div className="space-y-3">
    <div className="flex items-center gap-2 mb-1">
      <h4 className="text-sm font-medium text-muted-foreground">Integration Setup Guides</h4>
    </div>
    <PlatformGuide platform="shopify" />
    <PlatformGuide platform="printify" />
    <PlatformGuide platform="etsy" />
    <PlatformGuide platform="ebay" />
  </div>
);