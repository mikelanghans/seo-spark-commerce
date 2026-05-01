import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Upload, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Rocket, ChevronDown, ChevronUp, FolderOpen, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PipelineSteps } from "./autopilot/PipelineSteps";
import { withRetry, processWithConcurrency } from "@/lib/pipelineUtils";
import { parsePrintPlacement } from "@/lib/printPlacement";
import { PRODUCT_TYPES as PRODUCT_TYPE_REGISTRY } from "@/lib/productTypes";
import { pushPrintifyThenShopify } from "@/lib/pushPrintifyThenShopify";
import { PipelineItemRow } from "./autopilot/PipelineItemRow";

// Mirrors PushPrintifyThenShopify: Comfort Colors 1717 default for Autopilot
const AUTOPILOT_PRINTIFY_BLUEPRINT = { blueprintId: 706, sizes: ["S", "M", "L", "XL", "2XL", "3XL"] };

const LIGHT_COLORS = new Set([
  "ivory", "butter", "banana", "blossom", "orchid", "chalky mint",
  "island reef", "chambray", "white", "flo blue", "watermelon",
  "neon pink", "neon green", "lagoon blue", "yam", "terracotta",
  "light green", "bay", "sage",
]);
import {
  createPipelineJob,
  updatePipelineItem,
  updatePipelineJobCounters,
  findIncompleteJob,
  dbItemToPipelineItem,
  type PipelineJobItemRow,
} from "@/lib/pipelineDb";

interface Organization {
  id: string;
  name: string;
  niche: string;
  tone: string;
  audience: string;
  listing_excluded_sections?: string[];
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
  { key: "shopify" as const, label: "Push to Printify → Shopify" },
] as const;

/** Extract color name from a mockup filename like "black-front.png" → "Black Front" */
const colorFromFilename = (filename: string): string => {
  const name = filename.replace(/\.[^.]+$/, "");
  return name
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const parseFolderFiles = (files: File[]): ParsedFolder[] => {
  const rootFolder = files[0]?.webkitRelativePath?.split("/")[0];
  if (!rootFolder) return [];

  const hasRootImages = files.some((f) => {
    const parts = f.webkitRelativePath.split("/");
    return parts.length === 2 && parts[0] === rootFolder && f.type.startsWith("image/");
  });

  const depthOffset = hasRootImages ? 0 : 1;
  const folderMap = new Map<string, { design: File | null; mockups: File[] }>();

  for (const file of files) {
    const path = file.webkitRelativePath;
    if (!path || !file.type.startsWith("image/")) continue;
    const parts = path.split("/");
    if (parts.length < depthOffset + 2) continue;
    const folderName = parts[depthOffset];
    if (!folderMap.has(folderName)) folderMap.set(folderName, { design: null, mockups: [] });
    const entry = folderMap.get(folderName)!;
    const mockupsIdx = depthOffset + 1;
    const isInMockups = parts.length >= mockupsIdx + 2 && parts[mockupsIdx].toLowerCase() === "mockups";
    const isDirectChild = parts.length === depthOffset + 2;
    if (isInMockups) entry.mockups.push(file);
    else if (isDirectChild && !entry.design) entry.design = file;
  }

  const result: ParsedFolder[] = [];
  for (const [folderName, entry] of folderMap) {
    if (entry.design) result.push({ folderName, designFile: entry.design, mockupFiles: entry.mockups });
  }
  return result;
};

export const AutopilotPipeline = ({ organization, userId, onComplete, onBack }: Props) => {
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [running, setRunning] = useState(false);
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [pushToShopify, setPushToShopify] = useState(true);
  const [concurrency, setConcurrency] = useState(3);
  const [resumableJob, setResumableJob] = useState<{
    jobId: string;
    items: PipelineJobItemRow[];
    pushToShopify: boolean;
    concurrency: number;
  } | null>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const jobIdRef = useRef<string | null>(null);

  const totalDone = items.filter((i) => i.step === "done").length;
  const totalErrors = items.filter((i) => i.status === "error").length;
  const progress = items.length > 0 ? ((totalDone + totalErrors) / items.length) * 100 : 0;
  const isDone = !running && items.length > 0 && totalDone + totalErrors === items.length;

  // Check for incomplete jobs on mount
  useEffect(() => {
    const checkIncomplete = async () => {
      try {
        const result = await findIncompleteJob(userId, organization.id);
        if (result) {
          const { job, items: dbItems } = result;
          const hasUnfinished = dbItems.some(
            (i) => i.step !== "done" && i.status !== "error"
          );
          if (hasUnfinished) {
            setResumableJob({
              jobId: job.id,
              items: dbItems,
              pushToShopify: job.push_to_shopify,
              concurrency: job.concurrency,
            });
          }
        }
      } catch (err) {
        console.error("Failed to check for incomplete jobs:", err);
      }
    };
    checkIncomplete();
  }, [userId, organization.id]);

  const updateItem = useCallback((index: number, updates: Partial<PipelineItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  }, []);

  /** Persist item update to DB */
  const persistUpdate = useCallback(async (index: number, updates: Partial<PipelineItem> & {
    designUrl?: string;
    mockupUploads?: { colorName: string; url: string }[];
  }) => {
    updateItem(index, updates);
    const jobId = jobIdRef.current;
    if (!jobId) return;
    await updatePipelineItem(jobId, index, {
      step: updates.step as StepKey | undefined,
      status: updates.status as StepStatus | undefined,
      error: updates.error,
      productTitle: updates.productTitle,
      productId: updates.productId,
      designUrl: updates.designUrl,
      mockupUploads: updates.mockupUploads,
    });
  }, [updateItem]);

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

  /** Process a single folder through the pipeline, skipping already-completed steps */
  const processFolder = useCallback(async (
    folder: ParsedFolder | null,
    i: number,
    resumeData?: PipelineJobItemRow
  ) => {
    try {
      let designUrl = resumeData?.design_url || "";
      let mockupUploads: { colorName: string; url: string }[] =
        (resumeData?.mockup_uploads as { colorName: string; url: string }[]) || [];
      let productId = resumeData?.product_id || "";
      let productTitle = resumeData?.product_title || "";

      const completedSteps = new Set<string>();
      if (resumeData) {
        // Determine which steps are already done
        const stepOrder: string[] = STEPS.map((s) => s.key);
        const currentStepIdx = stepOrder.indexOf(resumeData.step);
        if (resumeData.status === "done" || resumeData.step === "done") {
          // Fully done — skip
          updateItem(i, { step: "done", status: "done" });
          return;
        }
        if (resumeData.status === "error") {
          // Resume from the failed step
          for (let s = 0; s < currentStepIdx; s++) completedSteps.add(stepOrder[s]);
        } else {
          // Was active/pending — resume from this step
          for (let s = 0; s < currentStepIdx; s++) completedSteps.add(stepOrder[s]);
        }
      }

      // Step 1: Upload
      if (!completedSteps.has("upload")) {
        if (!folder) throw new Error("No file data available — cannot upload. Please start a new pipeline.");
        await persistUpdate(i, { step: "upload", status: "active" });
        designUrl = await withRetry(() => uploadFile(folder.designFile), { label: `upload-design-${i}` });
        mockupUploads = await Promise.all(
          folder.mockupFiles.map(async (f) => ({
            colorName: colorFromFilename(f.name),
            url: await withRetry(() => uploadFile(f), { label: `upload-mockup-${i}` }),
          }))
        );
        await persistUpdate(i, { step: "upload", status: "done" as StepStatus, designUrl, mockupUploads });
      }

      // Step 2: AI Analyze
      if (!completedSteps.has("analyze")) {
        await persistUpdate(i, { step: "analyze", status: "active" });

        let base64: string;
        if (folder) {
          base64 = await fileToBase64(folder.designFile);
        } else {
          // Resuming without file — fetch from storage
          if (!designUrl) throw new Error("No design URL available for analysis");
          const res = await fetch(designUrl);
          const blob = await res.blob();
          base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }

        const { data: analysis, error: analyzeError } = await withRetry(
          () => supabase.functions.invoke("analyze-product", { body: { imageBase64: base64 } }),
          { label: `analyze-${i}` }
        );
        if (analyzeError) throw new Error(`Analysis failed: ${analyzeError.message}`);
        if (analysis.error) throw new Error(`Analysis failed: ${analysis.error}`);

        const productData = {
          title: analysis.title || (folder?.folderName || resumeData?.folder_name || "Product"),
          description: analysis.description || "",
          features: (analysis.features || []).join("\n"),
          category: analysis.category || "",
          keywords: (analysis.keywords || []).join(", "),
          price: analysis.suggestedPrice || "",
        };

        productTitle = productData.title;
        await persistUpdate(i, { productTitle });

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

        productId = product.id;
        await persistUpdate(i, { productId: product.id });

        if (mockupUploads.length > 0) {
          const imageRows = mockupUploads.map((m, idx) => ({
            product_id: product.id,
            user_id: userId,
            image_url: m.url,
            image_type: "mockup",
            color_name: m.colorName,
            position: idx,
          }));
          const { error: imgInsertError } = await supabase.from("product_images").insert(imageRows);
          if (imgInsertError) console.error("Failed to save mockup images:", imgInsertError.message);
        }
      }

      // Step 3: Generate listings + SEO
      if (!completedSteps.has("listings")) {
        await persistUpdate(i, { step: "listings", status: "active" });

        const { data: productRow } = productId
          ? await supabase.from("products").select("*").eq("id", productId).single()
          : { data: null };

        const productData = productRow
          ? {
              title: productRow.title,
              description: productRow.description,
              features: productRow.features,
              category: productRow.category,
              keywords: productRow.keywords,
              price: productRow.price,
            }
          : { title: productTitle, description: "", features: "", category: "", keywords: "", price: "" };

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
              excludedSections: organization.listing_excluded_sections || [],
            },
          }),
          { label: `listings-${i}` }
        );
        if (listError) throw new Error(`Listing generation failed: ${listError.message}`);
        if (listings.error) throw new Error(`Listing generation failed: ${listings.error}`);

        const marketplaces = ["etsy", "ebay", "shopify"];
        await supabase.from("listings").delete().eq("product_id", productId);
        const listingRows = marketplaces.map((m) => ({
          product_id: productId,
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
      }

      // Step 4: Push to Printify → Shopify (chained)
      // We MUST go through Printify first so the Shopify product is created
      // and we get a shopify_product_id back. push-to-shopify is update-only.
      if (!completedSteps.has("shopify") && pushToShopify) {
        await persistUpdate(i, { step: "shopify", status: "active" });

        // Reload product (may have been just created in step 2)
        const { data: productRow } = productId
          ? await supabase.from("products").select("*").eq("id", productId).single()
          : { data: null };
        if (!productRow) throw new Error("Product not found for Shopify push");
        const productData: any = productRow;

        // Org config: printify shop + size pricing
        const { data: orgRow } = await supabase
          .from("organizations")
          .select("printify_shop_id, default_size_pricing")
          .eq("id", organization.id)
          .single();
        const printifyShopId = (orgRow as any)?.printify_shop_id as number | null;
        if (!printifyShopId) {
          throw new Error("Printify shop not selected for this brand. Open Settings → Marketplace → Printify and pick a shop.");
        }

        // Resolve size pricing (org default for t-shirt → product overrides)
        const ptDefaults = PRODUCT_TYPE_REGISTRY["t-shirt"];
        const sizePricing: Record<string, string> = { ...(ptDefaults?.defaultSizePricing || {}) };
        const orgPricing = ((orgRow as any)?.default_size_pricing?.["t-shirt"] || {}) as Record<string, string>;
        for (const [sz, p] of Object.entries(orgPricing)) if (p) sizePricing[sz] = p;
        const prodPricing = (productData.size_pricing || {}) as Record<string, string>;
        for (const [sz, p] of Object.entries(prodPricing)) if (p) sizePricing[sz] = p;

        // Get listings (we'll send the Shopify one to push-to-shopify after Printify creates the product)
        const { data: shopifyListings } = await supabase
          .from("listings")
          .select("*")
          .eq("product_id", productId)
          .eq("marketplace", "shopify");
        const shopifyListing = shopifyListings?.[0];

        // Run the shared Printify → Shopify chain.
        await pushPrintifyThenShopify({
          organizationId: organization.id,
          userId,
          product: productData,
          listings: shopifyListing ? [shopifyListing as any] : [],
          printifyShopId,
          blueprintId: AUTOPILOT_PRINTIFY_BLUEPRINT.blueprintId,
          selectedSizes: AUTOPILOT_PRINTIFY_BLUEPRINT.sizes,
          selectedColors: mockupUploads.length > 0
            ? Array.from(new Set(mockupUploads.map((m) => m.colorName)))
            : ["Black"],
          sizePricing,
          mockupImages: mockupUploads.map((m) => ({ color_name: m.colorName, image_url: m.url })),
          placement: parsePrintPlacement(productData.print_placement),
          publishOnPrintify: true,
          appendSizeChart: true,
          retryLabel: String(i),
        });
      }


      await persistUpdate(i, { step: "done", status: "done" });
      if (jobIdRef.current) await updatePipelineJobCounters(jobIdRef.current);
    } catch (err: any) {
      console.error(`Pipeline error for item ${i}:`, err);
      await persistUpdate(i, { status: "error", error: err.message });
      if (jobIdRef.current) await updatePipelineJobCounters(jobIdRef.current);
    }
  }, [organization, userId, pushToShopify, persistUpdate, updateItem]);

  /** Start a new pipeline from selected files */
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
    setResumableJob(null);

    // Create job in DB
    const jobId = await createPipelineJob(userId, organization.id, pushToShopify, concurrency, pipelineItems);
    jobIdRef.current = jobId;

    await processWithConcurrency(folders, concurrency, (folder, i) => processFolder(folder, i));

    setRunning(false);
    toast.success(`Pipeline complete! ${folders.length} products processed.`);
  };

  /** Resume an incomplete pipeline */
  const handleResume = async () => {
    if (!resumableJob) return;

    const { jobId, items: dbItems, pushToShopify: savedPush, concurrency: savedConcurrency } = resumableJob;
    jobIdRef.current = jobId;
    setPushToShopify(savedPush);

    const pipelineItems = dbItems.map(dbItemToPipelineItem);
    setItems(pipelineItems);
    setRunning(true);
    setResumableJob(null);

    // Only process items that aren't done/error
    const itemsToResume = dbItems
      .map((dbItem, i) => ({ dbItem, i }))
      .filter(({ dbItem }) => dbItem.step !== "done" && dbItem.status !== "error");

    await processWithConcurrency(
      itemsToResume,
      savedConcurrency,
      ({ dbItem, i }) => processFolder(null, i, dbItem)
    );

    setRunning(false);
    toast.success("Pipeline resumed and complete!");
  };

  /** Dismiss resume prompt and mark job as completed */
  const handleDismissResume = async () => {
    if (resumableJob) {
      await supabase
        .from("pipeline_jobs")
        .update({ status: "dismissed" })
        .eq("id", resumableJob.jobId);
    }
    setResumableJob(null);
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

      {/* Resume banner */}
      {resumableJob && !running && items.length === 0 && (
        <div className="flex items-center gap-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <RotateCcw className="h-5 w-5 shrink-0 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium">Incomplete pipeline found</p>
            <p className="text-xs text-muted-foreground">
              {resumableJob.items.filter((i) => i.step === "done").length} of{" "}
              {resumableJob.items.length} products completed.
              {resumableJob.items.filter((i) => i.status === "error").length > 0 &&
                ` ${resumableJob.items.filter((i) => i.status === "error").length} failed.`}
              {" "}Resume to continue from where it left off.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDismissResume}>
              Dismiss
            </Button>
            <Button size="sm" onClick={handleResume} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Resume
            </Button>
          </div>
        </div>
      )}

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
