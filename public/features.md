# Brand Aura — Complete Feature Guide

## Overview

Brand Aura is an AI-powered product listing and brand management platform. It helps e-commerce sellers create, optimize, and push product listings across multiple marketplaces — all from a single dashboard.

---

## 1. Brand Management

### Creating Brands
Each brand (organization) represents a separate business identity with its own:
- **Brand Name** — your business or store name
- **Niche / Industry** — what type of products you sell
- **Voice & Tone** — how AI writes content (casual, bold, professional, etc.)
- **Target Audience** — who your ideal customers are
- **Brand Logo** — displayed on brand cards for quick identification

### Design Styling (per brand)
Controls how AI generates product designs:
- **Preferred Font Style** — e.g. bold sans-serif, handwritten script
- **Brand Color** — primary ink/text color for designs
- **Text Size Preference** — small, medium, large, or extra-large
- **Additional Style Notes** — free-form design instructions
- **Design Styles** — text-only, minimalist art, or both

### Enabled Marketplaces (per brand)
Choose which marketplaces this brand sells on:
- Shopify, Printify, Amazon, Etsy, eBay, Meta/Facebook
- Only enabled marketplaces appear in listing generation and the push tab
- If none are selected, all marketplaces are shown by default

### Default Mockup Template
A fallback garment/product image used for AI color variant generation when a product doesn't have its own source image.

### Printify Shop Mapping
Each brand can be mapped to a specific Printify shop for accurate fulfillment routing.

### Archiving & Restoring
Brands can be soft-deleted (archived) and restored within 30 days.

---

## 2. Products

### Adding Products
Three ways to add products:
1. **Manual Entry** — fill in title, description, keywords, category, price, and features
2. **AI from Images / CSV** — bulk import with optional AI auto-fill
3. **Import from Shopify** — pull your existing Shopify catalog

### AI Auto-Fill
When enabled, uploading a product image triggers AI analysis that automatically populates:
- Title, description, features, category, keywords, and suggested price

### Product Detail View
Each product has three tabs:
- **Mockups** — color variant mockup images
- **Listings** — marketplace-specific SEO listings
- **Push** — buttons to push to connected marketplaces

---

## 3. AI Design Generation

### Message Ideas
Generate marketing messages and promotional designs for your products:
- AI creates text messages tailored to your brand voice
- Each message can get a matching AI-generated design graphic
- **Swipe interface** — swipe right to keep, left to skip
- Light and dark design variants are generated automatically

### Design Processing
- Designs are generated as transparent PNGs
- Background removal and edge cleanup happen client-side
- High-quality upscaling to 4500px wide (~269 DPI) for print readiness
- All processing uses the browser's Canvas API to avoid server limits

---

## 4. Color Variant Mockups

### How It Works
1. A design is overlaid onto the template image client-side (pre-compositing)
2. The AI then recolors the garment fabric only — it doesn't need to place the design
3. This produces consistent, reliable results across all colors

### Technical Details
- Design scale: 75% of template width, positioned ~22% from the top
- **Ink color switching**: light garments get dark ink, dark garments get bright white ink
- **Black is hero**: the Black variant is always generated first and assigned position 0
- Color accuracy uses a `COLOR_SWATCH_HINTS` dictionary with descriptive targets and near-HEX values
- The composition lock system ensures AI preserves exact framing, lighting, and props

### Manual Upload
You can also upload your own mockup images. Filenames are used as color names (e.g. `Ocean Blue.png`).

---

## 5. AI Listings

### Generation
Generate SEO-optimized listings for your enabled marketplaces with one click. Each listing includes:
- **Title** — keyword-rich product title
- **Description** — compelling product description
- **Bullet Points** — key selling features
- **Tags / Keywords** — for search discoverability
- **SEO Metadata** — meta title, meta description, URL handle, image alt text

### Marketplace-Specific
Listings are tailored per marketplace (Amazon, Etsy, eBay, Shopify) with platform-appropriate formatting and keyword strategies.

### Bulk Generation
Generate listings for all products at once from the products list view.

---

## 6. Push to Marketplaces

### Shopify
- Push products with SEO metadata, images, and color variants
- Supports both creating new products and updating existing ones
- Products include a status toggle (active/draft)
- Mandatory "T-shirts" tag is auto-added for storefront categorization
- Image optimization for Shopify's requirements

### Printify
- Push designs to Printify for print-on-demand fulfillment
- Automatic color name matching using the `MOCKUP_TO_PRINTIFY` dictionary
- Dynamic variant and print area fetching from Printify's catalog API
- Prioritizes Printify Choice (provider 99) when available

### Etsy, eBay, Meta
- Push listings with images to connected marketplace accounts
- Each requires API credentials configured in Settings

### Multi-Store Sync Dashboard
A unified view showing product listing status across all marketplaces:
- Status indicators: Total, Not Listed, Partial, Fully Synced
- Quick navigation to products that need attention

---

## 7. Autopilot Pipeline

### Full Autopilot
A zero-touch workflow that automates the entire product lifecycle:
1. **Message** — generate marketing message
2. **Design** — create AI design graphic
3. **Product** — save product record
4. **Colors** — recommend color palette
5. **Mockups** — generate color variant mockups (skipped if no template)
6. **Listing** — generate SEO listings
7. **Printify** — push to Printify
8. **Shopify** — push to Shopify (final step)

### Bulk Upload Pipeline
Upload multiple product folders at once. Each folder contains a design file and optional mockup images. The pipeline processes them in parallel with configurable concurrency.

### Pipeline Persistence
Pipeline jobs are saved to the database. If you leave and come back, incomplete jobs can be resumed.

---

## 8. Social Media

### Social Post Generator
Generate social media posts for your products:
- Platform-specific captions (Instagram, Facebook, Twitter/X, TikTok)
- AI-generated hashtags
- Optional AI-generated social images

### Content Calendar
Schedule and organize social posts on a visual calendar view.

---

## 9. Collaboration

### Team Management
- **Owners** — full control over the brand
- **Editors** — can create and modify products, generate content
- **Viewers** — read-only access to brand data

### Invitations
- Invite team members by email or shareable link
- Manage all invitations from the Collaboration Hub in Settings
- Organization creators are automatically assigned the owner role via a database trigger

### AI Credit Sharing
- When a collaborator uses AI on a shared brand, it deducts from the **brand owner's** pool first
- If the owner's pool is exhausted, collaborators can **contribute from their own pool** automatically
- A toast notification informs them when their own credits are being used

---

## 10. AI Credits & Usage

### Free Tier
- **20 AI generations per month** per account
- Credits are pooled across **all brands you own**
- Usage is tracked in the `ai_usage_log` table with granular data (org, user, function)

### Usage Meter
A progress bar in the dashboard header shows remaining credits at a glance.

### Credit Flow
1. Owner has credits → deducts from owner's pool
2. Owner exhausted + collaborator has credits → deducts from collaborator's pool (with notification)
3. Both exhausted → blocked with upgrade prompt

### Pro Tier (Coming Soon)
$19/month for unlimited AI generations and full Shopify sync.

---

## 11. Settings & Integrations

### Shopify Connection
OAuth-based connection with Client ID and Client Secret. Supports multi-tenant architecture for multiple stores.

### Marketplace Connections
- **Etsy** — API key + Shop ID
- **eBay** — Client ID + Client Secret (sandbox or production)
- **Meta / Facebook** — Catalog ID + System User Access Token

### Collaboration Hub
Centralized view to manage team members and pending invitations across all brands.

---

## 12. Onboarding Tour

An interactive 12-step guided tour walks new users through all key features:
- Auto-launches on first visit
- Accessible anytime via the "Tour" button in the header
- Includes a "Don't show again" checkbox for returning users

---

## Architecture Notes

- **Frontend**: React + Vite + Tailwind CSS + TypeScript
- **Backend**: Lovable Cloud (Supabase) for auth, database, storage, and edge functions
- **AI**: Lovable AI Gateway (Gemini + OpenAI models) — no separate API keys needed
- **Image Processing**: Client-side Canvas API for background removal, upscaling, and composition
- **Security**: Row Level Security (RLS) with organization membership checks
- **Multi-tenancy**: Organization-based data isolation with owner/editor/viewer roles
