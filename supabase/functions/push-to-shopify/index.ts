import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildBodyHtml, buildShopifyProduct, categorizeImages, deleteExistingImages, addMissingColorVariants, uploadAndAssociateImages, updateSeoMetafields } from "./shopify-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const missingProductRetryDelays = [3000, 5000, 8000];

const updateShopifyProduct = (
  domain: string,
  accessToken: string,
  productId: number,
  shopifyProduct: Record<string, unknown>,
) => fetch(
  `https://${domain}/admin/api/2024-01/products/${productId}.json`,
  {
    method: "PUT",
    headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ product: shopifyProduct }),
  },
);

const createShopifyProduct = (
  domain: string,
  accessToken: string,
  shopifyProduct: Record<string, unknown>,
) => fetch(
  `https://${domain}/admin/api/2024-01/products.json`,
  {
    method: "POST",
    headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ product: shopifyProduct }),
  },
);

const markPrintifyPublishingSucceeded = async (
  printifyToken: string | null,
  printifyShopId: number | null,
  printifyProductId: string | null,
  shopifyProductId: number,
  shopifyHandle?: string,
) => {
  if (!printifyToken || !printifyShopId || !printifyProductId) return;

  const res = await fetch(
    `https://api.printify.com/v1/shops/${printifyShopId}/products/${printifyProductId}/publishing_succeeded.json`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${printifyToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ external: { id: String(shopifyProductId), handle: shopifyHandle || String(shopifyProductId) } }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(`Failed to mark Printify publish succeeded (${res.status}): ${text.slice(0, 300)}`);
  }
};

const getPrintifyToken = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  organizationId?: string,
) => {
  let printifyToken = Deno.env.get("PRINTIFY_API_TOKEN") ?? null;

  if (organizationId) {
    const { data: secrets } = await adminClient
      .from("organization_secrets")
      .select("printify_api_token")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (secrets?.printify_api_token) {
      printifyToken = secrets.printify_api_token;
    }
  }

  return printifyToken;
};

const recoverShopifyIdFromPrintify = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  organizationId: string | undefined,
  printifyProductId: string | null,
) => {
  if (!organizationId || !printifyProductId) return null;

  const { data: org } = await adminClient
    .from("organizations")
    .select("printify_shop_id")
    .eq("id", organizationId)
    .maybeSingle();

  const printifyShopId = org?.printify_shop_id;
  if (!printifyShopId) return null;

  const printifyToken = await getPrintifyToken(adminClient, organizationId);
  if (!printifyToken) return null;

  try {
    const printifyRes = await fetch(
      `https://api.printify.com/v1/shops/${printifyShopId}/products/${printifyProductId}.json`,
      {
        headers: { Authorization: `Bearer ${printifyToken}` },
      },
    );

    if (!printifyRes.ok) {
      console.warn(`Failed to resolve Shopify ID from Printify (${printifyRes.status}) for ${printifyProductId}`);
      return null;
    }

    const printifyData = await printifyRes.json();
    const externalId = printifyData?.external?.id;
    const numericId = typeof externalId === "string" ? parseInt(externalId, 10) : externalId;

    return Number.isFinite(numericId) ? Number(numericId) : null;
  } catch (error) {
    console.warn(`Failed to recover Shopify ID from Printify for ${printifyProductId}:`, error);
    return null;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const { product, listings, imageUrl, variants, sizes: productSizes, shopifyStatus, organizationId, updateFields, forceVariants, replaceAllImages = false, allowCreateOnMissingProduct = false } = body;

    // Resolve Shopify connection
    let connection = null;
    if (organizationId) {
      const res = await adminClient.from("shopify_connections").select("store_domain, access_token").eq("organization_id", organizationId).maybeSingle();
      connection = res.data;
    }
    if (!connection) {
      const res = await adminClient.from("shopify_connections").select("store_domain, access_token").eq("user_id", user.id).maybeSingle();
      connection = res.data;
    }
    if (!connection) {
      return new Response(JSON.stringify({ error: "No Shopify connection found. Please add your Shopify credentials in Settings." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shopifyListing = listings?.find((l: { marketplace: string }) => l.marketplace === "shopify");
    const colorVariants: { colorName: string; imageUrl: string }[] = variants || [];
    const actualColorVariants = colorVariants.filter((v) => v.colorName !== "Size Chart");
    const rawDesc = shopifyListing?.description || product.description || "";
    const bulletPoints: string[] = shopifyListing?.bullet_points || shopifyListing?.bulletPoints || [];
    const price = product.price?.replace(/[^0-9.]/g, "") || "0.00";

    const domain = connection.store_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    let existingShopifyId: number | null = product.shopify_product_id ?? null;
    let existingPrintifyId: string | null = product.printify_product_id ?? null;
    let printifyShopIdForLink: number | null = null;

    if (!existingShopifyId && product.id) {
      const { data: latestProductLink } = await adminClient
        .from("products")
        .select("shopify_product_id, printify_product_id")
        .eq("id", product.id)
        .maybeSingle();

      const latestShopifyId = latestProductLink?.shopify_product_id ?? null;
      const latestPrintifyId = latestProductLink?.printify_product_id ?? null;
      if (latestShopifyId) {
        existingShopifyId = latestShopifyId;
        console.log(`Recovered linked Shopify product ID ${latestShopifyId} from product row`);
      }
      if (latestPrintifyId) {
        existingPrintifyId = latestPrintifyId;
      }
    }

    if (!existingShopifyId && existingPrintifyId) {
      const recoveredShopifyId = await recoverShopifyIdFromPrintify(
        adminClient,
        organizationId,
        existingPrintifyId,
      );

      if (recoveredShopifyId) {
        existingShopifyId = recoveredShopifyId;
        console.log(`Recovered linked Shopify product ID ${recoveredShopifyId} from Printify external mapping`);

        if (product.id) {
          await adminClient
            .from("products")
            .update({ shopify_product_id: recoveredShopifyId })
            .eq("id", product.id);
        }
      }
    }

    if (!existingShopifyId) {
      if (allowCreateOnMissingProduct) {
        console.log("No linked Shopify product found — creating Shopify product directly and linking it to Printify");
      } else {
      return new Response(JSON.stringify({
        success: false,
        missingShopifyLink: true,
        message: "No linked Shopify product found. Use 'Printify → Shopify' first so the Shopify product is created and stays connected.",
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      }
    }

    const isUpdate = !!existingShopifyId;
    const effectiveUpdateFields = Array.isArray(updateFields) ? updateFields : undefined;
    console.log(`Updating existing Shopify product ${existingShopifyId} while preserving current variant/options matrix`);

    const bodyHtml = buildBodyHtml(rawDesc, bulletPoints);
    const rawSizePricing = product.size_pricing;
    let flatSizePricing: Record<string, string> | null = null;
    if (rawSizePricing && typeof rawSizePricing === "object") {
      const category = (product.category || "").toLowerCase().replace(/\s+/g, "-");
      if (rawSizePricing[category] && typeof rawSizePricing[category] === "object") {
        flatSizePricing = rawSizePricing[category];
      } else {
        flatSizePricing = rawSizePricing;
      }
    }

    const sizes: string[] = Array.isArray(productSizes) ? productSizes : [];
    let shopifyProduct = buildShopifyProduct(product, shopifyListing, bodyHtml, shopifyStatus, colorVariants, price, isUpdate, effectiveUpdateFields, !!forceVariants, flatSizePricing, sizes);
    const shouldUpdateImages = !effectiveUpdateFields || effectiveUpdateFields.includes("images");
    const { imageEntries } = categorizeImages(colorVariants, product, shopifyListing, imageUrl);
    console.log(`Images to upload: ${imageEntries.length}, color variants: ${actualColorVariants.length}, updateFields: ${effectiveUpdateFields || "all"}`);

    const pushedColorNames = actualColorVariants.map((v) => v.colorName);
    const deleteColorFilter = replaceAllImages ? undefined : (pushedColorNames.length > 0 ? pushedColorNames : undefined);
    if (existingShopifyId && shouldUpdateImages && imageEntries.length > 0) {
      await deleteExistingImages(domain, connection.access_token, existingShopifyId, deleteColorFilter);
    }

    let shopifyResponse = existingShopifyId
      ? await updateShopifyProduct(domain, connection.access_token, existingShopifyId, shopifyProduct)
      : await createShopifyProduct(domain, connection.access_token, shopifyProduct);

    if (existingShopifyId && shopifyResponse.status === 404) {
      console.log("Existing Shopify product not found (404)");

      for (const delayMs of missingProductRetryDelays) {
        await shopifyResponse.text().catch(() => "");
        console.log(`Retrying Shopify product update in ${delayMs}ms...`);
        await wait(delayMs);

        shopifyResponse = await updateShopifyProduct(domain, connection.access_token, existingShopifyId, shopifyProduct);

        if (shopifyResponse.status !== 404) {
          console.log("Shopify product became available after retry");
          break;
        }

        console.log("Shopify product still not found after retry");
      }

      if (shopifyResponse.status === 404) {
        await shopifyResponse.text().catch(() => "");

        if (product.id) {
          const { data: latestProductLink } = await adminClient
            .from("products")
            .select("shopify_product_id")
            .eq("id", product.id)
            .maybeSingle();

          const latestShopifyId = latestProductLink?.shopify_product_id ?? null;

          if (latestShopifyId && latestShopifyId !== existingShopifyId) {
            console.log(`Switching Shopify update target from ${existingShopifyId} to refreshed linked product ${latestShopifyId}`);
            existingShopifyId = latestShopifyId;
            shopifyProduct = { ...shopifyProduct, id: latestShopifyId };

            if (shouldUpdateImages && imageEntries.length > 0) {
              await deleteExistingImages(domain, connection.access_token, latestShopifyId, deleteColorFilter);
            }

            shopifyResponse = await updateShopifyProduct(domain, connection.access_token, latestShopifyId, shopifyProduct);

            if (shopifyResponse.status === 404) {
              for (const delayMs of missingProductRetryDelays) {
                await shopifyResponse.text().catch(() => "");
                console.log(`Retrying refreshed Shopify product update in ${delayMs}ms...`);
                await wait(delayMs);
                shopifyResponse = await updateShopifyProduct(domain, connection.access_token, latestShopifyId, shopifyProduct);
                if (shopifyResponse.status !== 404) break;
              }
            }
          }
        }

        if (shopifyResponse.status === 404) {
          await shopifyResponse.text().catch(() => "");

          if (product.id) {
            await adminClient
              .from("products")
              .update({ shopify_product_id: null })
              .eq("id", product.id);
          }

          return new Response(JSON.stringify({
            success: false,
            staleShopifyIdCleared: true,
            message: "Linked Shopify product no longer exists. The stale link was cleared. Use 'Printify → Shopify' to recreate and relink it.",
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      console.error("Shopify API error:", shopifyResponse.status, errorText);
      throw new Error(`Shopify API error (${shopifyResponse.status}): ${errorText}`);
    }

    const shopifyData = await shopifyResponse.json();
    const createdProduct = shopifyData.product;
    console.log(`Shopify product id: ${createdProduct?.id}, variants: ${createdProduct?.variants?.length || 0}`);

    // Save Shopify product ID and sync timestamp back
    if (createdProduct?.id && product.id) {
      await adminClient.from("products").update({ shopify_product_id: createdProduct.id, shopify_synced_at: new Date().toISOString() }).eq("id", product.id);
    }

    // For updates, add any missing color variants before uploading images
    let allVariants = createdProduct?.variants || [];
    if (isUpdate && createdProduct?.id && actualColorVariants.length > 0) {
      allVariants = await addMissingColorVariants(
        domain,
        connection.access_token,
        createdProduct.id,
        allVariants,
        actualColorVariants.map((v) => v.colorName),
        price,
      );
    }

    // Upload images and associate with variants (use fresh variant list)
    if (createdProduct?.id && shouldUpdateImages && imageEntries.length > 0) {
      await uploadAndAssociateImages(
        domain,
        connection.access_token,
        createdProduct.id,
        imageEntries,
        allVariants,
        actualColorVariants,
        product.title,
      );
    }

    // Update all variants: disable inventory tracking via InventoryItem API, set shipping, apply pricing
    if (createdProduct?.id && allVariants.length) {
      for (const variant of allVariants) {
        // 1. Update variant pricing and shipping
        const updates: Record<string, unknown> = {
          id: variant.id,
          inventory_policy: "continue",
          requires_shipping: true,
        };
        if (flatSizePricing) {
          const size = (variant.option2 || variant.option1 || "").trim();
          if (flatSizePricing[size]) {
            updates.price = flatSizePricing[size];
          } else if (price !== "0.00") {
            updates.price = price;
          }
        } else if (price !== "0.00" && variant.price === "0.00") {
          updates.price = price;
        }
        try {
          await fetch(
            `https://${domain}/admin/api/2024-01/variants/${variant.id}.json`,
            {
              method: "PUT",
              headers: { "X-Shopify-Access-Token": connection.access_token, "Content-Type": "application/json" },
              body: JSON.stringify({ variant: updates }),
            },
          );
        } catch (err) {
          console.error(`Failed to update variant ${variant.id}:`, err);
        }

        // 2. Disable inventory tracking via InventoryItem API
        if (variant.inventory_item_id) {
          try {
            await fetch(
              `https://${domain}/admin/api/2024-01/inventory_items/${variant.inventory_item_id}.json`,
              {
                method: "PUT",
                headers: { "X-Shopify-Access-Token": connection.access_token, "Content-Type": "application/json" },
                body: JSON.stringify({ inventory_item: { id: variant.inventory_item_id, tracked: false } }),
              },
            );
          } catch (err) {
            console.error(`Failed to disable tracking for inventory item ${variant.inventory_item_id}:`, err);
          }
        }
      }
      console.log(`Updated ${allVariants.length} variants (inventory tracking disabled, shipping, pricing)`);
    }

    // Update SEO metafields (title_tag, description_tag) via metafields API
    const shouldUpdateSeo = !updateFields || updateFields.includes("seo");
    if (createdProduct?.id && shouldUpdateSeo) {
      await updateSeoMetafields(
        domain,
        connection.access_token,
        createdProduct.id,
        shopifyListing?.seo_title || shopifyListing?.seoTitle,
        shopifyListing?.seo_description || shopifyListing?.seoDescription,
      );
    }

    return new Response(JSON.stringify({
      success: true,
      shopifyProduct: createdProduct,
      updated: isUpdate,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("push-to-shopify error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
