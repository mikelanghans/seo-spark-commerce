import { CREDIT_COSTS } from "@/lib/creditCosts";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sparkles, Image, Palette, FileText, MessageSquare, Share2, DollarSign, HelpCircle } from "lucide-react";

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
          Every AI feature has a fixed credit cost. No surprises.
        </p>
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
