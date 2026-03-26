import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sparkles, Copy, Check, Hash, Save, ImagePlus, ChevronsUpDown, X } from "lucide-react";
import { toast } from "sonner";
import { handleAiError } from "@/lib/aiErrors";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

interface Organization {
  id: string;
  name: string;
  niche: string;
  tone: string;
  audience: string;
  enabled_social_platforms?: string[];
}

interface Product {
  id: string;
  title: string;
  description: string;
  keywords: string;
  category: string;
  price: string;
  features: string;
  image_url?: string | null;
}

interface SocialPost {
  caption: string;
  hashtags: string[];
}

const ALL_PLATFORMS = [
  { id: "instagram", label: "Instagram", icon: "📸" },
  { id: "tiktok", label: "TikTok", icon: "🎵" },
  { id: "x", label: "X (Twitter)", icon: "𝕏" },
  { id: "facebook", label: "Facebook", icon: "📘" },
] as const;

interface AiUsage {
  checkAndLog: (fn: string, userId: string) => Promise<boolean>;
  logUsage: (fn: string, userId: string) => Promise<void>;
}

export function SocialPostGenerator({
  organization,
  products,
  userId,
  aiUsage,
}: {
  organization: Organization;
  products: Product[];
  userId: string;
  aiUsage?: AiUsage;
}) {
  const enabledPlatforms = organization.enabled_social_platforms?.length
    ? ALL_PLATFORMS.filter((p) => organization.enabled_social_platforms!.includes(p.id))
    : [];

  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(() => enabledPlatforms.map((p) => p.id));
  const [posts, setPosts] = useState<Record<string, SocialPost>>({});
  const [postImages, setPostImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [generatingImage, setGeneratingImage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleProduct = (id: string) => {
    setSelectedProducts((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const removeProduct = (id: string) => {
    setSelectedProducts((prev) => prev.filter((p) => p !== id));
  };

  const selectedProductObjects = products.filter((p) => selectedProducts.includes(p.id));
  // Use the first selected product as the "primary" for AI generation
  const primaryProduct = selectedProductObjects[0] || null;

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const generate = async () => {
    if (!primaryProduct) { toast.error("Select at least one product"); return; }
    if (selectedPlatforms.length === 0) { toast.error("Select at least one platform"); return; }

    if (aiUsage) {
      const allowed = await aiUsage.checkAndLog("generate-social-posts", userId);
      if (!allowed) return;
    }

    setLoading(true);
    setPosts({});
    setPostImages({});

    try {
      // Build product context including all selected products
      const productContext = selectedProductObjects.length === 1
        ? { title: primaryProduct.title, description: primaryProduct.description, category: primaryProduct.category, price: primaryProduct.price, keywords: primaryProduct.keywords }
        : {
            title: primaryProduct.title,
            description: primaryProduct.description,
            category: primaryProduct.category,
            price: primaryProduct.price,
            keywords: primaryProduct.keywords,
            additionalProducts: selectedProductObjects.slice(1).map((p) => ({
              title: p.title,
              category: p.category,
              price: p.price,
            })),
          };

      const { data, error } = await supabase.functions.invoke("generate-social-posts", {
        body: {
          business: { name: organization.name, niche: organization.niche, tone: organization.tone, audience: organization.audience },
          product: productContext,
          platforms: selectedPlatforms,
        },
      });

      if (handleAiError(error, data, "Failed to generate posts")) { setLoading(false); return; }
      if (data?.error) throw new Error(data.error);

      setPosts(data);
      if (aiUsage) await aiUsage.logUsage("generate-social-posts", userId);
      toast.success("Social posts generated!");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate posts");
    } finally {
      setLoading(false);
    }
  };

  const generateImage = async (platform: string) => {
    if (!primaryProduct) return;

    setGeneratingImage(platform);
    try {
      if (aiUsage) {
        const allowed = await aiUsage.checkAndLog("generate-social-image", userId);
        if (!allowed) { setGeneratingImage(null); return; }
      }
      const { data, error } = await supabase.functions.invoke("generate-social-image", {
        body: {
          productTitle: primaryProduct.title,
          productDescription: primaryProduct.description,
          brandName: organization.name,
          brandNiche: organization.niche,
          platform,
          imageUrl: primaryProduct.image_url || undefined,
        },
      });

      if (handleAiError(error, data, "Failed to generate image")) { setGeneratingImage(null); return; }
      if (data?.error) throw new Error(data.error);

      setPostImages((prev) => ({ ...prev, [platform]: data.imageUrl }));
      if (aiUsage) await aiUsage.logUsage("generate-social-image", userId);
      toast.success(`${platform} image generated!`);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate image");
    } finally {
      setGeneratingImage(null);
    }
  };

  const copyToClipboard = async (platform: string, post: SocialPost) => {
    const hashtagStr = post.hashtags.map((h) => `#${h}`).join(" ");
    await navigator.clipboard.writeText(`${post.caption}\n\n${hashtagStr}`);
    setCopiedId(platform);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const saveAll = async () => {
    if (!primaryProduct) return;

    setSaving(true);
    try {
      // Save a post row for each selected product × platform combination
      const rows = Object.entries(posts).flatMap(([platform, post]) =>
        selectedProducts.map((productId) => ({
          product_id: productId,
          organization_id: organization.id,
          user_id: userId,
          platform,
          caption: post.caption,
          hashtags: post.hashtags,
          image_url: postImages[platform] || "",
        }))
      );

      const { error } = await supabase.from("social_posts").insert(rows as any);
      if (error) throw error;
      toast.success("Posts saved!");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Social Media Post Generator</h3>
        <p className="text-sm text-muted-foreground">Generate platform-specific captions, hashtags, and images</p>
      </div>

      {/* Product selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Select Products</label>
        <p className="text-xs text-muted-foreground">Choose one or more products (e.g., same design on different product types)</p>

        {/* Selected product chips */}
        {selectedProductObjects.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {selectedProductObjects.map((p) => (
              <Badge
                key={p.id}
                variant="secondary"
                className="flex items-center gap-1.5 pl-1 pr-2 py-1 text-sm"
              >
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="h-5 w-5 rounded object-cover" />
                ) : (
                  <div className="h-5 w-5 rounded bg-muted" />
                )}
                <span className="max-w-[200px] truncate">{p.title}</span>
                <button
                  onClick={() => removeProduct(p.id)}
                  className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <Popover open={productPickerOpen} onOpenChange={setProductPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={productPickerOpen}
              className="w-full justify-between h-auto min-h-10 py-2"
            >
              <span className="text-muted-foreground">
                {selectedProducts.length === 0
                  ? "Choose products…"
                  : `${selectedProducts.length} product${selectedProducts.length > 1 ? "s" : ""} selected`}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search products…" />
              <CommandList>
                <CommandEmpty>No products found.</CommandEmpty>
                <CommandGroup>
                  {products.map((p) => {
                    const isSelected = selectedProducts.includes(p.id);
                    return (
                      <CommandItem
                        key={p.id}
                        value={p.title}
                        onSelect={() => toggleProduct(p.id)}
                        className="flex items-center gap-3 py-2"
                      >
                        <Checkbox checked={isSelected} className="h-4 w-4 shrink-0" />
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt=""
                            className="h-8 w-8 rounded object-cover shrink-0"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted shrink-0" />
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="truncate text-sm">{p.title}</span>
                          {p.category && (
                            <span className="text-xs text-muted-foreground truncate">{p.category}</span>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Platform selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Platforms</label>
        {enabledPlatforms.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No social platforms enabled. Go to <strong>Settings → Social Platforms</strong> to enable platforms for this brand.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {enabledPlatforms.map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  selectedPlatforms.includes(p.id) ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground"
                }`}
              >
                <Checkbox checked={selectedPlatforms.includes(p.id)} onCheckedChange={() => togglePlatform(p.id)} className="h-4 w-4" />
                <span>{p.icon}</span>
                <span>{p.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <Button onClick={generate} disabled={loading || selectedProducts.length === 0 || selectedPlatforms.length === 0} className="gap-2">
        {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Sparkles className="h-4 w-4" /> Generate Posts</>}
      </Button>

      {/* Results */}
      {Object.keys(posts).length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Generated Posts</h4>
            <Button variant="outline" size="sm" onClick={saveAll} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save All {selectedProducts.length > 1 && `(${selectedProducts.length} products)`}
            </Button>
          </div>

          {enabledPlatforms.filter((p) => posts[p.id]).map((platform) => {
            const post = posts[platform.id];
            const image = postImages[platform.id];
            const isGeneratingThis = generatingImage === platform.id;

            return (
              <div key={platform.id} className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{platform.icon}</span>
                    <span className="font-semibold">{platform.label}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => generateImage(platform.id)}
                      disabled={!!generatingImage}
                      className="gap-1.5"
                    >
                      {isGeneratingThis ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                      ) : (
                        <><ImagePlus className="h-3.5 w-3.5" /> {image ? "Regenerate" : "Add Image"}</>
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(platform.id, post)} className="gap-1.5">
                      {copiedId === platform.id ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                    </Button>
                  </div>
                </div>

                {image && (
                  <div className="rounded-lg overflow-hidden border border-border">
                    <img src={image} alt={`${platform.label} promo`} className="w-full max-h-[300px] object-contain bg-muted/30" />
                  </div>
                )}

                <p className="whitespace-pre-wrap text-sm leading-relaxed">{post.caption}</p>

                <div className="flex flex-wrap gap-1.5">
                  <Hash className="h-4 w-4 text-muted-foreground mt-0.5" />
                  {post.hashtags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">#{tag}</Badge>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
