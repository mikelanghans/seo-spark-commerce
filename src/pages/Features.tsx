import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { useNavigate } from "react-router-dom";
import brandAuraIcon from "@/assets/brand-aura-icon-new.png";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-4 print:break-inside-avoid">
    <h2 className="text-xl font-bold text-foreground border-b border-border pb-2 print:text-black">{title}</h2>
    {children}
  </section>
);

const Sub = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-1.5 print:break-inside-avoid">
    <h3 className="text-sm font-semibold text-foreground print:text-black">{title}</h3>
    <div className="text-sm text-secondary-foreground leading-relaxed print:text-gray-700">{children}</div>
  </div>
);

const Li = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-start gap-2 text-sm text-secondary-foreground print:text-gray-700">
    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary print:bg-black" />
    <span>{children}</span>
  </li>
);

const Features = () => {
  const navigate = useNavigate();

  const handlePrint = () => window.print();

  return (
    <div className="min-h-screen bg-background print:bg-white">
      {/* Header — hidden in print */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <img src={brandAuraIcon} alt="Brand Aura" className="h-8 w-8 object-contain" />
            <h1 className="text-lg font-bold">Feature Guide</h1>
          </div>
          <Button onClick={handlePrint} className="gap-2">
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        </div>
      </header>

      {/* Print-only header */}
      <div className="hidden print:block print:mb-8 print:text-center">
        <h1 className="text-3xl font-bold text-black">Brand Aura — Complete Feature Guide</h1>
        <p className="mt-1 text-sm text-gray-500">Generated {new Date().toLocaleDateString()}</p>
      </div>

      <main className="mx-auto max-w-4xl space-y-10 px-6 py-10 print:space-y-8 print:py-0">

        {/* Overview */}
        <div className="rounded-xl border border-border bg-card p-6 print:border-gray-300 print:bg-white">
          <p className="text-sm leading-relaxed text-secondary-foreground print:text-gray-700">
            Brand Aura is an AI-powered product listing and brand management platform. It helps e-commerce sellers create, optimize, and push product listings across multiple marketplaces — all from a single dashboard.
          </p>
        </div>

        {/* 1. Brand Management */}
        <Section title="1. Brand Management">
          <Sub title="Creating Brands">
            <p>Each brand represents a separate business identity with its own name, niche, voice & tone, target audience, and logo.</p>
          </Sub>
          <Sub title="Design Styling (per brand)">
            <ul className="space-y-1 mt-1">
              <Li>Preferred font style (e.g. bold sans-serif, handwritten script)</Li>
              <Li>Brand color — primary ink/text color for designs</Li>
              <Li>Text size preference — small, medium, large, or extra-large</Li>
              <Li>Additional style notes — free-form design instructions</Li>
              <Li>Design styles — text-only, minimalist art, or both</Li>
            </ul>
          </Sub>
          <Sub title="Enabled Marketplaces (per brand)">
            <p>Choose which marketplaces this brand sells on: Shopify, Printify, Etsy, eBay, Meta/Facebook. Only enabled marketplaces appear in listing generation and the push tab. If none are selected, all are shown by default.</p>
          </Sub>
          <Sub title="Other">
            <ul className="space-y-1 mt-1">
              <Li>Default mockup template — fallback image for AI color variant generation</Li>
              <Li>Printify shop mapping — route products to the correct fulfillment shop</Li>
              <Li>Archiving & restoring — soft-delete brands and restore within 30 days</Li>
            </ul>
          </Sub>
        </Section>

        {/* 2. Products */}
        <Section title="2. Products">
          <Sub title="Adding Products">
            <ul className="space-y-1 mt-1">
              <Li><strong>Manual Entry</strong> — fill in title, description, keywords, category, price, and features</Li>
              <Li><strong>AI from Images / CSV</strong> — bulk import with optional AI auto-fill</Li>
              <Li><strong>Import from Shopify</strong> — pull your existing Shopify catalog</Li>
            </ul>
          </Sub>
          <Sub title="AI Auto-Fill">
            <p>Upload a product image and AI automatically populates title, description, features, category, keywords, and suggested price.</p>
          </Sub>
          <Sub title="Product Detail View">
            <p>Each product has three tabs: <strong>Mockups</strong> (color variants), <strong>Listings</strong> (marketplace SEO), and <strong>Push</strong> (send to connected stores).</p>
          </Sub>
        </Section>

        {/* 3. AI Design Generation */}
        <Section title="3. AI Design Generation">
          <Sub title="Message Ideas">
            <p>Generate marketing messages and promotional designs. Swipe right to keep, left to skip. Light and dark design variants are generated automatically.</p>
          </Sub>
          <Sub title="Design Processing">
            <ul className="space-y-1 mt-1">
              <Li>Transparent PNG output with automatic background removal</Li>
              <Li>High-quality upscaling to 4500px wide (~269 DPI) for print</Li>
              <Li>All processing done client-side using the browser Canvas API</Li>
            </ul>
          </Sub>
        </Section>

        {/* 4. Color Variant Mockups */}
        <Section title="4. Color Variant Mockups">
          <Sub title="How It Works">
            <ul className="space-y-1 mt-1">
              <Li>Design is overlaid onto the template image client-side (pre-compositing)</Li>
              <Li>AI recolors the garment fabric only — no need to re-place the design</Li>
              <Li>Produces consistent results across all color variants</Li>
            </ul>
          </Sub>
          <Sub title="Smart Features">
            <ul className="space-y-1 mt-1">
              <Li>Design scale: 75% of template width, positioned ~22% from top</Li>
              <Li>Dynamic ink color: light garments get dark ink, dark garments get bright white</Li>
              <Li>Black variant always generated first as the hero image</Li>
              <Li>Color accuracy via COLOR_SWATCH_HINTS dictionary with descriptive targets</Li>
              <Li>Composition lock preserves exact framing, lighting, and props</Li>
            </ul>
          </Sub>
        </Section>

        {/* 5. AI Listings */}
        <Section title="5. AI-Generated Listings">
          <Sub title="What's Generated">
            <p>SEO-optimized listings tailored per marketplace, including: title, description, bullet points, tags/keywords, meta title, meta description, URL handle, and image alt text.</p>
          </Sub>
          <Sub title="Supported Marketplaces">
            <p>Etsy, eBay, and Shopify — each with platform-appropriate formatting. Bulk generation available for all products at once.</p>
          </Sub>
        </Section>

        {/* 6. Push to Marketplaces */}
        <Section title="6. Push to Marketplaces">
          <Sub title="Shopify">
            <p>Push products with SEO metadata, images, and color variants. Supports creating new and updating existing products. Auto-adds "T-shirts" tag. Status toggle for active/draft.</p>
          </Sub>
          <Sub title="Printify">
            <p>Push designs for print-on-demand fulfillment. Automatic color name matching, dynamic variant fetching, and Printify Choice provider prioritization.</p>
          </Sub>
          <Sub title="Etsy, eBay, Meta">
            <p>Push listings with images to connected accounts. Each requires API credentials configured in Settings.</p>
          </Sub>
          <Sub title="Multi-Store Sync Dashboard">
            <p>Unified view of listing status across all marketplaces with indicators: Total, Not Listed, Partial, Fully Synced.</p>
          </Sub>
        </Section>

        {/* 7. Autopilot */}
        <Section title="7. Autopilot Pipeline">
          <Sub title="Full Autopilot">
            <p>Zero-touch workflow automating the entire lifecycle in 8 steps:</p>
            <ol className="mt-2 space-y-1 list-decimal list-inside text-sm text-secondary-foreground print:text-gray-700">
              <li>Message — generate marketing message</li>
              <li>Design — create AI design graphic</li>
              <li>Product — save product record</li>
              <li>Colors — recommend color palette</li>
              <li>Mockups — generate color variants (skipped if no template)</li>
              <li>Listing — generate SEO listings</li>
              <li>Printify — push to Printify</li>
              <li>Shopify — push to Shopify</li>
            </ol>
          </Sub>
          <Sub title="Pipeline Persistence">
            <p>Jobs are saved to the database. Incomplete jobs can be resumed if you leave and come back.</p>
          </Sub>
        </Section>

        {/* 8. Social */}
        <Section title="8. Social Media">
          <Sub title="Social Post Generator">
            <p>Generate platform-specific captions for Instagram, Facebook, Twitter/X, and TikTok with AI-generated hashtags and optional social images.</p>
          </Sub>
          <Sub title="Content Calendar">
            <p>Schedule and organize social posts on a visual calendar view.</p>
          </Sub>
        </Section>

        {/* 9. Collaboration */}
        <Section title="9. Collaboration">
          <Sub title="Team Roles">
            <ul className="space-y-1 mt-1">
              <Li><strong>Owners</strong> — full control over the brand</Li>
              <Li><strong>Editors</strong> — can create and modify products, generate content</Li>
              <Li><strong>Viewers</strong> — read-only access to brand data</Li>
            </ul>
          </Sub>
          <Sub title="Invitations">
            <p>Invite members by email or shareable link. Manage all invitations from the Collaboration Hub in Settings.</p>
          </Sub>
          <Sub title="AI Credit Sharing">
            <p>Collaborator actions deduct from the brand owner's pool first. If exhausted, collaborators can contribute from their own pool automatically (with a notification).</p>
          </Sub>
        </Section>

        {/* 10. AI Credits */}
        <Section title="10. AI Credits & Usage">
          <Sub title="Subscription Tiers">
            <ul className="space-y-1 mt-1">
              <Li><strong>Free</strong> — 25 AI credits/month</Li>
              <Li><strong>Starter</strong> ($9/mo) — 175 AI credits/month</Li>
              <Li><strong>Pro</strong> ($29/mo) — 700 AI credits/month + Shopify sync</Li>
            </ul>
          </Sub>
          <Sub title="Credit Packs (One-Time Top-Ups)">
            <p>10 credits for $3 • 50 credits for $10 • 200 credits for $29. Packs stack with your monthly balance.</p>
          </Sub>
          <Sub title="Credit Flow">
            <ol className="mt-2 space-y-1 list-decimal list-inside text-sm text-secondary-foreground print:text-gray-700">
              <li>Owner has credits → deducts from owner's pool</li>
              <li>Owner exhausted + collaborator has credits → deducts from collaborator's pool</li>
              <li>Both exhausted → blocked with upgrade prompt</li>
            </ol>
          </Sub>
          <Sub title="Usage Transparency">
            <p>Every AI action costs exactly 1 credit. The sidebar usage meter shows remaining credits with a "What costs credits?" breakdown.</p>
          </Sub>
        </Section>

        {/* 11. Settings */}
        <Section title="11. Settings & Integrations">
          <ul className="space-y-1">
            <Li><strong>Shopify</strong> — OAuth-based connection with multi-tenant support</Li>
            <Li><strong>Etsy</strong> — API key + Shop ID</Li>
            <Li><strong>eBay</strong> — Client ID + Secret (sandbox or production)</Li>
            <Li><strong>Meta / Facebook</strong> — Catalog ID + System User Access Token</Li>
            <Li><strong>Collaboration Hub</strong> — manage team members and invites across all brands</Li>
          </ul>
        </Section>

        {/* 12. A/B Testing */}
        <Section title="12. A/B Testing">
          <Sub title="How It Works">
            <p>Generate two listing variants (Original vs. AI challenger) for any product. The system tracks views and sales via the Shopify API.</p>
          </Sub>
          <Sub title="Dashboard">
            <p>Visual comparison of key metrics. Tests run for a configurable duration and winners can be promoted to the live storefront.</p>
          </Sub>
        </Section>

        {/* 13. Notifications */}
        <Section title="13. Notifications">
          <Sub title="In-App Alerts">
            <ul className="space-y-1 mt-1">
              <Li>Bell icon in top nav with unread badge + full list in sidebar</Li>
              <Li>Type-specific icons for sync failures, low credits, team invites</Li>
              <Li>Real-time delivery via database subscriptions</Li>
              <Li>Mark as read, dismiss, or clear all</Li>
            </ul>
          </Sub>
          <Sub title="Email Alerts">
            <p>Email notifications for critical events like sync failures and low credits. Requires email domain configuration.</p>
          </Sub>
        </Section>

        {/* 14. Bulk Actions */}
        <Section title="14. Bulk Actions">
          <p className="text-sm text-secondary-foreground print:text-gray-700">
            Select multiple products to perform batch operations: bulk push to marketplaces, bulk delete, or bulk regenerate SEO listings — all from the product list toolbar.
          </p>
        </Section>

        {/* 15. Onboarding */}
        <Section title="15. Onboarding Tour">
          <p className="text-sm text-secondary-foreground print:text-gray-700">
            An interactive guided tour walks new users through all key features. Auto-launches on first visit, accessible anytime via the "Tour" button, with a "Don't show again" checkbox.
          </p>
        </Section>

        {/* Footer */}
        <div className="border-t border-border pt-6 text-center text-xs text-muted-foreground print:text-gray-400 print:border-gray-300">
          Brand Aura — AI-Powered Product Listing Platform
        </div>
      </main>
    </div>
  );
};

export default Features;
