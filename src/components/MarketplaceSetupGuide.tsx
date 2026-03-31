import { ExternalLink, ShoppingBag, Package, ChevronDown } from "lucide-react";
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
];

interface GuideProps {
  platform: "etsy" | "ebay";
}

interface Step {
  title: string;
  description: string;
  link?: string;
  linkLabel?: string;
  code?: string;
}

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
  const isEtsy = platform === "etsy";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3 text-left transition-colors hover:bg-muted/60">
        <div className="flex items-center gap-2">
          {isEtsy ? (
            <ShoppingBag className="h-4 w-4 text-orange-500" />
          ) : (
            <Package className="h-4 w-4 text-blue-500" />
          )}
          <span className="text-sm font-medium">
            How to set up {isEtsy ? "Etsy" : "eBay"}
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 pt-1">
        <StepList steps={isEtsy ? ETSY_STEPS : EBAY_STEPS} />
      </CollapsibleContent>
    </Collapsible>
  );
};

export const MarketplaceSetupGuide = () => (
  <div className="space-y-3">
    <div className="flex items-center gap-2 mb-1">
      <h4 className="text-sm font-medium text-muted-foreground">Integration Setup Guides</h4>
    </div>
    <PlatformGuide platform="etsy" />
    <PlatformGuide platform="ebay" />
  </div>
);