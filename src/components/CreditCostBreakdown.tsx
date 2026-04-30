import { CREDIT_COSTS } from "@/lib/creditCosts";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sparkles, Image, Palette, FileText, MessageSquare, Share2, DollarSign, HelpCircle, CreditCard, Check, X, ExternalLink } from "lucide-react";

const COST_GROUPS = [
  {
    label: "Quick Analysis",
    icon: Sparkles,
    items: ["analyze-product", "recommend-colors", "suggest-pricing"],
  },
  {
    label: "Content Generation",
    icon: FileText,
    items: ["generate-listings", "generate-messages", "generate-social-posts"],
  },
  {
    label: "Image Generation",
    icon: Image,
    items: ["generate-design", "generate-dark-design", "generate-color-variants", "generate-mockup", "generate-social-image"],
  },
];

const FAQ_ITEMS = [
  {
    q: "What are credits?",
    a: "Credits are the currency for AI-powered features. Each AI action (generating a design, creating listings, recommending colors) costs a specific number of credits. Simple text analysis costs 1 credit, while image generation costs more because it's computationally intensive.",
  },
  {
    q: "How do I get credits?",
    a: "Each subscription plan includes monthly credits: Free gets 25, Starter gets 175, and Pro gets 700. You can also purchase credit packs separately if you need more.",
  },
  {
    q: "Do unused credits roll over?",
    a: "Monthly plan credits reset each billing cycle. Purchased credit packs never expire and are added to your balance permanently.",
  },
  {
    q: "What counts as one 'action'?",
    a: "Each button click that triggers AI counts as one action. For example: generating color variants charges per color selected, not per batch. Generating marketplace listings charges once for all marketplaces in that batch.",
  },
  {
    q: "What happens when I run out?",
    a: "You'll see a clear 'Not enough credits' message with a link back here. No work is lost — you can purchase more credits and continue right where you left off.",
  },
  {
    q: "Can I try before subscribing?",
    a: "Yes! The Free plan includes 25 credits/month so you can experience every AI feature before committing to a paid plan.",
  },
  {
    q: "Are there other costs outside of credits?",
    a: "Yes — credits cover everything inside this app (AI generation, listing creation, marketplace pushes, SEO scans, storage). But your connected platforms bill you directly: Printify charges per order for printing & shipping; Shopify, Etsy, eBay, and Meta charge their own subscription, listing, and transaction fees on your account. We never touch those.",
  },
];

export function CreditCostBreakdown() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          Credit Costs Per Action
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Every AI feature has a fixed credit cost per product. No surprises.
        </p>
      </div>

      {/* Plan allowance callout */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Credits Included With Your Plan</span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { plan: "Free", credits: "25", price: "$0/mo" },
            { plan: "Starter", credits: "175", price: "$9/mo" },
            { plan: "Pro", credits: "700", price: "$29/mo" },
          ].map(({ plan, credits, price }) => (
            <div key={plan} className="rounded-md border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">{plan}</p>
              <p className="text-lg font-bold text-foreground">{credits}</p>
              <p className="text-xs text-muted-foreground">{price}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Need more? Purchase credit packs anytime — they never expire and stack on top of your monthly allowance.
        </p>
      </div>

      {/* What credits cover vs what they don't */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-semibold text-foreground">Your credits cover</span>
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>• AI generation (designs, mockups, listings, social posts)</li>
            <li>• SEO site scans and re-scans</li>
            <li>• Marketplace pushes to Printify, Shopify, Etsy, eBay</li>
            <li>• Image storage & autopilot workflows</li>
            <li>• All app infrastructure and bandwidth</li>
          </ul>
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <X className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold text-foreground">Billed by third parties</span>
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>• <strong className="text-foreground">Printify</strong> — printing & shipping per order</li>
            <li>• <strong className="text-foreground">Shopify / Etsy / eBay</strong> — platform & listing fees</li>
            <li>• <strong className="text-foreground">Meta</strong> — ad spend (if used)</li>
            <li>• Each platform's own transaction fees on sales</li>
          </ul>
          <p className="text-[11px] text-muted-foreground/80 pt-1 flex items-center gap-1">
            <ExternalLink className="h-3 w-3" /> Charged on your connected accounts, not by us.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {COST_GROUPS.map(({ label, icon: Icon, items }) => (
          <div key={label} className="rounded-lg border border-border bg-card/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Icon className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
            </div>
            <div className="space-y-2">
              {items.map((key) => {
                const item = CREDIT_COSTS[key];
                if (!item) return null;
                return (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{item.label}</span>
                    <span className={`text-sm font-mono font-semibold ${
                      item.cost <= 1 ? "text-green-500" : item.cost <= 2 ? "text-yellow-500" : "text-primary"
                    }`}>
                      {item.cost} {item.cost === 1 ? "credit" : "credits"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div>
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2 mb-3">
          <HelpCircle className="h-4 w-4 text-primary" />
          Frequently Asked Questions
        </h3>
        <Accordion type="single" collapsible className="w-full">
          {FAQ_ITEMS.map((faq, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="border-border">
              <AccordionTrigger className="text-sm text-foreground hover:no-underline">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
}
