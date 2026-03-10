import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Default blueprint: Comfort Colors 1717 Unisex Garment-Dyed T-shirt
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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error("Unauthorized");

    const printifyToken = Deno.env.get("PRINTIFY_API_TOKEN");
    if (!printifyToken) throw new Error("Printify API token not configured");

    const {
      shopId,
      title,
      description,
      tags,
      printifyImageId,
      selectedColors,
      selectedSizes,
      price,
      mockupImages,
      blueprintId,
      printProviderId,
      productId,
      printifyProductId,
    } = await req.json();

    if (!shopId || !title || !printifyImageId) {
      throw new Error("shopId, title, and printifyImageId are required");
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Always read the latest printify_product_id from DB
    let dbPrintifyProductId = printifyProductId || null;
    if (productId) {
      const { data: dbProduct } = await adminClient
        .from("products")
        .select("printify_product_id")
        .eq("id", productId)
        .single();
      if (dbProduct?.printify_product_id) {
        dbPrintifyProductId = dbProduct.printify_product_id;
        console.log(`DB has printify_product_id: ${dbPrintifyProductId}`);
      }
    }

    const bpId = blueprintId || DEFAULT_BLUEPRINT_ID;
    let ppId = printProviderId;

    // If no print provider specified, fetch available ones
    if (!ppId) {
      const providersRes = await fetch(
        `https://api.printify.com/v1/catalog/blueprints/${bpId}/print_providers.json`,
        { headers: { Authorization: `Bearer ${printifyToken}` } }
      );
      if (!providersRes.ok) {
        const text = await providersRes.text();
        throw new Error(`Failed to get print providers (${providersRes.status}): ${text}`);
      }
      const providers = await providersRes.json();
      if (!providers.length) throw new Error(`No print providers for blueprint ${bpId}`);
      ppId = providers.find((p: any) => p.id === 99)?.id || providers[0].id;
      console.log(`Auto-selected print provider ${ppId}`);
    }

    // Get available variants for this blueprint + print provider
    const variantsRes = await fetch(
      `https://api.printify.com/v1/catalog/blueprints/${bpId}/print_providers/${ppId}/variants.json`,
      { headers: { Authorization: `Bearer ${printifyToken}` } }
    );
    if (!variantsRes.ok) {
      const text = await variantsRes.text();
      throw new Error(`Failed to get variants (${variantsRes.status}): ${text}`);
    }

    const variantsData = await variantsRes.json();
    const allVariants = variantsData.variants || [];

    // STRICT color matching — exact match on Printify's color option only
    const colorMatchesVariant = (colorName: string, variant: any): boolean => {
      const c = colorName.toLowerCase().trim();
      const vColor = (variant.options?.color || "").toLowerCase().trim();
      return vColor === c;
    };

    // Filter variants by EXACT color name match and size
    const filteredVariants = allVariants.filter((v: any) => {
      const colorMatch = !selectedColors?.length || selectedColors.some(
        (c: string) => colorMatchesVariant(c, v)
      );
      const sizeMatch = !selectedSizes?.length || selectedSizes.some(
        (s: string) => {
          const vSize = (v.options?.size || "").toLowerCase().trim();
          return vSize === s.toLowerCase().trim();
        }
      );
      return colorMatch && sizeMatch;
    });

    console.log(`Color matching: selected=${JSON.stringify(selectedColors)}, matched ${filteredVariants.length} of ${allVariants.length} variants`);

    // Log a sample of matched variant colors for debugging
    const matchedColors = [...new Set(filteredVariants.map((v: any) => v.options?.color))];
    console.log(`Matched Printify colors: ${JSON.stringify(matchedColors)}`);

    if (filteredVariants.length === 0) {
      // Log available colors to help debug
      const availColors = [...new Set(allVariants.map((v: any) => v.options?.color))];
      console.log(`Available Printify colors: ${JSON.stringify(availColors)}`);
      throw new Error("No matching variants found. Available colors: " + availColors.join(", "));
    }

    // Upload mockup images to Printify
    const uploadedMockups: { colorName: string; printifyImageId: string; previewUrl: string }[] = [];
    if (mockupImages?.length > 0) {
      console.log(`Uploading ${mockupImages.length} mockup images to Printify...`);
      for (const mockup of mockupImages) {
        try {
          const uploadRes = await fetch("https://api.printify.com/v1/uploads/images.json", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${printifyToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              file_name: `mockup-${mockup.colorName}.png`,
              url: mockup.imageUrl,
            }),
          });

          if (uploadRes.ok) {
            const uploadedImage = await uploadRes.json();
            uploadedMockups.push({
              colorName: mockup.colorName,
              printifyImageId: uploadedImage.id,
              previewUrl: uploadedImage.preview_url || mockup.imageUrl,
            });
            console.log(`Uploaded mockup for ${mockup.colorName}: ${uploadedImage.id}`);
          } else {
            const errText = await uploadRes.text();
            console.error(`Failed to upload mockup for ${mockup.colorName} (${uploadRes.status}): ${errText}`);
          }
        } catch (err) {
          console.error(`Failed to upload mockup for ${mockup.colorName}:`, err);
        }
      }
      console.log(`Successfully uploaded ${uploadedMockups.length}/${mockupImages.length} mockups`);
    }

    // Build the product payload
    const priceInCents = Math.round(parseFloat(price?.replace(/[^0-9.]/g, "") || "29.99") * 100);

    // ALL variants must be in print_areas, use is_enabled to control which are active
    const allVariantIds = allVariants.map((v: any) => v.id);
    const filteredVariantIds = new Set(filteredVariants.map((v: any) => v.id));

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
      print_areas: [
        {
          variant_ids: allVariantIds,
          placeholders: [
            {
              position: "front",
              images: [
                {
                  id: printifyImageId,
                  x: 0.5,
                  y: 0.5,
                  scale: 1,
                  angle: 0,
                },
              ],
            },
          ],
        },
      ],
    };

    // Add mockup images to the product
    if (uploadedMockups.length > 0) {
      productPayload.images = uploadedMockups.map((m, idx) => ({
        src: m.previewUrl, // Use the preview URL, not the ID
        variant_ids: filteredVariants
          .filter((v: any) => colorMatchesVariant(m.colorName, v))
          .map((v: any) => v.id),
        position: "front",
        is_default: idx === 0,
      }));
    }

    // Try update first, then create
    let createdProduct: any;
    let didCreate = false;

    if (dbPrintifyProductId) {
      // Verify the product still exists on Printify before trying to update
      console.log(`Checking if Printify product ${dbPrintifyProductId} exists...`);
      const checkRes = await fetch(
        `https://api.printify.com/v1/shops/${shopId}/products/${dbPrintifyProductId}.json`,
        { headers: { Authorization: `Bearer ${printifyToken}` } }
      );

      if (checkRes.ok) {
        // Product exists — do a full PUT with all fields
        console.log(`Product exists, attempting PUT update...`);
        const updateRes = await fetch(
          `https://api.printify.com/v1/shops/${shopId}/products/${dbPrintifyProductId}.json`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${printifyToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(productPayload),
          }
        );

        if (updateRes.ok) {
          createdProduct = await updateRes.json();
          console.log(`Successfully updated Printify product: ${dbPrintifyProductId}`);
        } else {
          const errText = await updateRes.text();
          console.error(`PUT failed (${updateRes.status}): ${errText}`);
          // Clear stale ID so we don't keep trying
          dbPrintifyProductId = null;
        }
      } else {
        console.log(`Product ${dbPrintifyProductId} not found on Printify (${checkRes.status}), clearing stale ID`);
        // Clear the stale printify_product_id from DB
        if (productId) {
          await adminClient
            .from("products")
            .update({ printify_product_id: null })
            .eq("id", productId);
        }
        dbPrintifyProductId = null;
      }
    }

    // Create new if update didn't work
    if (!createdProduct) {
      console.log("Creating new Printify product...");
      console.log(`Payload variants: ${productPayload.variants.filter((v: any) => v.is_enabled).length} enabled of ${productPayload.variants.length} total`);
      
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
      console.log(`Created new Printify product: ${createdProduct.id}`);

      // Save printify_product_id back to our database
      if (createdProduct.id && productId) {
        await adminClient
          .from("products")
          .update({ printify_product_id: createdProduct.id })
          .eq("id", productId);
        console.log(`Saved printify_product_id ${createdProduct.id} to DB`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      product: createdProduct,
      variantCount: filteredVariants.length,
      updated: !didCreate,
      printifyProductId: createdProduct.id,
      mockupsUploaded: uploadedMockups.length,
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
