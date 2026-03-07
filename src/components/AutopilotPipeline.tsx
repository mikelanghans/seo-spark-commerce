import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Upload, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Sparkles, Rocket, ImageIcon, Eye, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Organization {
  id: string;
  name: string;
  niche: string;
  tone: string;
  audience: string;
}

interface Props {
  organization: Organization;
  userId: string;
  onComplete: () => void;
  onBack: () => void;
}

type StepStatus = "pending" | "active" | "done" | "error";

interface PipelineItem {
  fileName: string;
  step: "upload" | "analyze" | "listings" | "shopify" | "done";
  status: StepStatus;
  error?: string;
  productTitle?: string;
  productId?: string;
}

const STEPS = [
  { key: "upload", label: "Upload Image" },
  { key: "analyze", label: "AI Analyze" },
  { key: "listings", label: "Generate Listings + SEO" },
  { key: "shopify", label: "Push to Shopify" },
] as const;

export const AutopilotPipeline = ({ organization, userId, onComplete, onBack }: Props) => {
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [running, setRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [pushToShopify, setPushToShopify] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const totalDone = items.filter((i) => i.step === "done").length;
  const totalErrors = items.filter((i) => i.status === "error").length;
  const progress = items.length > 0 ? ((totalDone + totalErrors) / items.length) * 100 : 0;
  const isDone = !running && items.length > 0 && totalDone + totalErrors === items.length;

  const updateItem = (index: number, updates: Partial<PipelineItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleSelectFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) {
      toast.error("No image files selected");
      return;
    }

    const pipelineItems: PipelineItem[] = files.map((f) => ({
      fileName: f.name,
      step: "upload",
      status: "pending",
    }));
    setItems(pipelineItems);
    setRunning(true);
    setCurrentIndex(0);

    for (let i = 0; i < files.length; i++) {
      setCurrentIndex(i);
      const file = files[i];

      try {
        // Step 1: Upload image to storage
        updateItem(i, { step: "upload", status: "active" });
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("product-images").upload(path, file);
        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
        const imageUrl = urlData.publicUrl;

        // Step 2: AI analyze image
        updateItem(i, { step: "analyze", status: "active" });
        const base64 = await fileToBase64(file);
        const { data: analysis, error: analyzeError } = await supabase.functions.invoke("analyze-product", {
          body: { imageBase64: base64 },
        });
        if (analyzeError) throw new Error(`Analysis failed: ${analyzeError.message}`);
        if (analysis.error) throw new Error(`Analysis failed: ${analysis.error}`);

        const productData = {
          title: analysis.title || file.name.replace(/\.[^.]+$/, ""),
          description: analysis.description || "",
          features: (analysis.features || []).join("\n"),
          category: analysis.category || "",
          keywords: (analysis.keywords || []).join(", "),
          price: analysis.suggestedPrice || "",
        };

        updateItem(i, { productTitle: productData.title });

        // Save product to DB
        const { data: product, error: insertError } = await supabase
          .from("products")
          .insert({
            ...productData,
            image_url: imageUrl,
            organization_id: organization.id,
            user_id: userId,
          })
          .select()
          .single();
        if (insertError) throw new Error(`Save failed: ${insertError.message}`);

        updateItem(i, { productId: product.id });

        // Step 3: Generate listings + SEO
        updateItem(i, { step: "listings", status: "active" });
        const { data: listings, error: listError } = await supabase.functions.invoke("generate-listings", {
          body: {
            business: {
              name: organization.name,
              niche: organization.niche,
              tone: organization.tone,
              audience: organization.audience,
            },
            product: productData,
          },
        });
        if (listError) throw new Error(`Listing generation failed: ${listError.message}`);
        if (listings.error) throw new Error(`Listing generation failed: ${listings.error}`);

        // Save listings to DB
        const marketplaces = ["amazon", "etsy", "ebay", "shopify"];
        await supabase.from("listings").delete().eq("product_id", product.id);
        const listingRows = marketplaces.map((m) => ({
          product_id: product.id,
          user_id: userId,
          marketplace: m,
          title: listings[m].title,
          description: listings[m].description,
          bullet_points: listings[m].bulletPoints,
          tags: listings[m].tags,
          seo_title: listings[m].seoTitle || "",
          seo_description: listings[m].seoDescription || "",
          url_handle: listings[m].urlHandle || "",
          alt_text: listings[m].altText || "",
        }));
        const { error: listInsertError } = await supabase.from("listings").insert(listingRows);
        if (listInsertError) throw new Error(`Saving listings failed: ${listInsertError.message}`);

        // Step 4: Push to Shopify (if enabled)
        if (pushToShopify) {
          updateItem(i, { step: "shopify", status: "active" });
          const shopifyListing = listingRows.find((l) => l.marketplace === "shopify");
          const { data: shopifyResult, error: shopifyError } = await supabase.functions.invoke("push-to-shopify", {
            body: {
              product: productData,
              listings: [shopifyListing],
              imageUrl,
            },
          });
          if (shopifyError) throw new Error(`Shopify push failed: ${shopifyError.message}`);
          if (shopifyResult?.error) throw new Error(`Shopify push failed: ${shopifyResult.error}`);
        }

        updateItem(i, { step: "done", status: "done" });
      } catch (err: any) {
        console.error(`Pipeline error for ${file.name}:`, err);
        updateItem(i, { status: "error", error: err.message });
      }
    }

    setRunning(false);
    const successes = files.length - items.filter((it) => it.status === "error").length;
    toast.success(`Pipeline complete! ${successes}/${files.length} products processed.`);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="icon" onClick={onBack} disabled={running}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Rocket className="h-6 w-6 text-primary" />
            Autopilot Pipeline
          </h2>
          <p className="text-sm text-muted-foreground">
            Select design images → AI handles everything → products land in Shopify
          </p>
        </div>
      </div>

      {/* Config */}
      {!running && items.length === 0 && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
            <input
              type="checkbox"
              id="push-shopify"
              checked={pushToShopify}
              onChange={(e) => setPushToShopify(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary"
            />
            <label htmlFor="push-shopify" className="text-sm">
              Auto-push to Shopify after generating listings
            </label>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleSelectFiles}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border bg-card/50 py-20 transition-colors hover:border-primary/50 hover:bg-card"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Upload className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-foreground">
                Select your design images
              </p>
              <p className="mt-1 text-sm text-muted-foreground max-w-md">
                For each image, AI will analyze, generate titles, descriptions, tags, alt text, SEO metadata, URL handles, and push to Shopify
              </p>
            </div>
          </button>

          {/* Pipeline steps preview */}
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              What happens for each image
            </p>
            <div className="flex items-center gap-2">
              {STEPS.map((step, idx) => (
                <div key={step.key} className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-medium">{step.label}</span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <span className="text-muted-foreground">→</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      {(running || items.length > 0) && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {running ? `Processing image ${currentIndex + 1} of ${items.length}…` : "Complete"}
              </span>
              <span className="font-medium">
                {totalDone + totalErrors} / {items.length}
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {isDone && (
            <div className="flex items-center gap-4 rounded-lg bg-secondary/50 p-4">
              {totalErrors === 0 ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-500" />
              )}
              <p className="text-sm">
                <span className="font-medium">{totalDone} products</span> fully processed
                {totalErrors > 0 && (
                  <span className="text-muted-foreground"> • {totalErrors} failed</span>
                )}
              </p>
            </div>
          )}

          {/* Item list */}
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {items.map((item, i) => (
              <div key={i} className="rounded-lg border border-border bg-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedItem(expandedItem === i ? null : i)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  {item.status === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />}
                  {item.status === "error" && <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
                  {item.status === "active" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
                  {item.status === "pending" && <div className="h-4 w-4 shrink-0 rounded-full border-2 border-border" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.productTitle || item.fileName}
                    </p>
                    {item.status === "active" && (
                      <p className="text-xs text-muted-foreground">
                        {STEPS.find((s) => s.key === item.step)?.label}…
                      </p>
                    )}
                    {item.error && (
                      <p className="text-xs text-destructive truncate">{item.error}</p>
                    )}
                  </div>
                  {expandedItem === i ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {expandedItem === i && (
                  <div className="border-t border-border px-4 py-3">
                    <div className="flex gap-2">
                      {STEPS.map((step) => {
                        let status: "done" | "active" | "error" | "pending" = "pending";
                        const stepIdx = STEPS.findIndex((s) => s.key === step.key);
                        const currentStepIdx = STEPS.findIndex((s) => s.key === item.step);
                        if (item.step === "done" || stepIdx < currentStepIdx) status = "done";
                        else if (stepIdx === currentStepIdx && item.status === "active") status = "active";
                        else if (stepIdx === currentStepIdx && item.status === "error") status = "error";
                        return (
                          <div
                            key={step.key}
                            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${
                              status === "done"
                                ? "bg-green-500/10 text-green-600"
                                : status === "active"
                                ? "bg-primary/10 text-primary"
                                : status === "error"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-secondary text-muted-foreground"
                            }`}
                          >
                            {status === "done" && <CheckCircle2 className="h-3 w-3" />}
                            {status === "active" && <Loader2 className="h-3 w-3 animate-spin" />}
                            {status === "error" && <XCircle className="h-3 w-3" />}
                            {step.label}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {isDone && (
            <div className="flex justify-end">
              <Button onClick={onComplete} className="gap-2">
                <CheckCircle2 className="h-4 w-4" /> Done
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
