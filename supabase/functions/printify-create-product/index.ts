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

    // Always read the latest printify_product_id from DB (client may have stale data)
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

    // If no print provider specified, fetch available ones for this blueprint
    if (!ppId) {
      const providersRes = await fetch(
        `https://api.printify.com/v1/catalog/blueprints/${bpId}/print_providers.json`,
        { headers: { Authorization: `Bearer ${printifyToken}` } }
      );
      if (!providersRes.ok) {
        const text = await providersRes.text();
        throw new Error(`Failed to get print providers for blueprint ${bpId} (${providersRes.status}): ${text}`);
      }
      const providers = await providersRes.json();
      if (!providers.length) throw new Error(`No print providers available for blueprint ${bpId}`);
      ppId = providers.find((p: any) => p.id === 99)?.id || providers[0].id;
      console.log(`Auto-selected print provider ${ppId} for blueprint ${bpId}`);
    }

    // Step 1: Get available variants for this blueprint + print provider
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

    // Filter variants by selected colors and sizes
    const filteredVariants = allVariants.filter((v: any) => {
      const colorMatch = !selectedColors?.length || selectedColors.some(
        (c: string) => v.options?.color?.toLowerCase() === c.toLowerCase() ||
                       v.title?.toLowerCase().includes(c.toLowerCase())
      );
      const sizeMatch = !selectedSizes?.length || selectedSizes.some(
        (s: string) => v.options?.size?.toLowerCase() === s.toLowerCase() ||
                       v.title?.toLowerCase().includes(s.toLowerCase())
      );
      return colorMatch && sizeMatch;
    });

    if (filteredVariants.length === 0) {
      throw new Error("No matching variants found for the selected colors/sizes. Try different selections.");
    }

    // Step 2: Upload mockup images BEFORE building product payload
    const uploadedMockups: { colorName: string; printifyImageId: string }[] = [];
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

    // Step 3: Build the product payload
    const priceInCents = Math.round(parseFloat(price?.replace(/[^0-9.]/g, "") || "29.99") * 100);

    // For Printify updates: ALL variants must be in print_areas.variant_ids
    // Use is_enabled to control which are active
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
                  y: 0.45,
                  scale: 1,
                  angle: 0,
                },
              ],
            },
          ],
        },
      ],
    };

    // Include mockup images in the product payload
    if (uploadedMockups.length > 0) {
      productPayload.images = uploadedMockups.map((m, idx) => ({
        src: m.printifyImageId,
        variant_ids: filteredVariants
          .filter((v: any) =>
            v.options?.color?.toLowerCase() === m.colorName.toLowerCase() ||
            v.title?.toLowerCase().includes(m.colorName.toLowerCase())
          )
          .map((v: any) => v.id),
        position: idx === 0 ? "default" : undefined,
        is_default: idx === 0,
      }));
    }

    // Step 4: Create or update — try PUT first if we have an ID, fallback to POST on failure
    let createdProduct: any;
    let didCreate = false;

    if (dbPrintifyProductId) {
      console.log(`Attempting PUT update for Printify product: ${dbPrintifyProductId}`);
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
        console.log(`PUT failed for ${dbPrintifyProductId} (${updateRes.status}): ${errText}. Will create new.`);
      }
    }

    // If update didn't work (or no ID), create new
    if (!createdProduct) {
      console.log("Creating new Printify product...");
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
