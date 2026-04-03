import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PRODUCT_TYPES, type ProductTypeKey } from "@/lib/productTypes";
import { DESIGN_STYLE_DESCRIPTIONS } from "@/lib/designStyles";
import type { Organization, View } from "@/types/dashboard";
import type { OrgFormState } from "@/types/dashboard";
import { ProductTypeSettings } from "@/components/ProductTypeSettings";
import {
  ArrowLeft, Plus, Check, ImageIcon, Package, DollarSign,
} from "lucide-react";

interface Props {
  editingOrg: Organization | null;
  orgForm: OrgFormState;
  setOrgForm: (f: OrgFormState) => void;
  orgLogoPreview: string | null;
  userId: string;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
  
  onLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const OrgFormView = ({
  editingOrg, orgForm, setOrgForm, orgLogoPreview,
  userId,
  onSubmit, onBack, onLogoUpload,
}: Props) => (
  <form onSubmit={onSubmit} className="space-y-8">
    <div className="flex items-center gap-3">
      <Button type="button" variant="ghost" size="icon" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <div>
        <h2 className="text-2xl font-bold">{editingOrg ? "Edit Brand" : "New Brand"}</h2>
        <p className="text-sm text-muted-foreground">{editingOrg ? "Update your brand context — this affects how AI writes your content" : "Define your brand voice — AI uses this to tailor all generated content"}</p>
      </div>
    </div>
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Brand Name</Label>
        <Input value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} required placeholder="e.g. Wildberry Crafts" />
        <p className="text-xs text-muted-foreground">Your business or brand name</p>
      </div>
      <div className="space-y-2">
        <Label>Niche / Industry</Label>
        <Textarea value={orgForm.niche} onChange={(e) => setOrgForm({ ...orgForm, niche: e.target.value })} required placeholder="e.g. Custom t-shirts, handmade candles" rows={2} className="resize-none" />
        <p className="text-xs text-muted-foreground">What type of products you sell</p>
      </div>
      <div className="space-y-2">
        <Label>Brand Voice & Tone</Label>
        <Textarea value={orgForm.tone} onChange={(e) => setOrgForm({ ...orgForm, tone: e.target.value })} required placeholder="e.g. Warm & friendly, Bold & edgy" rows={2} className="resize-none" />
        <p className="text-xs text-muted-foreground">How AI should write — e.g. casual, professional, playful</p>
      </div>
      <div className="space-y-2">
        <Label>Target Audience</Label>
        <Textarea value={orgForm.audience} onChange={(e) => setOrgForm({ ...orgForm, audience: e.target.value })} required placeholder="e.g. Young professionals, gift shoppers" rows={2} className="resize-none" />
        <p className="text-xs text-muted-foreground">Who your ideal customers are</p>
      </div>
    </div>

    {/* Brand Logo */}
    <div className="space-y-2">
      <Label>Brand Logo (optional)</Label>
      <p className="text-xs text-muted-foreground">Displayed on your brand tile for quick identification</p>
      <input type="file" accept="image/*" onChange={onLogoUpload} className="hidden" id="org-logo-image" />
      {orgLogoPreview ? (
        <div className="relative overflow-hidden rounded-xl border border-border bg-card">
          <img src={orgLogoPreview} alt="Logo" className="mx-auto max-h-32 object-contain p-4" />
          <label htmlFor="org-logo-image" className="mt-2 block cursor-pointer text-center text-xs text-muted-foreground underline hover:text-foreground pb-2">Change logo</label>
        </div>
      ) : (
        <label htmlFor="org-logo-image" className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card/50 py-8 transition-colors hover:border-primary/50">
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">Upload brand logo</p>
        </label>
      )}
    </div>

    {/* Brand Font & Color */}
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Brand Font (optional)</Label>
        <Textarea value={orgForm.brand_font} onChange={(e) => setOrgForm({ ...orgForm, brand_font: e.target.value })} placeholder="e.g. Poppins, Montserrat" rows={2} className="resize-none" />
        <p className="text-xs text-muted-foreground">Font name used on your designs</p>
      </div>
      <div className="space-y-2">
        <Label>Brand Color (optional)</Label>
        <Textarea value={orgForm.brand_color} onChange={(e) => setOrgForm({ ...orgForm, brand_color: e.target.value })} placeholder="e.g. #FF5733" rows={2} className="resize-none" />
        <p className="text-xs text-muted-foreground">Primary brand color for designs</p>
      </div>
      <div className="space-y-2">
        <Label>Design Font Size</Label>
        <select value={orgForm.brand_font_size} onChange={(e) => setOrgForm({ ...orgForm, brand_font_size: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large (default)</option><option value="x-large">Extra Large</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label>Design Style Notes</Label>
        <Textarea value={orgForm.brand_style_notes} onChange={(e) => setOrgForm({ ...orgForm, brand_style_notes: e.target.value })} placeholder="e.g. Minimalist, bold typography" rows={3} className="resize-none" />
        <p className="text-xs text-muted-foreground">Style hints for AI-generated designs</p>
      </div>
    </div>

    {/* Design Variant Mode */}
    <div className="space-y-3">
      <div><h3 className="text-lg font-semibold">Design Ink Variants</h3><p className="text-xs text-muted-foreground">Choose which ink variants AI generates — light ink for dark shirts, dark ink for light shirts, or both</p></div>
      <div className="flex flex-wrap gap-2">
        {([
          { value: "both", label: "Both variants", description: "Light + dark ink" },
          { value: "light-only", label: "Light ink only", description: "For dark shirts" },
          { value: "dark-only", label: "Dark ink only", description: "For light shirts" },
        ] as const).map((option) => {
          const isSelected = (orgForm.design_variant_mode || "both") === option.value;
          return (
            <label key={option.value} className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 cursor-pointer transition-colors ${isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"}`}>
              <input type="radio" name="design_variant_mode" checked={isSelected} onChange={() => setOrgForm({ ...orgForm, design_variant_mode: option.value })} className="rounded" />
              <div>
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-xs text-muted-foreground ml-1.5">({option.description})</span>
              </div>
            </label>
          );
        })}
      </div>
    </div>

    {/* Design Styles */}
    <div className="space-y-3">
      <div><h3 className="text-lg font-semibold">Design Styles</h3><p className="text-xs text-muted-foreground">Select which styles AI should use when generating designs</p></div>
      <div className="grid gap-2 sm:grid-cols-2">
        {[{ value: "text-only", label: "Text Only" }, { value: "text-with-graphics", label: "Text + Graphics" }, { value: "minimalist", label: "Art" }, { value: "retro", label: "Retro" }, { value: "hand-drawn", label: "Sketch" }, { value: "bold-graphic", label: "Bold" }, { value: "distressed", label: "Grunge" }, { value: "illustration", label: "Illustration" }, { value: "photo-based", label: "Photo-Based" }].map((style) => {
          const isEnabled = orgForm.design_styles.includes(style.value);
          return (
            <label key={style.value} className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${isEnabled ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"}`}>
              <input type="checkbox" checked={isEnabled} onChange={() => { const newStyles = isEnabled ? orgForm.design_styles.filter((s) => s !== style.value) : [...orgForm.design_styles, style.value]; if (newStyles.length === 0) return; setOrgForm({ ...orgForm, design_styles: newStyles }); }} className="rounded mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{style.label}</span>
                {DESIGN_STYLE_DESCRIPTIONS[style.value] && (
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{DESIGN_STYLE_DESCRIPTIONS[style.value]}</p>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </div>



    {/* Enabled Marketplaces */}
    <div className="space-y-3">
      <div><h3 className="text-lg font-semibold">Enabled Marketplaces</h3><p className="text-xs text-muted-foreground">Select which marketplaces this brand sells on</p></div>
      <div className="flex flex-wrap gap-2">
        {[{ value: "etsy", label: "Etsy", icon: "🧶" }, { value: "ebay", label: "eBay", icon: "🏷️" }].map((mp) => {
          const isEnabled = orgForm.enabled_marketplaces.includes(mp.value);
          return (
            <label key={mp.value} className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 cursor-pointer transition-colors ${isEnabled ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"}`}>
              <input type="checkbox" checked={isEnabled} onChange={() => { const newMp = isEnabled ? orgForm.enabled_marketplaces.filter((m) => m !== mp.value) : [...orgForm.enabled_marketplaces, mp.value]; setOrgForm({ ...orgForm, enabled_marketplaces: newMp }); }} className="rounded" />
              <span className="text-base">{mp.icon}</span><span className="text-sm font-medium">{mp.label}</span>
            </label>
          );
        })}
      </div>
      {orgForm.enabled_marketplaces.length === 0 && <p className="text-xs text-muted-foreground">None selected — all marketplaces will be shown by default</p>}
    </div>

    {/* Social Media Platforms */}
    <div className="space-y-3">
      <div><h3 className="text-lg font-semibold">Social Media Platforms</h3><p className="text-xs text-muted-foreground">Choose which social platforms are available for post generation and scheduling</p></div>
      <div className="flex flex-wrap gap-2">
        {[{ value: "instagram", label: "Instagram", icon: "📸" }, { value: "facebook", label: "Facebook", icon: "📘" }, { value: "twitter", label: "Twitter / X", icon: "🐦" }, { value: "tiktok", label: "TikTok", icon: "🎵" }, { value: "pinterest", label: "Pinterest", icon: "📌" }].map((sp) => {
          const isEnabled = orgForm.enabled_social_platforms.includes(sp.value);
          return (
            <label key={sp.value} className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 cursor-pointer transition-colors ${isEnabled ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"}`}>
              <input type="checkbox" checked={isEnabled} onChange={() => { const newSp = isEnabled ? orgForm.enabled_social_platforms.filter((s) => s !== sp.value) : [...orgForm.enabled_social_platforms, sp.value]; setOrgForm({ ...orgForm, enabled_social_platforms: newSp }); }} className="rounded" />
              <span className="text-base">{sp.icon}</span><span className="text-sm font-medium">{sp.label}</span>
            </label>
          );
        })}
      </div>
      {orgForm.enabled_social_platforms.length === 0 && <p className="text-xs text-muted-foreground">No platforms enabled — enable at least one to use the Social Media tab</p>}
    </div>

    {/* Product Types */}
    <div className="space-y-3">
      <div><h3 className="text-lg font-semibold flex items-center gap-2"><Package className="h-5 w-5 text-primary" /> Product Types</h3><p className="text-xs text-muted-foreground">Select which product types this brand offers</p></div>
      <div className="flex flex-wrap gap-2">
        {Object.values(PRODUCT_TYPES).map((pt) => {
          const isEnabled = orgForm.enabled_product_types.includes(pt.key);
          return (
            <label key={pt.key} className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 cursor-pointer transition-colors ${isEnabled ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"}`}>
              <input type="checkbox" checked={isEnabled} onChange={() => { const newTypes = isEnabled ? orgForm.enabled_product_types.filter((t) => t !== pt.key) : [...orgForm.enabled_product_types, pt.key]; if (newTypes.length === 0) return; setOrgForm({ ...orgForm, enabled_product_types: newTypes }); }} className="rounded" />
              <span className="text-sm font-medium">{pt.label}</span>
            </label>
          );
        })}
      </div>
    </div>

    {/* Per-Product-Type Mockup Templates */}
    <div className="rounded-xl border border-border bg-card p-5">
      {editingOrg ? (
        <ProductTypeSettings organizationId={editingOrg.id} />
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Package className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Mockup Templates</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Upload a base garment photo for each product type. These are used as AI mockup generation templates.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {orgForm.enabled_product_types.map((key) => {
              const pt = PRODUCT_TYPES[key as ProductTypeKey];
              if (!pt) return null;
              return (
                <div key={key} className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-3 opacity-60">
                  <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-border bg-muted/50">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{pt.label}</p>
                    <p className="text-xs text-muted-foreground">Save brand first to upload</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>

    {/* Size Pricing Defaults */}
    {orgForm.enabled_product_types.some((t) => PRODUCT_TYPES[t as ProductTypeKey]?.sizes?.length > 0) && (
      <div className="space-y-4">
        <div><h3 className="text-lg font-semibold flex items-center gap-2"><DollarSign className="h-5 w-5 text-primary" /> Default Size Pricing</h3><p className="text-xs text-muted-foreground">Set default prices per size for each product type</p></div>
        {orgForm.enabled_product_types.filter((t) => PRODUCT_TYPES[t as ProductTypeKey]?.sizes?.length > 0).map((typeKey) => {
          const pt = PRODUCT_TYPES[typeKey as ProductTypeKey];
          const currentPricing = orgForm.default_size_pricing[typeKey] || pt.defaultSizePricing;
          return (
            <div key={typeKey} className="rounded-lg border border-border p-4 space-y-3">
              <Label className="font-semibold">{pt.label}</Label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {pt.sizes.map((size) => (
                  <div key={size} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{size}</Label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                      <Input value={currentPricing[size] || pt.defaultSizePricing[size] || ""} onChange={(e) => { const newPricing = { ...orgForm.default_size_pricing }; if (!newPricing[typeKey]) newPricing[typeKey] = { ...pt.defaultSizePricing }; newPricing[typeKey][size] = e.target.value; setOrgForm({ ...orgForm, default_size_pricing: newPricing }); }} className="pl-6 h-9 text-sm" placeholder={pt.defaultSizePricing[size]} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    )}
    <div className="flex justify-end">
      <Button type="submit" className="gap-2">
        {editingOrg ? <><Check className="h-4 w-4" /> Save Changes</> : <><Plus className="h-4 w-4" /> Create</>}
      </Button>
    </div>
  </form>
);
