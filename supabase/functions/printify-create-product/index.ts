import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Get all available variants
    const variantsRes = await fetch(
      `https://api.printify.com/v1/catalog/blueprints/${bpId}/print_providers/${ppId}/variants.json`,
      { headers: { Authorization: `Bearer ${printifyToken}` } }
    );
    if (!variantsRes.ok) throw new Error(`Failed to get variants (${variantsRes.status})`);
    const variantsData = await variantsRes.json();
    const allVariants = variantsData.variants || [];

    // STRICT exact color matching — selectedColors are already Printify's exact names
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
    console.log(`Selected: ${JSON.stringify(selectedColors)}`);
    console.log(`Matched ${filteredVariants.length} variants, colors: ${JSON.stringify(matchedColors)}`);

    if (filteredVariants.length === 0) {
      const availColors = [...new Set(allVariants.map((v: any) => v.options?.color))];
      throw new Error("No matching variants. Available: " + availColors.slice(0, 20).join(", "));
    }

    // Upload mockup images to Printify
    const uploadedMockups: { colorName: string; printifyImageId: string; previewUrl: string }[] = [];
    if (mockupImages?.length > 0) {
      console.log(`Uploading ${mockupImages.length} mockup images...`);
      for (const mockup of mockupImages) {
        try {
          const uploadRes = await fetch("https://api.printify.com/v1/uploads/images.json", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${printifyToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              file_name: `mockup-${mockup.printifyColorName || mockup.colorName}.png`,
              url: mockup.imageUrl,
            }),
          });

          if (uploadRes.ok) {
            const uploaded = await uploadRes.json();
            uploadedMockups.push({
              colorName: mockup.printifyColorName || mockup.colorName,
              printifyImageId: uploaded.id,
              previewUrl: uploaded.preview_url || "",
            });
            console.log(`Uploaded mockup for ${mockup.printifyColorName}: id=${uploaded.id}, preview=${uploaded.preview_url}`);
          } else {
            const errText = await uploadRes.text();
            console.error(`Mockup upload failed for ${mockup.printifyColorName} (${uploadRes.status}): ${errText}`);
          }
        } catch (err) {
          console.error(`Mockup upload error for ${mockup.printifyColorName}:`, err);
        }
      }
      console.log(`Uploaded ${uploadedMockups.length}/${mockupImages.length} mockups`);
    }

    // Build product payload
    const priceInCents = Math.round(parseFloat(price?.replace(/[^0-9.]/g, "") || "29.99") * 100);
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

    // Add mockup images to product
    if (uploadedMockups.length > 0) {
      productPayload.images = uploadedMockups.map((m, idx) => {
        const variantIds = filteredVariants
          .filter((v: any) => (v.options?.color || "").toLowerCase() === m.colorName.toLowerCase())
          .map((v: any) => v.id);
        return {
          src: m.printifyImageId, // Printify image ID as src
          variant_ids: variantIds,
          position: "front",
          is_default: idx === 0,
        };
      });
      console.log(`Product images: ${JSON.stringify(productPayload.images.map((i: any) => ({ src: i.src, variants: i.variant_ids.length })))}`);
    }

    // Create or update
    let createdProduct: any;
    let didCreate = false;

    if (dbPrintifyProductId) {
      // Check if product still exists
      console.log(`Checking product ${dbPrintifyProductId}...`);
      const checkRes = await fetch(
        `https://api.printify.com/v1/shops/${shopId}/products/${dbPrintifyProductId}.json`,
        { headers: { Authorization: `Bearer ${printifyToken}` } }
      );

      if (checkRes.ok) {
        console.log(`Product exists, sending PUT update...`);
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
          console.log(`Updated product: ${dbPrintifyProductId}`);
        } else {
          const errText = await updateRes.text();
          console.error(`PUT failed (${updateRes.status}): ${errText}`);
        }
      } else {
        console.log(`Product ${dbPrintifyProductId} gone (${checkRes.status}), clearing`);
        if (productId) {
          await adminClient.from("products").update({ printify_product_id: null }).eq("id", productId);
        }
        dbPrintifyProductId = null;
      }
    }

    if (!createdProduct) {
      console.log(`Creating new product (${filteredVariants.length} enabled variants)...`);
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
      console.log(`Created product: ${createdProduct.id}`);

      if (createdProduct.id && productId) {
        await adminClient.from("products").update({ printify_product_id: createdProduct.id }).eq("id", productId);
        console.log(`Saved printify_product_id: ${createdProduct.id}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
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
