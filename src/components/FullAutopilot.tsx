import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Rocket, Loader2, X, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { handleAiError } from "@/lib/aiErrors";
import { withRetry } from "@/lib/pipelineUtils";

interface Organization {
  id: string;
  name: string;
  niche: string;
  tone: string;
  audience: string;
  template_image_url?: string | null;
  brand_font?: string;
  brand_color?: string;
  brand_font_size?: string;
  brand_style_notes?: string;
  design_styles?: string[];
}

interface Props {
  organization: Organization;
  userId: string;
  onProductsCreated: () => void;
}

interface LogEntry {
  time: string;
  message: string;
  type: "info" | "success" | "error" | "step";
}

interface ProductProgress {
  index: number;
  messageText: string;
  step: string;
  status: "pending" | "active" | "done" | "error";
  error?: string;
}

export const FullAutopilot = ({ organization, userId, onProductsCreated }: Props) => {
  const [running, setRunning] = useState(false);
  const [batchSize, setBatchSize] = useState("3");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [products, setProducts] = useState<ProductProgress[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);
  const cancelRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const log = useCallback((message: string, type: LogEntry["type"] = "info") => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { time, message, type }]);
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const updateProduct = useCallback((index: number, updates: Partial<ProductProgress>) => {
    setProducts((prev) => prev.map((p, i) => i === index ? { ...p, ...updates } : p));
  }, []);

  const fetchImageAsBase64 = async (url: string): Promise<string> => {
    const resp = await fetch(url, { signal: abortRef.current?.signal });
    const blob = await resp.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const checkCancelled = () => {
    if (cancelRef.current) throw new Error("__CANCELLED__");
  };

  const runAutopilot = async () => {
    const count = parseInt(batchSize);
    cancelRef.current = false;
    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setProducts([]);
    setOverallProgress(0);

    const totalSteps = 1 + count * 7; // 1 for messages + 7 per product (design, product, colors, mockups, listing, printify, shopify)
    let completedSteps = 0;
    const tick = () => {
      completedSteps++;
      setOverallProgress(Math.min(100, Math.round((completedSteps / totalSteps) * 100)));
    };

    // Determine design style
    const styles = (organization.design_styles as string[]) || ["text-only"];
    const designStyle = styles[0] || "text-only";

    try {
      // Step 0: Fetch existing products to avoid duplicates
      log(`🔍 Scanning existing products...`, "info");
      const { data: existingProducts } = await supabase
        .from("products")
        .select("title, description")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(200);

      const existingTitles = (existingProducts || []).map((p: any) => p.title);
      if (existingTitles.length > 0) {
        log(`  Found ${existingTitles.length} existing products — will avoid duplicates`, "info");
      }

      // Step 1: Generate messages
      log(`🚀 Starting autopilot — generating ${count} messages...`, "step");

      const { data: msgData, error: msgError } = await withRetry(() =>
        supabase.functions.invoke("generate-messages", {
          body: {
            organization: {
              id: organization.id,
              name: organization.name,
              niche: organization.niche,
              tone: organization.tone,
              audience: organization.audience,
            },
            count,
            designStyle,
            existingProducts: existingTitles,
          },
        }),
        { label: "generate-messages" }
      );

      if (msgError || msgData?.error) {
        log(`❌ Failed to generate messages: ${msgData?.error || msgError?.message}`, "error");
        setRunning(false);
        return;
      }

      const messages: { text: string }[] = msgData.messages || [];
      if (messages.length === 0) {
        log("❌ No messages generated", "error");
        setRunning(false);
        return;
      }

      log(`✅ Generated ${messages.length} messages`, "success");
      tick();

      // Initialize product tracking
      setProducts(messages.map((m, i) => ({
        index: i,
        messageText: m.text,
        step: "Waiting...",
        status: "pending",
      })));

      // Process each message through the pipeline
      for (let i = 0; i < messages.length; i++) {
        if (cancelRef.current) {
          log("⚠️ Cancelled by user", "error");
          break;
        }

        const messageText = messages[i].text;
        updateProduct(i, { status: "active", step: "Generating design..." });
        log(`[${i + 1}/${messages.length}] "${messageText}"`, "step");

        try {
          // Step 2: Generate design
          log(`  🎨 Generating design...`, "info");
          const { data: designData, error: designError } = await withRetry(() =>
            supabase.functions.invoke("generate-design", {
              body: {
                messageText,
                brandName: organization.name,
                brandTone: organization.tone,
                brandNiche: organization.niche,
                brandAudience: organization.audience,
                brandFont: organization.brand_font || "",
                brandColor: organization.brand_color || "",
                brandFontSize: organization.brand_font_size || "large",
                brandStyleNotes: organization.brand_style_notes || "",
                organizationId: organization.id,
                designVariant: "light-on-dark",
                designStyle,
              },
            }),
            { label: `design-${i}` }
          );

          if (designError || designData?.error) throw new Error(designData?.error || designError?.message);
          const designUrl = designData.designUrl;
          if (!designUrl) throw new Error("No design URL returned");
          log(`  ✅ Design generated`, "success");
          tick();

          if (cancelRef.current) break;

          // Step 3: Save as generated_message and create product
          updateProduct(i, { step: "Creating product..." });
          
          // Save the message
          const { data: savedMsg } = await supabase.from("generated_messages").insert({
            message_text: messageText,
            organization_id: organization.id,
            user_id: userId,
            is_selected: true,
            design_url: designUrl,
          }).select("id").single();

          // Create product
          const productTitle = messageText.length > 60 ? messageText.substring(0, 57) + "..." : messageText;
          const { data: productData, error: productError } = await supabase.from("products").insert({
            title: productTitle,
            description: messageText,
            category: "T-Shirt",
            price: "29.99",
            organization_id: organization.id,
            user_id: userId,
            image_url: designUrl,
            keywords: organization.niche,
          }).select("id").single();

          if (productError) throw productError;
          const productId = productData.id;

          // Link message to product so it's filtered from Message Ideas
          if (savedMsg?.id) {
            await supabase.from("generated_messages")
              .update({ product_id: productId })
              .eq("id", savedMsg.id);
          }

          log(`  ✅ Product created`, "success");
          tick();

          if (cancelRef.current) break;

          // Step 4: AI color recommendations
          updateProduct(i, { step: "Recommending colors..." });
          log(`  🎨 Getting color recommendations...`, "info");

          const { data: colorData, error: colorError } = await withRetry(() =>
            supabase.functions.invoke("recommend-colors", {
              body: {
                productTitle,
                productCategory: "T-Shirt",
                brandName: organization.name,
                brandNiche: organization.niche,
                brandAudience: organization.audience,
                brandTone: organization.tone,
              },
            }),
            { label: `colors-${i}` }
          );

          if (colorError || colorData?.error) throw new Error(colorData?.error || colorError?.message);
          const recommendedColors: string[] = (colorData.recommendations || []).map((r: any) => r.color);
          log(`  ✅ Recommended colors: ${recommendedColors.join(", ")}`, "success");
          tick();

          if (cancelRef.current) break;

          // Step 5: Generate mockups for each color
          updateProduct(i, { step: `Generating ${recommendedColors.length} mockups...` });

          // Get source image as base64
          const sourceUrl = organization.template_image_url || designUrl;
          const imageBase64 = await fetchImageAsBase64(sourceUrl);
          let designBase64: string | undefined;
          if (designUrl !== sourceUrl) {
            designBase64 = await fetchImageAsBase64(designUrl);
          }

          let mockupCount = 0;
          const referenceBase64 = imageBase64; // Always use brand template for consistency
          for (const colorName of recommendedColors) {
            if (cancelRef.current) break;
            log(`  🖌️ Generating mockup: ${colorName}...`, "info");
            updateProduct(i, { step: `Mockup ${mockupCount + 1}/${recommendedColors.length}: ${colorName}` });

            try {
              const { data: mockupData, error: mockupError } = await withRetry(() =>
                supabase.functions.invoke("generate-color-variants", {
                  body: { imageBase64: referenceBase64, colorName, productTitle, designImageBase64: designBase64 },
                }),
                { label: `mockup-${colorName}` }
              );

              if (mockupError || mockupData?.error) {
                const errMsg = mockupData?.error || mockupError?.message || "";
                log(`  ⚠️ Mockup ${colorName} failed: ${errMsg}`, "error");
                if (errMsg.includes("402") || errMsg.includes("credits")) break;
                continue;
              }

              const genBase64 = mockupData.imageBase64;
              if (!genBase64) continue;

              // Brand template is always used as reference for consistency

              // Upload to storage
              const base64Data = genBase64.split(",")[1] || genBase64;
              const byteChars = atob(base64Data);
              const byteArray = new Uint8Array(byteChars.length);
              for (let j = 0; j < byteChars.length; j++) byteArray[j] = byteChars.charCodeAt(j);
              const blob = new Blob([byteArray], { type: "image/png" });
              const path = `${userId}/${crypto.randomUUID()}.png`;
              await supabase.storage.from("product-images").upload(path, blob);
              const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);

              await supabase.from("product_images").insert({
                product_id: productId,
                user_id: userId,
                image_url: urlData.publicUrl,
                image_type: "mockup",
                color_name: colorName,
                position: mockupCount,
              });

              mockupCount++;
            } catch (err: any) {
              log(`  ⚠️ Mockup ${colorName} failed: ${err.message}`, "error");
            }
          }

          log(`  ✅ Generated ${mockupCount} mockups`, "success");
          tick();

          if (cancelRef.current) break;

          // Step 6: Generate Shopify listing
          updateProduct(i, { step: "Generating Shopify listing..." });
          log(`  📝 Generating Shopify listing...`, "info");

          const { data: listingData, error: listingError } = await withRetry(() =>
            supabase.functions.invoke("generate-listings", {
              body: {
                business: {
                  name: organization.name,
                  niche: organization.niche,
                  tone: organization.tone,
                  audience: organization.audience,
                },
                product: {
                  title: productTitle,
                  description: messageText,
                  category: "T-Shirt",
                  features: "",
                  keywords: organization.niche,
                },
                marketplaces: ["shopify"],
              },
            }),
            { label: `listing-${i}` }
          );

          if (listingError || listingData?.error) throw new Error(listingData?.error || listingError?.message);
          
          // generate-listings returns { shopify: { title, description, ... } }
          const shopifyListing = listingData?.shopify;
          if (shopifyListing) {
            await supabase.from("listings").insert({
              product_id: productId,
              user_id: userId,
              marketplace: "shopify",
              title: shopifyListing.title,
              description: shopifyListing.description,
              bullet_points: shopifyListing.bulletPoints || [],
              tags: shopifyListing.tags || [],
              seo_title: shopifyListing.seoTitle || "",
              seo_description: shopifyListing.seoDescription || "",
              url_handle: shopifyListing.urlHandle || "",
              alt_text: shopifyListing.altText || "",
            });
          }
          log(`  ✅ Shopify listing generated`, "success");
          tick();

          if (cancelRef.current) break;

          // Step 7: Push to Printify
          updateProduct(i, { step: "Pushing to Printify..." });
          log(`  🖨️ Pushing to Printify...`, "info");

          try {
            // Get shops
            const { data: shopsData } = await supabase.functions.invoke("printify-get-shops");
            const shopId = shopsData?.shops?.[0]?.id;
            if (!shopId) throw new Error("No Printify shop found");

            // Upload design
            const { data: uploadData, error: uploadErr } = await supabase.functions.invoke("printify-upload-image", {
              body: { imageUrl: designUrl, fileName: `${productTitle}-design.png` },
            });
            if (uploadErr || uploadData?.error) throw new Error(uploadData?.error || uploadErr?.message);
            const printifyImageId = uploadData.image?.id;
            if (!printifyImageId) throw new Error("Failed to upload design to Printify");

            // Get print provider
            const { data: variantData } = await supabase.functions.invoke("printify-get-variants", {
              body: { blueprintId: 706 },
            });
            const printProviderId = variantData?.printProviderId;

            // Build mockup images
            const { data: mockupImages } = await supabase
              .from("product_images")
              .select("image_url, color_name")
              .eq("product_id", productId)
              .eq("image_type", "mockup");

            const mockupImagesForPrintify = (mockupImages || []).map((m: any) => ({
              printifyColorName: m.color_name,
              imageUrl: m.image_url,
            }));

            const { data: printifyResult, error: printifyErr } = await supabase.functions.invoke("printify-create-product", {
              body: {
                shopId,
                title: shopifyListing?.title || productTitle,
                description: shopifyListing?.description || messageText,
                tags: [...(shopifyListing?.tags || []), "T-shirts"],
                printifyImageId,
                selectedColors: recommendedColors,
                selectedSizes: ["S", "M", "L", "XL", "2XL"],
                price: "29.99",
                mockupImages: mockupImagesForPrintify,
                productId,
                printProviderId,
              },
            });

            if (printifyErr || printifyResult?.error) throw new Error(printifyResult?.error || printifyErr?.message);
            
            if (printifyResult?.printifyProductId) {
              await supabase.from("products").update({ printify_product_id: printifyResult.printifyProductId }).eq("id", productId);
            }
            
            log(`  ✅ Pushed to Printify (${printifyResult?.variantCount || 0} variants)`, "success");
          } catch (err: any) {
            log(`  ⚠️ Printify push failed: ${err.message}`, "error");
          }
          tick();

          updateProduct(i, { status: "done", step: "Complete!" });
          log(`✅ Product ${i + 1} complete!`, "success");

        } catch (err: any) {
          updateProduct(i, { status: "error", step: "Failed", error: err.message });
          log(`❌ Product ${i + 1} failed: ${err.message}`, "error");
          tick(); tick(); tick(); tick(); tick(); // Skip remaining steps in progress
        }
      }

      log(`🏁 Autopilot complete!`, "step");
      onProductsCreated();
    } catch (err: any) {
      log(`❌ Autopilot error: ${err.message}`, "error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      {!running && products.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Rocket className="h-6 w-6 text-primary" />
            <div>
              <h3 className="font-semibold">Full Autopilot</h3>
              <p className="text-sm text-muted-foreground">
                Zero-touch pipeline: Message → Design → Mockups → Listing → Printify
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Products to create:</span>
            <Select value={batchSize} onValueChange={setBatchSize}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 5, 10].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={runAutopilot} className="gap-2">
              <Rocket className="h-4 w-4" />
              Launch Autopilot
            </Button>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Design style: <strong>{(organization.design_styles as string[])?.[0] || "text-only"}</strong></p>
            <p>• Colors: <strong>AI recommended</strong></p>
            <p>• Listings: <strong>Shopify only</strong></p>
            <p>• Push: <strong>Printify (Comfort Colors 1717)</strong></p>
          </div>
        </div>
      )}

      {(running || products.length > 0) && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Autopilot Running</h3>
            </div>
            {running && (
              <Button variant="destructive" size="sm" onClick={() => { cancelRef.current = true; }} className="gap-1.5">
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            )}
          </div>

          <Progress value={overallProgress} className="h-2" />
          <p className="text-xs text-muted-foreground text-center">{overallProgress}% complete</p>

          {/* Product status */}
          <div className="space-y-2">
            {products.map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-md border border-border bg-muted/30 text-sm">
                {p.status === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                ) : p.status === "error" ? (
                  <XCircle className="h-4 w-4 text-destructive shrink-0" />
                ) : p.status === "active" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                ) : (
                  <div className="h-4 w-4 rounded-full border border-muted-foreground/30 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.messageText}</p>
                  <p className="text-xs text-muted-foreground">{p.step}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Live log */}
          <div className="max-h-48 overflow-y-auto rounded-md bg-background border border-border p-3 font-mono text-xs space-y-0.5">
            {logs.map((entry, i) => (
              <div
                key={i}
                className={
                  entry.type === "error" ? "text-destructive" :
                  entry.type === "success" ? "text-primary" :
                  entry.type === "step" ? "text-foreground font-semibold" :
                  "text-muted-foreground"
                }
              >
                <span className="opacity-50">{entry.time}</span> {entry.message}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </div>
  );
};
