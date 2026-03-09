import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Gildan 64000 blueprint ID on Printify
const COMFORT_COLORS_1717_BLUEPRINT_ID = 706;

// Map color names to Printify variant color names for Gildan 64000
// Print provider ID 99 (Printify Choice) is commonly used
const DEFAULT_PRINT_PROVIDER_ID = 99;

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
      mockupImages, // Array of { colorName, imageUrl } for replacing Printify mockups
      blueprintId,
      printProviderId,
    } = await req.json();

    if (!shopId || !title || !printifyImageId) {
      throw new Error("shopId, title, and printifyImageId are required");
    }

    const bpId = blueprintId || COMFORT_COLORS_1717_BLUEPRINT_ID;
    const ppId = printProviderId || DEFAULT_PRINT_PROVIDER_ID;

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

    // Step 2: Get print areas for placement
    const printAreasRes = await fetch(
      `https://api.printify.com/v1/catalog/blueprints/${bpId}/print_providers/${ppId}/printing.json`,
      { headers: { Authorization: `Bearer ${printifyToken}` } }
    );

    if (!printAreasRes.ok) {
      const text = await printAreasRes.text();
      throw new Error(`Failed to get print areas (${printAreasRes.status}): ${text}`);
    }

    const printAreasData = await printAreasRes.json();
    const printAreas = printAreasData.print_areas || [];
    
    // Find the front print area
    const frontArea = printAreas.find((a: any) => 
      a.variant_ids?.length > 0
    );

    if (!frontArea) {
      throw new Error("Could not find print area for this product");
    }

    // Step 3: Build the product
    const priceInCents = Math.round(parseFloat(price?.replace(/[^0-9.]/g, "") || "29.99") * 100);

    const productPayload = {
      title,
      description: description || "",
      tags: tags || [],
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

    const createdProduct = await createRes.json();

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
