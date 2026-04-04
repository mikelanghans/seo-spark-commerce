import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_BLUEPRINT_ID = 706;
const DEFAULT_IMAGE_SCALE = 0.58;
const DEFAULT_IMAGE_X = 0.5;
const DEFAULT_IMAGE_Y = 0.34;
const DEFAULT_EDITOR_SCALE = 0.36;
const DEFAULT_EDITOR_OFFSET_Y = 0.20;

type PlacementInput = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const parsePlacement = (value: unknown): PlacementInput | null => {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<PlacementInput>;
  if (
    typeof candidate.scale !== "number" ||
    typeof candidate.offsetX !== "number" ||
    typeof candidate.offsetY !== "number"
  ) {
    return null;
  }

  return {
    scale: candidate.scale,
    offsetX: candidate.offsetX,
    offsetY: candidate.offsetY,
  };
};

const getSavedPlacement = async (
  adminClient: ReturnType<typeof createClient>,
  productId: string | null | undefined,
): Promise<PlacementInput | null> => {
  if (!productId) return null;

  const { data, error } = await adminClient
    .from("products")
    .select("print_placement")
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    console.warn(`Failed to load saved placement for product ${productId}:`, error.message);
    return null;
  }

  return parsePlacement((data as { print_placement?: unknown } | null)?.print_placement);
};

const mapPlacementToPrintify = (placement: PlacementInput | null) => {
  if (!placement) {
    return {
      imageX: DEFAULT_IMAGE_X,
      imageY: DEFAULT_IMAGE_Y,
      desiredScale: DEFAULT_IMAGE_SCALE,
    };
  }

  return {
    imageX: clamp(DEFAULT_IMAGE_X + placement.offsetX, 0.15, 0.85),
    imageY: clamp(DEFAULT_IMAGE_Y + (placement.offsetY - DEFAULT_EDITOR_OFFSET_Y), 0.12, 0.65),
    desiredScale: clamp(DEFAULT_IMAGE_SCALE * (placement.scale / DEFAULT_EDITOR_SCALE), 0.22, 0.78),
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const {
      shopId, title, description, tags, printifyImageId,
      darkPrintifyImageId, lightColors,
      selectedColors, selectedSizes, price, sizePricing,
      blueprintId, printProviderId, productId, printifyProductId,
      organizationId, action, publish, placement,
    } = body;

    // Try org-level token first, then fall back to env var
    let printifyToken = Deno.env.get("PRINTIFY_API_TOKEN");
    if (organizationId) {
      const tokenLookup = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: secrets } = await tokenLookup
        .from("organization_secrets")
        .select("printify_api_token")
        .eq("organization_id", organizationId)
        .single();
      if (secrets?.printify_api_token) printifyToken = secrets.printify_api_token;
    }

    if (!printifyToken) {
      return new Response(JSON.stringify({ error: "Printify API token not configured. Add your token in Settings → Marketplace." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle selective update action
    if (action === "update-price" || action === "update") {
      const pPrintifyProductId = body.printifyProductId;
      if (!pPrintifyProductId) throw new Error("printifyProductId is required for update");

      // Use shopId from request, fall back to org-level setting
      const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      let pShopId = body.shopId;
      if (!pShopId && organizationId) {
        const { data: org } = await adminClient.from("organizations").select("printify_shop_id").eq("id", organizationId).single();
        pShopId = org?.printify_shop_id;
      }
      if (!pShopId) throw new Error("No Printify shop configured");

      // Fetch current product to get variants
      console.log(`Update: fetching product ${pPrintifyProductId} from shop ${pShopId}`);
      const fetchRes = await fetch(`https://api.printify.com/v1/shops/${pShopId}/products/${pPrintifyProductId}.json`, {
        headers: { Authorization: `Bearer ${printifyToken}` },
      });
      if (!fetchRes.ok) {
        if (fetchRes.status === 404) {
          // Product was deleted on Printify — clear the stored ID
          if (body.productId) {
            await adminClient.from("products").update({ printify_product_id: null }).eq("id", body.productId);
          }
          throw new Error("Product not found on Printify (404). ID has been cleared — you can push as a new product.");
        }
        throw new Error(`Failed to fetch Printify product: ${fetchRes.status}`);
      }
      const printifyProduct = await fetchRes.json();

      // Build selective update payload
      const updatePayload: Record<string, unknown> = {};

      // Which fields to update — default to all for backward compat with "update-price"
      const fields: string[] = body.updateFields || ["pricing"];

      if (fields.includes("title") && body.title) {
        updatePayload.title = body.title;
      }

      if (fields.includes("description") && body.description !== undefined) {
        updatePayload.description = body.description || "";
      }

      if (fields.includes("tags") && body.tags) {
        updatePayload.tags = body.tags;
      }

      if (fields.includes("pricing")) {
        const fallbackPriceCents = Math.round(parseFloat((body.price || "29.99").replace(/[^0-9.]/g, "")) * 100);
        const sizePriceCents: Record<string, number> = {};
        if (body.sizePricing && typeof body.sizePricing === "object") {
          for (const [size, p] of Object.entries(body.sizePricing)) {
            const parsed = parseFloat(((p as string) || "0").replace(/[^0-9.]/g, ""));
            if (parsed > 0) sizePriceCents[size] = Math.round(parsed * 100);
          }
        }

        updatePayload.variants = printifyProduct.variants.map((v: any) => {
          const vSize = (v.options?.size || v.title || "").trim();
          const priceVal = sizePriceCents[vSize] || fallbackPriceCents;
          return { id: v.id, price: priceVal, is_enabled: v.is_enabled };
        });
      }

      if (Object.keys(updatePayload).length === 0) {
        return new Response(JSON.stringify({ success: true, message: "Nothing to update" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`Updating Printify product ${pPrintifyProductId}: fields=${fields.join(",")}`);

      const updateRes = await fetch(`https://api.printify.com/v1/shops/${pShopId}/products/${pPrintifyProductId}.json`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${printifyToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      });
      if (!updateRes.ok) {
        const errText = await updateRes.text();
        throw new Error(`Printify update failed: ${updateRes.status} ${errText}`);
      }

      return new Response(JSON.stringify({ success: true, updatedFields: fields }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!shopId || !title || !printifyImageId) {
      throw new Error("shopId, title, and printifyImageId are required");
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const effectiveShopId = shopId;


    const bpId = blueprintId || DEFAULT_BLUEPRINT_ID;
    let ppId = printProviderId;

    if (!ppId) {
      const providersRes = await fetch(
        `https://api.printify.com/v1/catalog/blueprints/${bpId}/print_providers.json`,
        { headers: { Authorization: `Bearer ${printifyToken}` } }
      );
      if (!providersRes.ok) throw new Error(`Failed to get providers (${providersRes.status})`);
      const providers = await providersRes.json();
      ppId = providers.find((p: any) => p.id === 99)?.id || providers[0]?.id;
      if (!ppId) throw new Error("No print providers found");
    }

    // Get all variants and print area specs in parallel
    const [variantsRes, printingRes] = await Promise.all([
      fetch(
        `https://api.printify.com/v1/catalog/blueprints/${bpId}/print_providers/${ppId}/variants.json`,
        { headers: { Authorization: `Bearer ${printifyToken}` } }
      ),
      fetch(
        `https://api.printify.com/v1/catalog/blueprints/${bpId}/print_providers/${ppId}/printing.json`,
        { headers: { Authorization: `Bearer ${printifyToken}` } }
      ),
    ]);

    if (!variantsRes.ok) throw new Error(`Failed to get variants (${variantsRes.status})`);
    const variantsData = await variantsRes.json();
    const allVariants = variantsData.variants || [];

    // Parse print area dimensions (schema differs across Printify providers)
    let printAreaWidth = 0;
    let printAreaHeight = 0;
    if (printingRes.ok) {
      const printingData = await printingRes.json();

      const directPlaceholders = Array.isArray(printingData.placeholders) ? printingData.placeholders : [];
      const variantPrintAreas = Array.isArray(printingData.variant_print_areas) ? printingData.variant_print_areas : [];
      const variantPlaceholders = variantPrintAreas.flatMap((area: any) =>
        Array.isArray(area?.placeholders) ? area.placeholders : []
      );

      const allPlaceholders = [...directPlaceholders, ...variantPlaceholders];
      const frontPlaceholder = allPlaceholders.find((p: any) => p?.position === "front") || allPlaceholders[0];

      if (frontPlaceholder) {
        printAreaWidth = Number(
          frontPlaceholder.width ?? frontPlaceholder.print_area_width ?? frontPlaceholder.area_width ?? 0
        );
        printAreaHeight = Number(
          frontPlaceholder.height ?? frontPlaceholder.print_area_height ?? frontPlaceholder.area_height ?? 0
        );
      }

      console.log(
        `Print area: ${printAreaWidth}x${printAreaHeight} (position: ${frontPlaceholder?.position ?? "unknown"})`
      );
    }

    // Filter variants - selectedColors are exact Printify color names
    const filteredVariants = allVariants.filter((v: any) => {
      const vColor = (v.options?.color || "").trim();
      const vSize = (v.options?.size || "").trim();
      const colorMatch = !selectedColors?.length || selectedColors.some(
        (c: string) => c.toLowerCase() === vColor.toLowerCase()
      );
      const sizeMatch = !selectedSizes?.length || selectedSizes.some(
        (s: string) => s.toLowerCase() === vSize.toLowerCase()
      );
      return colorMatch && sizeMatch;
    });

    const matchedColors = [...new Set(filteredVariants.map((v: any) => v.options?.color))];
    console.log(`Selected: ${JSON.stringify(selectedColors)}, Matched: ${JSON.stringify(matchedColors)} (${filteredVariants.length} variants)`);

    if (filteredVariants.length === 0) {
      const availColors = [...new Set(allVariants.map((v: any) => v.options?.color))];
      throw new Error("No matching variants. Available: " + availColors.slice(0, 15).join(", "));
    }

    // Cap enabled variants at 100 (Printify limit)
    let enabledVariants = filteredVariants;
    if (enabledVariants.length > 100) {
      console.log(`Capping variants from ${enabledVariants.length} to 100`);
      enabledVariants = enabledVariants.slice(0, 100);
    }

    // Note: Printify auto-generates mockups from print_areas design.
    // These cannot be replaced via API. AI mockups are pushed to Shopify instead.

    // Printify normalized placement: (0.5, 0.5) is centered in the print area.
    // Nudge slightly higher to better match the approved mockup chest position.
    const parsedPlacement = parsePlacement(placement);
    const savedPlacement = parsedPlacement ?? await getSavedPlacement(adminClient, productId);
    const resolvedPlacement = parsedPlacement ?? savedPlacement;
    const placementSource = parsedPlacement ? "request" : savedPlacement ? "product" : "default";
    const { imageX, imageY, desiredScale } = mapPlacementToPrintify(resolvedPlacement);

    // Scale to stay prominent, but not oversized versus the mockup.
    let imageScale = desiredScale;
    try {
      const imageInfoRes = await fetch(
        `https://api.printify.com/v1/uploads/${printifyImageId}.json`,
        { headers: { Authorization: `Bearer ${printifyToken}` } }
      );
      if (imageInfoRes.ok) {
        const imageInfo = await imageInfoRes.json();
        const imgW = imageInfo.width || 0;
        const imgH = imageInfo.height || 0;
        console.log(`Uploaded image: ${imgW}x${imgH}, print area: ${printAreaWidth}x${printAreaHeight}`);

        if (imgW > 0 && imgH > 0 && printAreaWidth > 0 && printAreaHeight > 0) {
          const widthFillScale = printAreaWidth / imgW;
          const heightFitScale = printAreaHeight / imgH;
          const fullyVisibleScale = Math.min(widthFillScale, heightFitScale);
          const targetChestScale = Math.min(fullyVisibleScale, desiredScale);

          imageScale = clamp(targetChestScale, 0.22, 0.78);
          console.log(
            `Calculated scale: ${imageScale.toFixed(4)} (fullyVisible=${fullyVisibleScale.toFixed(4)}, widthFit=${widthFillScale.toFixed(4)}, heightFit=${heightFitScale.toFixed(4)}, desired=${desiredScale.toFixed(4)})`
          );
        }
      } else {
        console.log(`Could not fetch image info (${imageInfoRes.status}), using default scale`);
      }
    } catch (imgErr) {
      console.log(`Image info fetch failed, using default scale: ${imgErr}`);
    }

    console.log(`Using Printify placement x=${imageX.toFixed(3)} y=${imageY.toFixed(3)} scale=${imageScale.toFixed(3)} source=${placementSource} placement=${JSON.stringify(resolvedPlacement)}`);

    // Split variants into light and dark groups if we have a dark design
    // CRITICAL: Printify requires ALL variant IDs from the blueprint to appear
    // in print_areas.*.variant_ids — not just enabled ones.
    const lightColorSet = new Set((lightColors || []).map((c: string) => c.toLowerCase()));
    const hasDarkDesign = !!darkPrintifyImageId && lightColorSet.size > 0;
    const allVariantIds = allVariants.map((v: any) => v.id);

    // Helper to build print_areas ensuring ALL variantIds are covered
    const buildPrintAreas = (variantIds: number[]) => {
      const variantIdSet = new Set(variantIds);

      if (hasDarkDesign) {
        // Split by light vs dark shirt color
        const darkIds: number[] = [];
        const lightIds: number[] = [];
        for (const v of allVariants) {
          if (!variantIdSet.has(v.id)) continue;
          if (lightColorSet.has((v.options?.color || "").trim().toLowerCase())) {
            lightIds.push(v.id);
          } else {
            darkIds.push(v.id);
          }
        }

        console.log(`Dual design: ${darkIds.length} dark variants, ${lightIds.length} light variants (of ${variantIds.length} total)`);

        const areas: any[] = [];
        if (darkIds.length > 0) {
          areas.push({
            variant_ids: darkIds,
            placeholders: [{ position: "front", images: [{ id: printifyImageId, x: imageX, y: imageY, scale: imageScale, angle: 0 }] }],
          });
        }
        if (lightIds.length > 0) {
          areas.push({
            variant_ids: lightIds,
            placeholders: [{ position: "front", images: [{ id: darkPrintifyImageId, x: imageX, y: imageY, scale: imageScale, angle: 0 }] }],
          });
        }
        return areas;
      } else {
        return [{
          variant_ids: variantIds,
          placeholders: [{ position: "front", images: [{ id: printifyImageId, x: imageX, y: imageY, scale: imageScale, angle: 0 }] }],
        }];
      }
    };

    // For CREATE: include ALL blueprint variants (enabled + disabled)
    const printAreas = buildPrintAreas(allVariantIds);

    const fallbackPriceCents = Math.round(parseFloat(price?.replace(/[^0-9.]/g, "") || "29.99") * 100);
    const enabledVariantIds = new Set(enabledVariants.map((v: any) => v.id));

    // Build per-size price map in cents
    const sizePriceCents: Record<string, number> = {};
    if (sizePricing && typeof sizePricing === "object") {
      for (const [size, p] of Object.entries(sizePricing)) {
        const parsed = parseFloat((p as string)?.replace(/[^0-9.]/g, "") || "0");
        if (parsed > 0) sizePriceCents[size] = Math.round(parsed * 100);
      }
    }
    console.log(`Size pricing (cents): ${JSON.stringify(sizePriceCents)}, fallback: ${fallbackPriceCents}`);

    const getVariantPrice = (variant: any): number => {
      const vSize = (variant.options?.size || "").trim();
      return sizePriceCents[vSize] || fallbackPriceCents;
    };

    const productPayload: any = {
      title,
      description: description || "",
      tags: Array.from(new Set([...(tags || []), ...(bpId === 706 ? ["T-shirts"] : [])])),
      blueprint_id: bpId,
      print_provider_id: ppId,
      variants: allVariants.map((v: any) => ({
        id: v.id,
        price: getVariantPrice(v),
        is_enabled: enabledVariantIds.has(v.id),
      })),
      print_areas: printAreas,
    };

    // Mockup images will be set AFTER product creation using uploaded image IDs

    // --- CREATE ---
    console.log(`Creating new product in shop ${effectiveShopId} (${filteredVariants.length} enabled of ${allVariants.length} total)...`);
    const createRes = await fetch(
      `https://api.printify.com/v1/shops/${effectiveShopId}/products.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${printifyToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(productPayload),
      }
    );

    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(`Failed to create product (${createRes.status}): ${text}`);
    }

    const createdProduct = await createRes.json();
    console.log(`Created product: ${createdProduct.id}, images: ${createdProduct.images?.length || 0}`);

    if (createdProduct.id && productId) {
      await adminClient.from("products").update({ printify_product_id: createdProduct.id }).eq("id", productId);
    }

    // Publish if requested
    if (publish && createdProduct.id) {
      console.log(`Publishing product ${createdProduct.id} on Printify...`);
      const publishRes = await fetch(
        `https://api.printify.com/v1/shops/${effectiveShopId}/products/${createdProduct.id}/publish.json`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${printifyToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ title: true, description: true, images: true, variants: true, tags: true }),
        }
      );
      if (!publishRes.ok) {
        console.error(`Publish failed: ${publishRes.status} ${await publishRes.text()}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      variantCount: filteredVariants.length,
      printifyProductId: createdProduct.id,
      mockupsUploaded: 0,
      matchedColors,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("printify-create-product error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
