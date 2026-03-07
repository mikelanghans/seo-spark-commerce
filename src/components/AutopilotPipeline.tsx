import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Upload, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Rocket, ChevronDown, ChevronUp, FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PipelineSteps } from "./autopilot/PipelineSteps";
import { withRetry, processWithConcurrency } from "@/lib/pipelineUtils";
import { PipelineItemRow } from "./autopilot/PipelineItemRow";

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

export type StepKey = "upload" | "analyze" | "listings" | "shopify" | "done";
export type StepStatus = "pending" | "active" | "done" | "error";

export interface PipelineItem {
  folderName: string;
  designFileName: string;
  mockupFileNames: string[];
  step: StepKey;
  status: StepStatus;
  error?: string;
  productTitle?: string;
  productId?: string;
}

export interface ParsedFolder {
  folderName: string;
  designFile: File;
  mockupFiles: File[];
}

export const STEPS = [
  { key: "upload" as const, label: "Upload Images" },
  { key: "analyze" as const, label: "AI Analyze" },
  { key: "listings" as const, label: "Generate Listings + SEO" },
  { key: "shopify" as const, label: "Push to Shopify (Variants)" },
] as const;

/** Extract color name from a mockup filename like "black-front.png" → "Black Front" */
const colorFromFilename = (filename: string): string => {
  const name = filename.replace(/\.[^.]+$/, ""); // strip extension
  return name
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

/**
 * Parse selected folder files into design + mockups structure.
 * Supports both flat and nested layouts:
 *
 * Flat (select product folder directly):
 *   my-product/design.png + my-product/mockups/black.png
 *
 * Nested (select parent folder with multiple products):
 *   parent/product-a/design.png + parent/product-a/mockups/black.png
 *   parent/product-b/design.png + parent/product-b/mockups/red.png
 */
const parseFolderFiles = (files: File[]): ParsedFolder[] => {
  // First, detect if structure is flat or nested by checking if the
  // root folder itself contains images (flat) or only subfolders (nested).
  const rootFolder = files[0]?.webkitRelativePath?.split("/")[0];
  if (!rootFolder) return [];

  const hasRootImages = files.some((f) => {
    const parts = f.webkitRelativePath.split("/");
    return parts.length === 2 && parts[0] === rootFolder && f.type.startsWith("image/");
  });

  // Determine depth offset: flat = 0 (folder name is parts[0]), nested = 1 (folder name is parts[1])
  const depthOffset = hasRootImages ? 0 : 1;

  const folderMap = new Map<string, { design: File | null; mockups: File[] }>();

  for (const file of files) {
    const path = file.webkitRelativePath;
    if (!path || !file.type.startsWith("image/")) continue;

    const parts = path.split("/");
    if (parts.length < depthOffset + 2) continue;

    const folderName = parts[depthOffset];
    if (!folderMap.has(folderName)) {
      folderMap.set(folderName, { design: null, mockups: [] });
    }
    const entry = folderMap.get(folderName)!;

    // Check if file is in a "mockups" subfolder relative to the product folder
    const mockupsIdx = depthOffset + 1;
    const isInMockups = parts.length >= mockupsIdx + 2 && parts[mockupsIdx].toLowerCase() === "mockups";
    const isDirectChild = parts.length === depthOffset + 2;

    if (isInMockups) {
      entry.mockups.push(file);
    } else if (isDirectChild) {
      if (!entry.design) entry.design = file;
    }
  }

  const result: ParsedFolder[] = [];
  for (const [folderName, entry] of folderMap) {
    if (entry.design) {
      result.push({ folderName, designFile: entry.design, mockupFiles: entry.mockups });
    }
  }
  return result;
};

export const AutopilotPipeline = ({ organization, userId, onComplete, onBack }: Props) => {
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [running, setRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [pushToShopify, setPushToShopify] = useState(true);
  const [concurrency, setConcurrency] = useState(3);
  const folderRef = useRef<HTMLInputElement>(null);

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

  const uploadFile = async (file: File): Promise<string> => {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file);
    if (error) throw new Error(`Upload failed: ${error.message}`);
    const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
    return urlData.publicUrl;
  };

  const handleSelectFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const allFiles = Array.from(e.target.files || []);
    const folders = parseFolderFiles(allFiles);

    if (folders.length === 0) {
      toast.error("No valid folders found. Each folder needs a design image at the root level.");
      return;
    }

    const pipelineItems: PipelineItem[] = folders.map((f) => ({
      folderName: f.folderName,
      designFileName: f.designFile.name,
      mockupFileNames: f.mockupFiles.map((m) => m.name),
      step: "upload",
      status: "pending",
    }));
    setItems(pipelineItems);
    setRunning(true);
    setCurrentIndex(0);

    const processFolder = async (folder: ParsedFolder, i: number) => {
      try {
        // Step 1: Upload all images (design + mockups)
        updateItem(i, { step: "upload", status: "active" });
        const designUrl = await withRetry(() => uploadFile(folder.designFile), { label: `upload-design-${i}` });
        const mockupUploads = await Promise.all(
          folder.mockupFiles.map(async (f) => ({
            colorName: colorFromFilename(f.name),
            url: await withRetry(() => uploadFile(f), { label: `upload-mockup-${i}` }),
          }))
        );

        // Step 2: AI analyze the design image
        updateItem(i, { step: "analyze", status: "active" });
        const base64 = await fileToBase64(folder.designFile);
        const { data: analysis, error: analyzeError } = await withRetry(
          () => supabase.functions.invoke("analyze-product", { body: { imageBase64: base64 } }),
          { label: `analyze-${i}` }
        );
        if (analyzeError) throw new Error(`Analysis failed: ${analyzeError.message}`);
        if (analysis.error) throw new Error(`Analysis failed: ${analysis.error}`);

        const productData = {
          title: analysis.title || folder.folderName,
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
            image_url: designUrl,
            organization_id: organization.id,
            user_id: userId,
          })
          .select()
          .single();
        if (insertError) throw new Error(`Save failed: ${insertError.message}`);

        updateItem(i, { productId: product.id });

        // Step 3: Generate listings + SEO
        updateItem(i, { step: "listings", status: "active" });
        const { data: listings, error: listError } = await withRetry(
          () => supabase.functions.invoke("generate-listings", {
            body: {
              business: {
                name: organization.name,
                niche: organization.niche,
                tone: organization.tone,
                audience: organization.audience,
              },
              product: productData,
            },
          }),
          { label: `listings-${i}` }
        );
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

        // Step 4: Push to Shopify with color variants
        if (pushToShopify) {
          updateItem(i, { step: "shopify", status: "active" });
          const shopifyListing = listingRows.find((l) => l.marketplace === "shopify");
          const { data: shopifyResult, error: shopifyError } = await withRetry(
            () => supabase.functions.invoke("push-to-shopify", {
              body: {
                product: productData,
                listings: [shopifyListing],
                imageUrl: designUrl,
                variants: mockupUploads.map((m) => ({
                  colorName: m.colorName,
                  imageUrl: m.url,
                })),
              },
            }),
            { label: `shopify-${i}` }
          );
          if (shopifyError) throw new Error(`Shopify push failed: ${shopifyError.message}`);
          if (shopifyResult?.error) throw new Error(`Shopify push failed: ${shopifyResult.error}`);
        }

        updateItem(i, { step: "done", status: "done" });
      } catch (err: any) {
        console.error(`Pipeline error for ${folder.folderName}:`, err);
        updateItem(i, { status: "error", error: err.message });
      }
    };

    // Process folders with controlled concurrency
    await processWithConcurrency(folders, concurrency, processFolder);

    setRunning(false);
    toast.success(`Pipeline complete! ${folders.length} products processed.`);
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
            Select a folder with your design + mockups → AI handles everything → products land in Shopify
          </p>
        </div>
      </div>

      {/* Config */}
      {!running && items.length === 0 && (
        <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
            <input
              type="checkbox"
              id="push-shopify"
              checked={pushToShopify}
              onChange={(e) => setPushToShopify(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary"
            />
            <label htmlFor="push-shopify" className="text-sm">
              Auto-push to Shopify after generating listings (with color variants from mockups)
            </label>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
            <label htmlFor="concurrency" className="text-sm whitespace-nowrap">
              Parallel processing:
            </label>
            <select
              id="concurrency"
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            >
              <option value={1}>1 at a time (safest)</option>
              <option value={2}>2 parallel</option>
              <option value={3}>3 parallel (recommended)</option>
              <option value={5}>5 parallel</option>
            </select>
            <span className="text-xs text-muted-foreground">
              Higher = faster but more likely to hit rate limits
            </span>
          </div>
        </div>

          <input
            ref={folderRef}
            type="file"
            {...({ webkitdirectory: "true", directory: "" } as any)}
            multiple
            onChange={handleSelectFolder}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => folderRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border bg-card/50 py-20 transition-colors hover:border-primary/50 hover:bg-card"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <FolderOpen className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-foreground">
                Select your product folder
              </p>
              <p className="mt-1 text-sm text-muted-foreground max-w-md">
                Each folder should have a design image at the root, and a <code className="rounded bg-secondary px-1.5 py-0.5 text-xs font-mono">mockups/</code> subfolder with color variant images
              </p>
              <p className="mt-3 text-xs text-muted-foreground max-w-sm">
                📁 my-design/<br />
                &nbsp;&nbsp;├── design.png<br />
                &nbsp;&nbsp;└── mockups/<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── black-front.png<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── white-front.png<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── navy-back.png
              </p>
            </div>
          </button>

          <PipelineSteps />
        </div>
      )}

      {/* Progress */}
      {(running || items.length > 0) && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {running
                  ? `Processing ${items.filter((i) => i.status === "active").length} active, ${totalDone} done…`
                  : "Complete"}
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
              <PipelineItemRow
                key={i}
                item={item}
                index={i}
                expanded={expandedItem === i}
                onToggle={() => setExpandedItem(expandedItem === i ? null : i)}
              />
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
