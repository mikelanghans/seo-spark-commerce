import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import https from "node:https";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isEbayTransientInventoryError = (body: string) =>
  /errorId"\s*:\s*25001|Internal Server Error|Core Inventory Service internal error/i.test(body || "");

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
  for (let attempt = 0; attempt < 7; attempt++) {
    if (attempt > 0) await sleep(Math.min(1000 * Math.pow(2, attempt - 1), 8000) + Math.floor(Math.random() * 750));
    result = await ebayRequest(url, token, method, payload);
    // Retry on 5xx OR transient eBay internal errors (25001) which can come back as 400/500
    const isTransient = result.status >= 500 || isEbayTransientInventoryError(result.body);
    if (!isTransient) return result;
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
  const text = cleaned || fallback;
  if (text.length <= maxLength) return text;
  // Truncate at word boundary, trim trailing separators
  const sliced = text.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  const cut = lastSpace > maxLength * 0.6 ? sliced.slice(0, lastSpace) : sliced;
  return cut.replace(/[\s,\-|·•:;]+$/g, "").trim();
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
    title: cleanText(listing?.title, "Brand Aura Graphic T-Shirt", 65),
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
        quantity: 10,
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

// Get all valid mockup image URLs (used as fallback when a color has no specific images)
const allMockupImageUrls = (images: any[], excludedDesignUrls: Set<string>): string[] => {
  const urls: string[] = [];
  for (const img of images || []) {
    if (String(img?.image_type || "mockup").toLowerCase() === "design") continue;
    const url = String(img?.image_url || "").trim();
    if (!url || excludedDesignUrls.has(url) || !/^https:\/\//i.test(url)) continue;
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
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
    let { userId, productId, listing, images, updateFields } = await req.json();

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

    // Get current product to check existing listing (and verify ownership).
    // Server-side source of truth for price + size_pricing — never trust client values.
    const { data: product } = await sb
      .from("products")
      .select("ebay_listing_id, image_url, user_id, organization_id, price, size_pricing")
      .eq("id", productId)
      .maybeSingle();
    if (!product || (product as any).user_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authoritative pricing: product.size_pricing → org default_size_pricing → product.price
    const dbProductPricing = ((product as any).size_pricing || {}) as Record<string, any>;
    let dbSizePricing: Record<string, string> | null = null;
    if (dbProductPricing && typeof dbProductPricing === "object") {
      // size_pricing may be { "t-shirt": { S: "29.99", ... } } OR a flat { S: "29.99", ... }
      if (dbProductPricing["t-shirt"] && typeof dbProductPricing["t-shirt"] === "object") {
        dbSizePricing = dbProductPricing["t-shirt"];
      } else if (Object.keys(dbProductPricing).some((k) => /^(XS|S|M|L|XL|2XL|3XL|4XL|5XL)$/i.test(k))) {
        dbSizePricing = dbProductPricing as Record<string, string>;
      }
    }
    if (!dbSizePricing || Object.keys(dbSizePricing).length === 0) {
      const { data: orgRow } = await sb
        .from("organizations")
        .select("default_size_pricing")
        .eq("id", (product as any).organization_id)
        .maybeSingle();
      const orgDefaults = ((orgRow as any)?.default_size_pricing?.["t-shirt"] || {}) as Record<string, string>;
      if (orgDefaults && Object.keys(orgDefaults).length > 0) dbSizePricing = orgDefaults;
    }
    // Override anything the client sent
    listing = { ...(listing || {}), price: (product as any).price || listing?.price, size_pricing: dbSizePricing || listing?.size_pricing };

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
      const imagesArr = Array.isArray(images) ? images as any[] : [];
      const colorMap = groupImagesByColor(imagesArr, excludedDesignUrls);
      const fallbackImageUrls = allMockupImageUrls(imagesArr, excludedDesignUrls);
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

      // Helper: run async tasks with bounded concurrency to avoid the 150s idle timeout
      const runWithConcurrency = async <T, R>(items: T[], limit: number, worker: (item: T, idx: number) => Promise<R>): Promise<R[]> => {
        const results: R[] = new Array(items.length);
        let cursor = 0;
        const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
          while (true) {
            const i = cursor++;
            if (i >= items.length) return;
            results[i] = await worker(items[i], i);
          }
        });
        await Promise.all(runners);
        return results;
      };

      // Build full (color, size) variant plan up front
      type VariantPlan = { color: string; size: string; vSku: string; colorImages: { image_url: string; image_type: string }[] };
      const variantPlans: VariantPlan[] = [];
      const allImageUrls = new Set<string>();
      for (const color of colors) {
        const colorUrls = (colorMap.get(color) && colorMap.get(color)!.length > 0)
          ? colorMap.get(color)!
          : fallbackImageUrls;
        const colorImages = colorUrls.map((image_url) => ({ image_url, image_type: "mockup" }));
        for (const url of colorUrls) allImageUrls.add(url);
        for (const size of sizes) {
          variantPlans.push({ color, size, vSku: variantSku(baseSku, color, size), colorImages });
        }
      }
      const variantSkus = variantPlans.map((v) => v.vSku);

      // Step 1: create inventory items sequentially. eBay's Inventory API can return
      // transient 25001 Core Inventory errors when many variant PUTs hit at once.
      await runWithConcurrency(variantPlans, 1, async (v) => {
        const payload = buildInventoryPayload(v.vSku, listing, v.colorImages, true, excludedDesignUrls, v.size, v.color);
        const res = await ebayRequestWithRetry(`${apiBase}/sell/inventory/v1/inventory_item/${v.vSku}`, token, "PUT", payload);
        if (res.status < 200 || res.status >= 300) {
          console.error("Variant inventory create failed:", v.vSku, res.status, res.body);
          if (isEbayTransientInventoryError(res.body)) {
            throw new Error(`eBay is having a temporary inventory issue while creating ${v.vSku}. Please try Push to eBay again in a minute.`);
          }
          throw new Error(`eBay variant create failed (${v.vSku}): ${res.status} — ${res.body.slice(0, 200)}`);
        }
        await sleep(300);
      });

      // Step 2: create offers in parallel (bounded)
      const listingPolicies: Record<string, string> = {};
      if (policies.fulfillmentPolicyId) listingPolicies.fulfillmentPolicyId = policies.fulfillmentPolicyId;
      if (policies.paymentPolicyId) listingPolicies.paymentPolicyId = policies.paymentPolicyId;
      if (policies.returnPolicyId) listingPolicies.returnPolicyId = policies.returnPolicyId;

      const variantOfferIds: string[] = [];
      await runWithConcurrency(variantPlans, 6, async (v) => {
        const offerPayload: Record<string, unknown> = {
          sku: v.vSku,
          marketplaceId,
          format: "FIXED_PRICE",
          availableQuantity: 10,
          categoryId: "15687",
          listingDescription: description,
          pricingSummary: { price: { value: priceForSize(basePrice, v.size, listing?.size_pricing), currency: "USD" } },
          merchantLocationKey: locationKey,
        };
        if (Object.keys(listingPolicies).length > 0) offerPayload.listingPolicies = listingPolicies;

        const existing = await findOfferForSku(apiBase, token, v.vSku, marketplaceId);
        if (existing?.offerId && (!existing.status || existing.status === "UNPUBLISHED")) {
          const delRes = await ebayRequest(`${apiBase}/sell/inventory/v1/offer/${existing.offerId}`, token, "DELETE");
          console.log("Deleted stale unpublished offer:", existing.offerId, delRes.status);
        }
        const stillExists = (existing?.offerId && existing.status && existing.status !== "UNPUBLISHED") ? existing : null;
        let res = stillExists?.offerId
          ? await ebayRequest(`${apiBase}/sell/inventory/v1/offer/${stillExists.offerId}`, token, "PUT", offerPayload)
          : await ebayRequest(`${apiBase}/sell/inventory/v1/offer`, token, "POST", offerPayload);
        // If offer already exists (25002), re-fetch and PUT instead
        if (res.status >= 400 && (res.body.includes("25002") || res.body.includes("already exists"))) {
          const reFound = await findOfferForSku(apiBase, token, v.vSku, marketplaceId);
          if (reFound?.offerId) {
            res = await ebayRequest(`${apiBase}/sell/inventory/v1/offer/${reFound.offerId}`, token, "PUT", offerPayload);
          }
        }
        if (res.status < 200 || res.status >= 300) {
          console.error("Variant offer failed:", v.vSku, res.status, res.body);
          throw new Error(`eBay variant offer failed (${v.vSku}): ${res.body.slice(0, 200)}`);
        }
        const data = safeJson(res.body);
        const offerId = data.offerId || existing?.offerId;
        if (offerId) variantOfferIds.push(offerId);
      });

      // Step 3: create/update the inventory item group (this is what makes it a multi-variation listing)
      const groupKey = baseSku;
      const groupTitle = cleanText(listing?.title, "Brand Aura Graphic T-Shirt", 65);
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
          "Size Type": ["Regular"],
          Material: ["Cotton"],
          "Graphic Print": ["Yes"],
        },
        variesBy,
      };
      // Note: do NOT set group-level imageUrls. With aspectsImageVariesBy=["Color"],
      // eBay pulls images from each variant's inventory item, keyed by Color.
      // Setting group imageUrls in addition causes the gallery to show duplicates.

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
        const isEbayInternal = /errorId"\s*:\s*25001|Internal Server Error/i.test(publishRes.body);
        return new Response(JSON.stringify({
          success: false,
          error: isEbayInternal
            ? "eBay is having a temporary issue publishing this listing (error 25001). Please try again in a minute."
            : `eBay publish failed: ${publishRes.body.slice(0, 500)}`,
          item_id: baseSku,
          retryable: isEbayInternal,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const publishData = safeJson(publishRes.body);
      const listingId = publishData.listingId;
      if (!listingId) {
        return new Response(JSON.stringify({
          success: false,
          error: `eBay publish response missing listingId: ${publishRes.body.slice(0, 500)}`,
          item_id: baseSku,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
