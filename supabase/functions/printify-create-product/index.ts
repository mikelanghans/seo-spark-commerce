import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Default blueprint: Comfort Colors 1717 Unisex Garment-Dyed T-shirt
const DEFAULT_BLUEPRINT_ID = 706;
// Default print provider: will be dynamically resolved if not provided

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
      productId,         // Our internal product ID
      printifyProductId, // Existing Printify product ID (for updates)
    } = await req.json();

    if (!shopId || !title || !printifyImageId) {
      throw new Error("shopId, title, and printifyImageId are required");
    }

    // Always read the latest printify_product_id from DB (client may have stale data)
    let dbPrintifyProductId = printifyProductId || null;
    if (productId) {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
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
      // Prefer provider 99 if available, otherwise use first
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

    // Step 2: Build the product
    const priceInCents = Math.round(parseFloat(price?.replace(/[^0-9.]/g, "") || "29.99") * 100);

    const productPayload = {
      title,
      description: description || "",
      tags: Array.from(new Set([...(tags || []), ...(bpId === 706 ? ["T-shirts"] : [])])),
      blueprint_id: bpId,
      print_provider_id: ppId,
      variants: filteredVariants.map((v: any) => ({
        id: v.id,
        price: priceInCents,
        is_enabled: true,
      })),
      print_areas: [
        {
          variant_ids: filteredVariants.map((v: any) => v.id),
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

    let createdProduct: any;
    let didCreate = false;

    // Helper: look up existing product on Printify by title
    const findProductByTitle = async (): Promise<string | null> => {
      try {
        let page = 1;
        while (page <= 5) { // Check up to 5 pages
          const listUrl = `https://api.printify.com/v1/shops/${shopId}/products.json?page=${page}&limit=100`;
          console.log(`Fetching Printify products: ${listUrl}`);
          const listRes = await fetch(listUrl, {
            headers: { Authorization: `Bearer ${printifyToken}` }
          });
          if (!listRes.ok) {
            const errText = await listRes.text();
            console.error(`Printify list products failed (${listRes.status}): ${errText}`);
            return null;
          }
          const data = await listRes.json();
          const products = data.data || data;
          console.log(`Printify products page ${page}: ${JSON.stringify(products?.map?.((p: any) => ({ id: p.id, title: p.title })) || 'not array')}`);
          if (!Array.isArray(products) || products.length === 0) return null;
          
          // Try exact match first, then partial match
          const exactMatch = products.find((p: any) => p.title === title);
          if (exactMatch) {
            console.log(`Found exact match: ${exactMatch.id}`);
            return exactMatch.id;
          }
          
          // Try partial/includes match (handles minor differences)
          const partialMatch = products.find((p: any) => 
            p.title?.includes(title) || title?.includes(p.title)
          );
          if (partialMatch) {
            console.log(`Found partial match: ${partialMatch.id} (title: "${partialMatch.title}")`);
            return partialMatch.id;
          }
          
          // Check if there are more pages
          if (products.length < 100) return null;
          page++;
        }
      } catch (e) {
        console.error("Error searching Printify products:", e);
      }
      return null;
    };

    const updateProduct = async (pId: string) => {
      const updateRes = await fetch(
        `https://api.printify.com/v1/shops/${shopId}/products/${pId}.json`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${printifyToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(productPayload),
        }
      );
      if (!updateRes.ok) {
        const text = await updateRes.text();
        throw new Error(`Failed to update product (${updateRes.status}): ${text}`);
      }
      return await updateRes.json();
    };

    const createNewProduct = async () => {
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

      const product = await createRes.json();
      didCreate = true;

      // Save printify_product_id back to our database
      if (product.id && productId) {
        const adminClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await adminClient
          .from("products")
          .update({ printify_product_id: product.id })
          .eq("id", productId);
      }

      return product;
    };

    // Resolve the correct Printify product ID (use DB value, not client value)
    let resolvedPrintifyId = dbPrintifyProductId;

    // If we have a stored ID, verify it exists
    if (resolvedPrintifyId) {
      const checkRes = await fetch(
        `https://api.printify.com/v1/shops/${shopId}/products/${resolvedPrintifyId}.json`,
        { headers: { Authorization: `Bearer ${printifyToken}` } }
      );
      if (checkRes.status === 404) {
        console.log(`Stored Printify ID ${resolvedPrintifyId} not found, searching by title...`);
        await checkRes.text();
        resolvedPrintifyId = await findProductByTitle();
      } else {
        await checkRes.text(); // consume body
      }
    } else {
      // No stored ID — try to find by title
      resolvedPrintifyId = await findProductByTitle();
    }

    // Save the resolved ID if different from what we had
    if (resolvedPrintifyId && resolvedPrintifyId !== printifyProductId && productId) {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await adminClient
        .from("products")
        .update({ printify_product_id: resolvedPrintifyId })
        .eq("id", productId);
      console.log(`Updated stored printify_product_id to ${resolvedPrintifyId}`);
    }

    if (resolvedPrintifyId) {
      console.log(`Updating existing Printify product: ${resolvedPrintifyId}`);
      createdProduct = await updateProduct(resolvedPrintifyId);
    } else {
      console.log("No existing product found, creating new one");
      createdProduct = await createNewProduct();
    }

    // Step 4: Replace mockup images if provided
    if (mockupImages?.length > 0 && createdProduct.id) {
      // Upload each mockup image to Printify
      const uploadedMockups: { colorName: string; printifyImageId: string }[] = [];
      
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
          }
        } catch (err) {
          console.error(`Failed to upload mockup for ${mockup.colorName}:`, err);
        }
      }

      // Set product images using uploaded mockups
      if (uploadedMockups.length > 0) {
        const productImages = uploadedMockups.map((m, idx) => ({
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

        try {
          await fetch(
            `https://api.printify.com/v1/shops/${shopId}/products/${createdProduct.id}/images.json`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${printifyToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ images: productImages }),
            }
          );
        } catch (err) {
          console.error("Failed to set product images:", err);
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      product: createdProduct,
      variantCount: filteredVariants.length,
      updated: !!resolvedPrintifyId && !didCreate,
      printifyProductId: createdProduct.id,
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
