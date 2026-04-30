import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import https from "node:https";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ebayRequest = async (url: string, token: string, method: string, payload?: unknown) => {
  const urlObj = new URL(url);
  const body = payload != null ? JSON.stringify(payload) : undefined;
  const headers: Record<string, string | number> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "Content-Language": "en-US",
    "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
  };
  if (body) {
    headers["Content-Length"] = new TextEncoder().encode(body).length;
  }

  return await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = https.request({
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      path: `${urlObj.pathname}${urlObj.search}`,
      method,
      headers,
    }, (res) => {
      let responseBody = "";

      res.on("data", (chunk) => {
        responseBody += typeof chunk === "string" ? chunk : chunk.toString();
      });

      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          body: responseBody,
        });
      });
    });

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
};

const ebayRequestWithRetry = async (url: string, token: string, method: string, payload?: unknown) => {
  let result = { status: 0, body: "" };
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(1000 * attempt);
    result = await ebayRequest(url, token, method, payload);
    if (result.status < 500) return result;
  }
  return result;
};

const parsePrice = (value: unknown) => {
  const match = String(value ?? "").match(/\d+(?:\.\d{1,2})?/);
  const amount = match ? Number.parseFloat(match[0]) : 29.99;
  return Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : "29.99";
};

const cleanText = (value: unknown, fallback: string, maxLength: number) => {
  const cleaned = String(value ?? "")
    .replace(/[#*_`]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || fallback).slice(0, maxLength);
};

// Convert plain-text description into HTML preserving paragraph breaks.
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const descriptionToHtml = (value: unknown, fallback: string) => {
  const raw = String(value ?? "")
    .replace(/[#*_`]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .trim();
  const text = raw || fallback;
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\n/g, " ").replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
  return paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
};

const bulletsToHtml = (bullets: unknown) => {
  if (!Array.isArray(bullets)) return "";
  const items = bullets
    .map((b) => String(b ?? "").replace(/[#*_`]/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 10);
  if (!items.length) return "";
  return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
};

const buildDescriptionHtml = (listing: any) => {
  const body = descriptionToHtml(listing?.description, "Graphic t-shirt in new condition.");
  const bullets = bulletsToHtml(listing?.bullet_points);
  // eBay limits description to ~500k chars; we'll cap to be safe.
  return (body + bullets).slice(0, 80000);
};

const imageUrlsForEbay = (images: unknown, excludedDesignUrls = new Set<string>()) => {
  const urls = Array.isArray(images)
    ? images
        .filter((img: any) => String(img?.image_type || "mockup").toLowerCase() !== "design")
        .map((img: any) => String(img?.image_url || "").trim())
    : [];
  return [...new Set(urls)]
    .filter((url) => /^https:\/\//i.test(url))
    .filter((url) => !excludedDesignUrls.has(url))
    .slice(0, 12);
};

const isBrandAuraSku = (value: unknown) => /^BA-[a-z0-9-]+$/i.test(String(value || ""));

const stableSkuForProduct = (productId: string) => `BA-${productId.slice(0, 8)}`;

const safeJson = (body: string) => {
  try {
    return JSON.parse(body || "{}");
  } catch {
    return {};
  }
};

const findOfferForSku = async (apiBase: string, token: string, sku: string, marketplaceId: string) => {
  const res = await ebayRequest(
    `${apiBase}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&marketplace_id=${marketplaceId}`,
    token,
    "GET",
  );
  console.log("Offer lookup:", res.status, res.body);
  if (res.status < 200 || res.status >= 300) return null;
  const data = safeJson(res.body);
  const offer = Array.isArray(data.offers) ? data.offers[0] : null;
  return offer ? {
    offerId: offer.offerId || offer.id || null,
    listingId: offer.listing?.listingId || offer.listingId || null,
    offer,
  } : null;
};

const buildInventoryPayload = (sku: string, listing: any, images: unknown, includeImages = true, excludedDesignUrls = new Set<string>(), sizeOverride?: string, colorOverride?: string) => {
  const product: Record<string, unknown> = {
    title: cleanText(listing?.title, "Brand Aura Graphic T-Shirt", 80),
    description: buildDescriptionHtml(listing),
    brand: "Youniverses",
    mpn: sku,
    aspects: {
      Brand: ["Youniverses"],
      Type: ["T-Shirt"],
      Department: ["Unisex Adults"],
      "Size Type": ["Regular"],
      Size: [String(sizeOverride || listing?.size || "L")],
      Color: [String(colorOverride || listing?.color || "Black")],
      Material: ["Cotton"],
      "Graphic Print": ["Yes"],
      "MPN": [sku],
    },
  };
  const imageUrls = imageUrlsForEbay(images, excludedDesignUrls);
  if (includeImages && imageUrls.length > 0) product.imageUrls = imageUrls;

  return {
    product,
    condition: "NEW",
    availability: {
      shipToLocationAvailability: {
        quantity: 999,
      },
    },
  };
};

// ----- Multi-variation helpers -----
const DEFAULT_SIZES = ["S", "M", "L", "XL", "2XL", "3XL"];
const SIZE_UPCHARGE: Record<string, number> = { "2XL": 2, "3XL": 4, "4XL": 6, "5XL": 8 };

const slug = (s: string) => String(s || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20) || "X";

const variantSku = (baseSku: string, color: string, size: string) =>
  `${baseSku}-${slug(color)}-${slug(size)}`.slice(0, 50);

const sizesFromListing = (listing: any): string[] => {
  const sp = listing?.size_pricing;
  if (sp && typeof sp === "object" && !Array.isArray(sp)) {
    const keys = Object.keys(sp).filter(Boolean);
    if (keys.length) return keys;
  }
  return DEFAULT_SIZES;
};

const priceForSize = (basePrice: number, size: string, sizePricing?: any): string => {
  if (sizePricing && typeof sizePricing === "object" && sizePricing[size] != null) {
    const v = parsePrice(sizePricing[size]);
    return v;
  }
  const upcharge = SIZE_UPCHARGE[size] || 0;
  return (basePrice + upcharge).toFixed(2);
};

// Group images by color from product_images rows
const groupImagesByColor = (images: any[], excludedDesignUrls: Set<string>): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const img of images || []) {
    if (String(img?.image_type || "mockup").toLowerCase() === "design") continue;
    const url = String(img?.image_url || "").trim();
    if (!url || excludedDesignUrls.has(url) || !/^https:\/\//i.test(url)) continue;
    const color = String(img?.color_name || "").trim() || "Black";
    if (!map.has(color)) map.set(color, []);
    const arr = map.get(color)!;
    if (!arr.includes(url)) arr.push(url);
  }
  return map;
};

const fetchPolicies = async (apiBase: string, token: string, marketplaceId: string) => {
  const types = ["fulfillment_policy", "payment_policy", "return_policy"] as const;
  const results: Record<string, string | null> = {
    fulfillmentPolicyId: null,
    paymentPolicyId: null,
    returnPolicyId: null,
  };
  const keys = ["fulfillmentPolicyId", "paymentPolicyId", "returnPolicyId"];
  const responseKeys = ["fulfillmentPolicies", "paymentPolicies", "returnPolicies"];

  for (let i = 0; i < types.length; i++) {
    try {
      const res = await ebayRequest(
        `${apiBase}/sell/account/v1/${types[i]}?marketplace_id=${marketplaceId}`,
        token,
        "GET",
      );
      if (res.status >= 200 && res.status < 300) {
        const data = JSON.parse(res.body);
        const policies = data[responseKeys[i]] || data.policies || [];
        if (policies.length > 0) {
          results[keys[i]] = policies[0][keys[i]] || policies[0].id || null;
        }
      }
    } catch (e) {
      console.warn(`Failed to fetch ${types[i]}:`, e);
    }
  }
  return results;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, productId, listing, images, updateFields } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await authClient.auth.getUser();
    if (userErr || !user || user.id !== userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, supabaseKey);

    // Get eBay connection
    const { data: conn, error: connErr } = await sb
      .from("ebay_connections")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (connErr || !conn) {
      return new Response(JSON.stringify({ error: "No eBay connection found. Please connect your eBay account first." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { client_id, client_secret, environment, access_token, refresh_token, token_expires_at } = conn;

    // Determine API base URL
    const isSandbox = environment === "sandbox";
    const apiBase = isSandbox
      ? "https://api.sandbox.ebay.com"
      : "https://api.ebay.com";

    // Get/refresh access token if needed
    let token = access_token;

    const expiresAt = token_expires_at ? Date.parse(token_expires_at) : 0;
    const shouldRefresh = !token || !expiresAt || expiresAt < Date.now() + 5 * 60 * 1000;

    if (shouldRefresh && refresh_token && client_id && client_secret) {
      // Refresh the seller user token; Sell Inventory APIs require user-granted scopes.
      const authBase = isSandbox
        ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
        : "https://api.ebay.com/identity/v1/oauth2/token";

      const creds = btoa(`${client_id}:${client_secret}`);
      const tokenRes = await fetch(authBase, {
        method: "POST",
        headers: {
          Authorization: `Basic ${creds}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token,
          scope: "https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.marketing https://api.ebay.com/oauth/api_scope/sell.account",
        }).toString(),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error("eBay token error:", tokenRes.status, errText);
        throw new Error("Failed to authenticate with eBay. Check your credentials.");
      }

      const tokenData = await tokenRes.json();
      token = tokenData.access_token;

      // Save token
      await sb.from("ebay_connections").update({
        access_token: token,
        refresh_token: tokenData.refresh_token || refresh_token,
        token_expires_at: new Date(Date.now() + (tokenData.expires_in || 7200) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      } as any).eq("id", conn.id);
    }

    if (!token) {
      throw new Error("No eBay access token available. Please reconnect.");
    }

    // Get current product to check existing listing
    const { data: product } = await sb.from("products").select("ebay_listing_id, image_url").eq("id", productId).maybeSingle();
    const existingListingId = product?.ebay_listing_id;
    const { data: designRows } = await sb
      .from("product_images")
      .select("image_url")
      .eq("product_id", productId)
      .eq("image_type", "design");
    const excludedDesignUrls = new Set<string>([
      String(product?.image_url || "").trim(),
      ...((designRows || []).map((row: any) => String(row?.image_url || "").trim())),
    ].filter(Boolean));
    const marketplaceId = "EBAY_US";
    const knownSku = isBrandAuraSku(existingListingId) ? existingListingId : stableSkuForProduct(productId);

    const description = buildDescriptionHtml(listing);
    const updateImages = !updateFields || updateFields.includes("images");
    const updateDescription = !updateFields || updateFields.includes("description");
    const updateTitle = !updateFields || updateFields.includes("title");

    // Always rebuild as a multi-variation group; single-SKU update path is disabled.
    const hasStoredPublishedListing = false;
    const storedListingOffer = hasStoredPublishedListing
      ? await findOfferForSku(apiBase, token, knownSku, marketplaceId)
      : null;

    if (hasStoredPublishedListing && storedListingOffer?.offerId) {
      const reviseRes = await ebayRequestWithRetry(
        `${apiBase}/sell/inventory/v1/inventory_item/${knownSku}`,
        token,
        "PUT",
        buildInventoryPayload(knownSku, listing, updateImages ? images : [], updateImages, excludedDesignUrls),
      );

      if (reviseRes.status < 200 || reviseRes.status >= 300) {
        console.error("eBay inventory update error:", reviseRes.status, reviseRes.body);
        throw new Error(`eBay inventory update failed: ${reviseRes.status}`);
      }

      if (updateDescription || updateTitle) {
        const offerPatch = {
          ...storedListingOffer.offer,
          listingDescription: updateDescription ? description : storedListingOffer.offer?.listingDescription,
        };
        delete (offerPatch as any).offerId;
        delete (offerPatch as any).listing;
        delete (offerPatch as any).status;
        delete (offerPatch as any).href;
        const offerRes = await ebayRequest(
            `${apiBase}/sell/inventory/v1/offer/${storedListingOffer.offerId}`,
            token,
          "PUT",
          offerPatch,
        );
        console.log("Existing offer update:", offerRes.status, offerRes.body);
        if (offerRes.status < 200 || offerRes.status >= 300) {
          console.error("eBay offer update error:", offerRes.status, offerRes.body);
          throw new Error(`eBay offer update failed: ${offerRes.status}`);
        }
      }

        const publishRes = await ebayRequest(
          `${apiBase}/sell/inventory/v1/offer/${storedListingOffer.offerId}/publish`,
          token,
          "POST",
          {},
        );
        console.log("Republish existing offer:", publishRes.status, publishRes.body);
        if (publishRes.status >= 200 && publishRes.status < 300) {
          const publishData = safeJson(publishRes.body);
          const listingId = publishData.listingId || storedListingOffer.listingId || existingListingId;
          await sb.from("products").update({ ebay_listing_id: String(listingId) } as any).eq("id", productId);
          return new Response(JSON.stringify({ success: true, item_id: knownSku, listing_id: listingId, action: "published" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

      return new Response(JSON.stringify({ success: true, item_id: knownSku, listing_id: existingListingId, action: "updated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      if (hasStoredPublishedListing && !storedListingOffer?.offerId) {
        console.log("Stored eBay listing is stale or deleted; creating multi-variation group for SKU:", knownSku);
      }

      const baseSku = knownSku;
      const basePrice = Number.parseFloat(parsePrice(listing.price));
      const sizes = sizesFromListing(listing);
      const colorMap = groupImagesByColor(Array.isArray(images) ? images as any[] : [], excludedDesignUrls);
      const colors = colorMap.size > 0
        ? Array.from(colorMap.keys())
        : [String(listing?.color || "Black")];

      // Ensure default location
      const locationKey = "default-location";
      const locCheck = await ebayRequest(`${apiBase}/sell/inventory/v1/location/${locationKey}`, token, "GET");
      if (locCheck.status >= 300) {
        console.log("Creating default inventory location...");
        await ebayRequest(
          `${apiBase}/sell/inventory/v1/location/${locationKey}`, token, "POST", {
            location: { address: { addressLine1: "123 Main St", city: "New York", stateOrProvince: "NY", postalCode: "10001", country: "US" } },
            merchantLocationStatus: "ENABLED",
            name: "Default Location",
            locationTypes: ["WAREHOUSE"],
          }
        );
      }

      const policies = await fetchPolicies(apiBase, token, marketplaceId);

      // Step 1: create one inventory item per (color, size) combo
      const variantSkus: string[] = [];
      const allImageUrls = new Set<string>();
      for (const color of colors) {
        const colorImages = (colorMap.get(color) || []).map((image_url) => ({ image_url, image_type: "mockup" }));
        for (const url of colorMap.get(color) || []) allImageUrls.add(url);
        for (const size of sizes) {
          const vSku = variantSku(baseSku, color, size);
          variantSkus.push(vSku);
          const payload = buildInventoryPayload(vSku, listing, colorImages, true, excludedDesignUrls, size, color);
          const res = await ebayRequestWithRetry(`${apiBase}/sell/inventory/v1/inventory_item/${vSku}`, token, "PUT", payload);
          if (res.status < 200 || res.status >= 300) {
            console.error("Variant inventory create failed:", vSku, res.status, res.body);
            throw new Error(`eBay variant create failed (${vSku}): ${res.status} — ${res.body.slice(0, 200)}`);
          }
        }
      }

      // Step 2: create an offer per variant
      const variantOfferIds: string[] = [];
      const listingPolicies: Record<string, string> = {};
      if (policies.fulfillmentPolicyId) listingPolicies.fulfillmentPolicyId = policies.fulfillmentPolicyId;
      if (policies.paymentPolicyId) listingPolicies.paymentPolicyId = policies.paymentPolicyId;
      if (policies.returnPolicyId) listingPolicies.returnPolicyId = policies.returnPolicyId;

      for (const color of colors) {
        for (const size of sizes) {
          const vSku = variantSku(baseSku, color, size);
          const offerPayload: Record<string, unknown> = {
            sku: vSku,
            marketplaceId,
            format: "FIXED_PRICE",
            availableQuantity: 999,
            categoryId: "15687",
            listingDescription: description,
            pricingSummary: { price: { value: priceForSize(basePrice, size, listing?.size_pricing), currency: "USD" } },
            merchantLocationKey: locationKey,
          };
          if (Object.keys(listingPolicies).length > 0) offerPayload.listingPolicies = listingPolicies;

          const existing = await findOfferForSku(apiBase, token, vSku, marketplaceId);
          const res = existing?.offerId
            ? await ebayRequest(`${apiBase}/sell/inventory/v1/offer/${existing.offerId}`, token, "PUT", offerPayload)
            : await ebayRequest(`${apiBase}/sell/inventory/v1/offer`, token, "POST", offerPayload);
          if (res.status < 200 || res.status >= 300) {
            console.error("Variant offer failed:", vSku, res.status, res.body);
            throw new Error(`eBay variant offer failed (${vSku}): ${res.body.slice(0, 200)}`);
          }
          const data = safeJson(res.body);
          const offerId = data.offerId || existing?.offerId;
          if (offerId) variantOfferIds.push(offerId);
        }
      }

      // Step 3: create/update the inventory item group (this is what makes it a multi-variation listing)
      const groupKey = baseSku;
      const groupTitle = cleanText(listing?.title, "Brand Aura Graphic T-Shirt", 80);
      const groupImages = Array.from(allImageUrls).slice(0, 12);
      const variesBy: Record<string, unknown> = {
        aspectsImageVariesBy: ["Color"],
        specifications: [
          { name: "Color", values: colors },
          { name: "Size", values: sizes },
        ],
      };
      const groupPayload: Record<string, unknown> = {
        inventoryItemGroupKey: groupKey,
        title: groupTitle,
        description: description,
        variantSKUs: variantSkus,
        aspects: {
          Brand: ["Youniverses"],
          Type: ["T-Shirt"],
          Department: ["Unisex Adults"],
          Material: ["Cotton"],
        },
        variesBy,
      };
      if (groupImages.length > 0) groupPayload.imageUrls = groupImages;

      const groupRes = await ebayRequestWithRetry(
        `${apiBase}/sell/inventory/v1/inventory_item_group/${encodeURIComponent(groupKey)}`,
        token,
        "PUT",
        groupPayload,
      );
      if (groupRes.status < 200 || groupRes.status >= 300) {
        console.error("Inventory item group failed:", groupRes.status, groupRes.body);
        throw new Error(`eBay item group failed: ${groupRes.body.slice(0, 300)}`);
      }

      // Step 4: publish the group (single multi-variation listing)
      let publishRes = { status: 0, body: "" };
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await sleep(2000);
        publishRes = await ebayRequest(
          `${apiBase}/sell/inventory/v1/offer/publish_by_inventory_item_group`,
          token,
          "POST",
          { inventoryItemGroupKey: groupKey, marketplaceId },
        );
        console.log(`Group publish attempt ${attempt + 1}:`, publishRes.status, publishRes.body);
        if (publishRes.status >= 200 && publishRes.status < 300) break;
      }

      if (publishRes.status < 200 || publishRes.status >= 300) {
        console.error("eBay group publish error:", publishRes.status, publishRes.body);
        return new Response(JSON.stringify({
          success: false,
          error: `eBay publish failed: ${publishRes.body.slice(0, 500)}`,
          item_id: baseSku,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const publishData = safeJson(publishRes.body);
      const listingId = publishData.listingId;
      if (!listingId) {
        return new Response(JSON.stringify({
          success: false,
          error: `eBay publish response missing listingId: ${publishRes.body.slice(0, 500)}`,
          item_id: baseSku,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await sb.from("products").update({ ebay_listing_id: String(listingId) } as any).eq("id", productId);

      return new Response(JSON.stringify({
        success: true,
        item_id: baseSku,
        listing_id: listingId,
        action: "published",
        variants: variantSkus.length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (e) {
    console.error("push-to-ebay error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
