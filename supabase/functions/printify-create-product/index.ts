import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_BLUEPRINT_ID = 706;

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

    const printifyToken = Deno.env.get("PRINTIFY_API_TOKEN");
    if (!printifyToken) throw new Error("Printify API token not configured");

    const {
      shopId, title, description, tags, printifyImageId,
      darkPrintifyImageId, lightColors,
      selectedColors, selectedSizes, price,
      blueprintId, printProviderId, productId, printifyProductId,
    } = await req.json();

    if (!shopId || !title || !printifyImageId) {
      throw new Error("shopId, title, and printifyImageId are required");
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Read latest printify_product_id from DB
    let dbPrintifyProductId = printifyProductId || null;
    if (productId) {
      const { data: dbProduct } = await adminClient
        .from("products")
        .select("printify_product_id")
        .eq("id", productId)
        .single();
      if (dbProduct?.printify_product_id) {
        dbPrintifyProductId = dbProduct.printify_product_id;
        console.log(`DB printify_product_id: ${dbPrintifyProductId}`);
      }
    }

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

    // Parse print area dimensions
    let printAreaWidth = 0;
    let printAreaHeight = 0;
    if (printingRes.ok) {
      const printingData = await printingRes.json();
      const placeholders = printingData.placeholders || [];
      const frontPlaceholder = placeholders.find((p: any) => p.position === "front") || placeholders[0];
      if (frontPlaceholder) {
        printAreaWidth = frontPlaceholder.width || 0;
        printAreaHeight = frontPlaceholder.height || 0;
        console.log(`Print area: ${printAreaWidth}x${printAreaHeight} (position: ${frontPlaceholder.position})`);
      }
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

    // Build product payload
    const priceInCents = Math.round(parseFloat(price?.replace(/[^0-9.]/g, "") || "29.99") * 100);
    const allVariantIds = allVariants.map((v: any) => v.id);
    const filteredVariantIds = new Set(filteredVariants.map((v: any) => v.id));

    // Design placement — image is auto-trimmed during upload so content fills the area
    const imageX = 0.5;
    const imageY = 0.5;
    const imageScale = 1.0;

    // Split variants into light and dark groups if we have a dark design
    const lightColorSet = new Set((lightColors || []).map((c: string) => c.toLowerCase()));
    const hasDarkDesign = !!darkPrintifyImageId && lightColorSet.size > 0;

    let printAreas: any[];
    if (hasDarkDesign) {
      // Separate variant IDs by light vs dark shirt color
      const darkVariantIds = allVariants
        .filter((v: any) => !lightColorSet.has((v.options?.color || "").trim().toLowerCase()))
        .map((v: any) => v.id);
      const lightVariantIds = allVariants
        .filter((v: any) => lightColorSet.has((v.options?.color || "").trim().toLowerCase()))
        .map((v: any) => v.id);

      console.log(`Dual design: ${darkVariantIds.length} dark variants (white design), ${lightVariantIds.length} light variants (dark design)`);

      printAreas = [];
      if (darkVariantIds.length > 0) {
        printAreas.push({
          variant_ids: darkVariantIds,
          placeholders: [{
            position: "front",
            images: [{ id: printifyImageId, x: imageX, y: imageY, scale: imageScale, angle: 0 }],
          }],
        });
      }
      if (lightVariantIds.length > 0) {
        printAreas.push({
          variant_ids: lightVariantIds,
          placeholders: [{
            position: "front",
            images: [{ id: darkPrintifyImageId, x: imageX, y: imageY, scale: imageScale, angle: 0 }],
          }],
        });
      }
    } else {
      printAreas = [{
        variant_ids: allVariantIds,
        placeholders: [{
          position: "front",
          images: [{ id: printifyImageId, x: imageX, y: imageY, scale: imageScale, angle: 0 }],
        }],
      }];
    }

    const productPayload: any = {
      title,
      description: description || "",
      tags: Array.from(new Set([...(tags || []), ...(bpId === 706 ? ["T-shirts"] : [])])),
      blueprint_id: bpId,
      print_provider_id: ppId,
      variants: allVariants.map((v: any) => ({
        id: v.id,
        price: priceInCents,
        is_enabled: filteredVariantIds.has(v.id),
      })),
      print_areas: printAreas,
    };

    // Mockup images will be set AFTER product creation using uploaded image IDs

    // --- CREATE or UPDATE ---
    let createdProduct: any;
    let didCreate = false;

    if (dbPrintifyProductId) {
      console.log(`Fetching existing product ${dbPrintifyProductId}...`);
      const getRes = await fetch(
        `https://api.printify.com/v1/shops/${shopId}/products/${dbPrintifyProductId}.json`,
        { headers: { Authorization: `Bearer ${printifyToken}` } }
      );

      if (getRes.ok) {
        const existingProduct = await getRes.json();
        const existingVariantIds = (existingProduct.variants || []).map((v: any) => v.id);
        console.log(`Existing product has ${existingVariantIds.length} variants`);

        // Build UPDATE payload — omit blueprint_id and print_provider_id (immutable)
        // Build print_areas for update using existing variant IDs, with dual design support
        let updatePrintAreas: any[];
        if (hasDarkDesign) {
          // Match existing variants to light/dark by cross-referencing with allVariants
          const existingVariantSet = new Set(existingVariantIds);
          const darkExistingIds = allVariants
            .filter((v: any) => existingVariantSet.has(v.id) && !lightColorSet.has((v.options?.color || "").trim().toLowerCase()))
            .map((v: any) => v.id);
          const lightExistingIds = allVariants
            .filter((v: any) => existingVariantSet.has(v.id) && lightColorSet.has((v.options?.color || "").trim().toLowerCase()))
            .map((v: any) => v.id);

          updatePrintAreas = [];
          if (darkExistingIds.length > 0) {
            updatePrintAreas.push({
              variant_ids: darkExistingIds,
              placeholders: [{ position: "front", images: [{ id: printifyImageId, x: imageX, y: imageY, scale: imageScale, angle: 0 }] }],
            });
          }
          if (lightExistingIds.length > 0) {
            updatePrintAreas.push({
              variant_ids: lightExistingIds,
              placeholders: [{ position: "front", images: [{ id: darkPrintifyImageId, x: imageX, y: imageY, scale: imageScale, angle: 0 }] }],
            });
          }
        } else {
          updatePrintAreas = [{
            variant_ids: existingVariantIds,
            placeholders: [{ position: "front", images: [{ id: printifyImageId, x: imageX, y: imageY, scale: imageScale, angle: 0 }] }],
          }];
        }

        const updatePayload: any = {
          title,
          description: description || "",
          tags: productPayload.tags,
          variants: existingVariantIds.map((vid: number) => ({
            id: vid,
            price: priceInCents,
            is_enabled: filteredVariantIds.has(vid),
          })),
          print_areas: updatePrintAreas,
        };

        // Don't set images here — they'll be set after via separate PUT with uploaded IDs

        console.log(`Sending PUT update (${existingVariantIds.length} variant_ids in print_areas)...`);
        const updateRes = await fetch(
          `https://api.printify.com/v1/shops/${shopId}/products/${dbPrintifyProductId}.json`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${printifyToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(updatePayload),
          }
        );

        if (updateRes.ok) {
          createdProduct = await updateRes.json();
          console.log(`Updated product: ${dbPrintifyProductId}, images in response: ${createdProduct.images?.length || 0}`);
        } else {
          const errText = await updateRes.text();
          console.error(`PUT failed (${updateRes.status}): ${errText}`);
          throw new Error(`Failed to update Printify product: ${errText}`);
        }
      } else {
        console.log(`Product ${dbPrintifyProductId} not found (${getRes.status}), clearing stale ID`);
        if (productId) {
          await adminClient.from("products").update({ printify_product_id: null }).eq("id", productId);
        }
        dbPrintifyProductId = null;
      }
    }

    // Create new only if no existing product
    if (!createdProduct) {
      console.log(`Creating new product (${filteredVariants.length} enabled of ${allVariants.length} total)...`);
      const createRes = await fetch(
        `https://api.printify.com/v1/shops/${shopId}/products.json`,
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

      createdProduct = await createRes.json();
      didCreate = true;
      console.log(`Created product: ${createdProduct.id}, images: ${createdProduct.images?.length || 0}`);

      if (createdProduct.id && productId) {
        await adminClient.from("products").update({ printify_product_id: createdProduct.id }).eq("id", productId);
      }
    }
    // Printify auto-generates mockups from print_areas — cannot be replaced via API.
    // AI mockups are used on the Shopify storefront instead.

    return new Response(JSON.stringify({
      success: true,
      variantCount: filteredVariants.length,
      updated: !didCreate,
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
