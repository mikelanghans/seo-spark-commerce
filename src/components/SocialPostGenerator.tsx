import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sparkles, Copy, Check, Hash, Save, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { handleAiError } from "@/lib/aiErrors";

interface Organization {
  id: string;
  name: string;
  niche: string;
  tone: string;
  audience: string;
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

const PLATFORMS = [
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
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram", "tiktok", "x", "facebook"]);
  const [posts, setPosts] = useState<Record<string, SocialPost>>({});
  const [postImages, setPostImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [generatingImage, setGeneratingImage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const generate = async () => {
    const product = products.find((p) => p.id === selectedProduct);
    if (!product) { toast.error("Select a product first"); return; }
    if (selectedPlatforms.length === 0) { toast.error("Select at least one platform"); return; }

    if (aiUsage) {
      const allowed = await aiUsage.checkAndLog("generate-social-posts", userId);
      if (!allowed) return;
    }

    setLoading(true);
    setPosts({});
    setPostImages({});

    try {
      const { data, error } = await supabase.functions.invoke("generate-social-posts", {
        body: {
          business: { name: organization.name, niche: organization.niche, tone: organization.tone, audience: organization.audience },
          product: { title: product.title, description: product.description, category: product.category, price: product.price, keywords: product.keywords },
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
    const product = products.find((p) => p.id === selectedProduct);
    if (!product) return;

    setGeneratingImage(platform);
    try {
      if (aiUsage) {
        const allowed = await aiUsage.checkAndLog("generate-social-image", userId);
        if (!allowed) { setGeneratingImage(null); return; }
      }
      const { data, error } = await supabase.functions.invoke("generate-social-image", {
        body: {
          productTitle: product.title,
          productDescription: product.description,
          brandName: organization.name,
          brandNiche: organization.niche,
          platform,
          imageUrl: product.image_url || undefined,
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
    const product = products.find((p) => p.id === selectedProduct);
    if (!product) return;

    setSaving(true);
    try {
      const rows = Object.entries(posts).map(([platform, post]) => ({
        product_id: product.id,
        organization_id: organization.id,
        user_id: userId,
        platform,
        caption: post.caption,
        hashtags: post.hashtags,
        image_url: postImages[platform] || "",
      }));

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
        <label className="text-sm font-medium">Select Product</label>
        <select
          value={selectedProduct}
          onChange={(e) => setSelectedProduct(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Choose a product…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
      </div>

      {/* Platform selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Platforms</label>
        <div className="flex flex-wrap gap-3">
          {PLATFORMS.map((p) => (
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
      </div>

      <Button onClick={generate} disabled={loading || !selectedProduct || selectedPlatforms.length === 0} className="gap-2">
        {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Sparkles className="h-4 w-4" /> Generate Posts</>}
      </Button>

      {/* Results */}
      {Object.keys(posts).length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Generated Posts</h4>
            <Button variant="outline" size="sm" onClick={saveAll} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save All
            </Button>
          </div>

          {PLATFORMS.filter((p) => posts[p.id]).map((platform) => {
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
