import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Building2, Package, Sparkles, ImageIcon, Store, Share2,
  CalendarDays, GitCompare, Rocket, Upload, Users, Settings,
  ArrowRight, ArrowLeft, X, BookOpen, Zap,
} from "lucide-react";

interface TourStep {
  icon: React.ReactNode;
  title: string;
  description: string;
  tip?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    icon: <Building2 className="h-6 w-6" />,
    title: "Create Your Brand",
    description:
      "Start by creating a brand (organization). Add your brand name, niche, tone of voice, target audience, logo, and style preferences. This context powers all AI-generated content.",
    tip: "You can create multiple brands — each with its own products, designs, and settings.",
  },
  {
    icon: <Package className="h-6 w-6" />,
    title: "Add Products",
    description:
      "Add products to your brand with a title, description, keywords, category, price, and features. Upload a product image — or let AI auto-fill details by analyzing your image.",
    tip: "Use the AI Auto-fill toggle when adding a product image to automatically extract product details.",
  },
  {
    icon: <Sparkles className="h-6 w-6" />,
    title: "Message Ideas (AI Designs)",
    description:
      "Generate marketing messages and AI designs for your products. Swipe right to keep a design, left to skip. Each message can get a matching promotional graphic generated automatically.",
    tip: "You get 20 free AI generations per month across all your brands.",
  },
  {
    icon: <ImageIcon className="h-6 w-6" />,
    title: "Color Variant Mockups",
    description:
      "Inside any product, generate color variant mockups with AI. Each mockup becomes a Shopify color variant. You can also upload your own mockup images manually.",
    tip: "Name your uploaded files with the color name (e.g. 'Ocean Blue.png') and it'll auto-set the variant name.",
  },
  {
    icon: <Store className="h-6 w-6" />,
    title: "AI Listings & Push to Marketplaces",
    description:
      "Generate SEO-optimized listings for Amazon, Etsy, eBay, and Shopify with one click. Then push your products directly to Shopify, Printify, eBay, Etsy, or Meta.",
    tip: "Connect your Shopify store in Settings to enable direct product pushing.",
  },
  {
    icon: <Upload className="h-6 w-6" />,
    title: "Bulk Upload & Shopify Enrich",
    description:
      "Upload a CSV of products to add them all at once. Or import your existing Shopify catalog and enrich each product with AI-generated descriptions, keywords, and listings.",
  },
  {
    icon: <Rocket className="h-6 w-6" />,
    title: "Autopilot Pipeline",
    description:
      "Drop a folder of design images and let the autopilot pipeline handle everything: create products, generate mockups, build listings, and optionally push to Shopify — all automatically.",
    tip: "Great for launching a new collection fast.",
  },
  {
    icon: <Share2 className="h-6 w-6" />,
    title: "Social Media Posts",
    description:
      "Generate platform-specific captions and hashtags for Instagram, TikTok, X, and Facebook. You can also generate AI promotional images for each platform.",
  },
  {
    icon: <CalendarDays className="h-6 w-6" />,
    title: "Content Calendar",
    description:
      "View and schedule your social posts on a visual calendar. Drag and drop posts to different dates to plan your content strategy.",
  },
  {
    icon: <GitCompare className="h-6 w-6" />,
    title: "Sync Dashboard",
    description:
      "See which products are synced to which marketplaces at a glance. Track Shopify, Printify, eBay, Etsy, and Meta connections in one place.",
  },
  {
    icon: <Users className="h-6 w-6" />,
    title: "Team Collaboration",
    description:
      "Invite team members to your brands with different roles: Owner, Editor, or Viewer. Collaborators share the brand's AI credits from the owner's account pool.",
    tip: "Go to Settings → Collaboration to manage invites and team members.",
  },
  {
    icon: <Settings className="h-6 w-6" />,
    title: "Settings & Integrations",
    description:
      "Connect your Shopify store, set up eBay/Etsy/Meta marketplace credentials, and manage your team — all from the Settings page.",
  },
];

interface OnboardingTourProps {
  onClose: () => void;
}

export function OnboardingTour({ onClose }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const step = TOUR_STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === TOUR_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header gradient bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-primary via-[hsl(var(--aura-cyan))] to-[hsl(var(--aura-magenta))]" />

        {/* Close button */}
        <button
          onClick={() => { localStorage.setItem("brand_aura_tour_seen", dontShowAgain ? "permanent" : "1"); onClose(); }}
          className="absolute right-3 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-6 pt-5">
          {TOUR_STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentStep(i)}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                i === currentStep
                  ? "bg-primary"
                  : i < currentStep
                  ? "bg-primary/40"
                  : "bg-border"
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-6 pt-5 pb-2">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              {step.icon}
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Step {currentStep + 1} of {TOUR_STEPS.length}
              </p>
              <h3 className="text-lg font-bold text-foreground leading-tight">
                {step.title}
              </h3>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-secondary-foreground">
            {step.description}
          </p>

          {step.tip && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2.5">
              <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-foreground/80">{step.tip}</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep((s) => s - 1)}
              disabled={isFirst}
              className="gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => {
                  setDontShowAgain(e.target.checked);
                  if (e.target.checked) {
                    localStorage.setItem("brand_aura_tour_seen", "permanent");
                  } else {
                    localStorage.removeItem("brand_aura_tour_seen");
                  }
                }}
                className="rounded border-border h-3.5 w-3.5"
              />
              <span className="text-xs text-muted-foreground">Don't show again</span>
            </label>
          </div>

          <Button
            size="sm"
            onClick={() => {
              if (dontShowAgain) {
                localStorage.setItem("brand_aura_tour_seen", "1");
              }
              if (isLast) onClose();
              else setCurrentStep((s) => s + 1);
            }}
            className="gap-1.5"
          >
            {isLast ? (
              "Get Started"
            ) : (
              <>
                Next <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Small trigger button to re-open the tour */
export function OnboardingTrigger({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="gap-1.5 text-muted-foreground hover:text-foreground"
    >
      <BookOpen className="h-4 w-4" />
      <span className="hidden sm:inline">Tour</span>
    </Button>
  );
}
