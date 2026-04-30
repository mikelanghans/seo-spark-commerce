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

const imageUrlsForEbay = (images: unknown) => {
  const urls = Array.isArray(images)
    ? images.map((img: any) => String(img?.image_url || "").trim())
    : [];
  return [...new Set(urls)]
    .filter((url) => /^https:\/\//i.test(url))
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
  } : null;
};

const buildInventoryPayload = (sku: string, listing: any, images: unknown, includeImages = true) => {
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
      Size: [String(listing?.size || "L")],
      Color: [String(listing?.color || "Black")],
      Material: ["Cotton"],
      "Graphic Print": ["Yes"],
      "MPN": [sku],
    },
  };
  const imageUrls = imageUrlsForEbay(images);
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
    const { data: product } = await sb.from("products").select("ebay_listing_id").eq("id", productId).maybeSingle();
    const existingListingId = product?.ebay_listing_id;
    const marketplaceId = "EBAY_US";
    const knownSku = isBrandAuraSku(existingListingId) ? existingListingId : stableSkuForProduct(productId);

    const description = buildDescriptionHtml(listing);

    const hasStoredPublishedListing = existingListingId && !isBrandAuraSku(existingListingId);
    const storedListingOffer = hasStoredPublishedListing
      ? await findOfferForSku(apiBase, token, knownSku, marketplaceId)
      : null;

    if (hasStoredPublishedListing && storedListingOffer?.offerId) {
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

      // Revise existing listing. eBay treats PUT as a full replacement, so send a complete item payload.
      const reviseRes = await ebayRequestWithRetry(
        `${apiBase}/sell/inventory/v1/inventory_item/${knownSku}`,
        token,
        "PUT",
        buildInventoryPayload(knownSku, listing, images, !updateFields || updateFields.includes("images")),
      );

      if (reviseRes.status < 200 || reviseRes.status >= 300) {
        console.error("eBay revise error:", reviseRes.status, reviseRes.body);
        throw new Error(`eBay update failed: ${reviseRes.status}`);
      }

      return new Response(JSON.stringify({ success: true, item_id: knownSku, listing_id: existingListingId, action: "updated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      if (hasStoredPublishedListing && !storedListingOffer?.offerId) {
        console.log("Stored eBay listing is stale or deleted; creating and publishing a new offer for SKU:", knownSku);
      }

      // Create or complete an inventory item. Legacy rows may contain a SKU before the offer was published.
      const sku = knownSku;

      const inventoryPayload = buildInventoryPayload(sku, listing, images);
      let createRes = await ebayRequestWithRetry(`${apiBase}/sell/inventory/v1/inventory_item/${sku}`, token, "PUT", inventoryPayload);

      if (createRes.status >= 500 && imageUrlsForEbay(images).length > 1) {
        console.warn("Retrying eBay inventory create with a single image after server error");
        createRes = await ebayRequestWithRetry(
          `${apiBase}/sell/inventory/v1/inventory_item/${sku}`,
          token,
          "PUT",
          buildInventoryPayload(sku, listing, imageUrlsForEbay(images).slice(0, 1).map((image_url) => ({ image_url }))),
        );
      }

      if (createRes.status < 200 || createRes.status >= 300) {
        const errText = createRes.body;
        console.error("eBay create error:", createRes.status, errText);

        if (createRes.status === 401 || createRes.status === 403) {
          throw new Error("eBay authentication failed. Your credentials may be invalid.");
        }
        throw new Error(`eBay create failed: ${createRes.status} — ${errText.slice(0, 200)}`);
      }

      // Step 2: Create an offer
      const price = parsePrice(listing.price);

      // Ensure a default inventory location exists
      const locationKey = "default-location";
      const locCheck = await ebayRequest(`${apiBase}/sell/inventory/v1/location/${locationKey}`, token, "GET");
      if (locCheck.status >= 300) {
        console.log("Creating default inventory location...");
        const locCreate = await ebayRequest(
          `${apiBase}/sell/inventory/v1/location/${locationKey}`, token, "POST", {
            location: {
              address: {
                addressLine1: "123 Main St",
                city: "New York",
                stateOrProvince: "NY",
                postalCode: "10001",
                country: "US",
              },
            },
            merchantLocationStatus: "ENABLED",
            name: "Default Location",
            locationTypes: ["WAREHOUSE"],
          }
        );
        console.log("Location create:", locCreate.status, locCreate.body);
      }

      // Fetch seller's business policies
      const policies = await fetchPolicies(apiBase, token, marketplaceId);
      console.log("Fetched policies:", JSON.stringify(policies));

      const offerPayload: Record<string, unknown> = {
        sku,
        marketplaceId,
        format: "FIXED_PRICE",
        availableQuantity: 999,
        categoryId: "15687", // Men's Clothing > Shirts > T-Shirts
        listingDescription: description,
        pricingSummary: {
          price: {
            value: price,
            currency: "USD",
          },
        },
        listingPolicies: {} as Record<string, string>,
      };
      offerPayload.merchantLocationKey = locationKey;

      // Add policies if available
      const listingPolicies: Record<string, string> = {};
      if (policies.fulfillmentPolicyId) listingPolicies.fulfillmentPolicyId = policies.fulfillmentPolicyId;
      if (policies.paymentPolicyId) listingPolicies.paymentPolicyId = policies.paymentPolicyId;
      if (policies.returnPolicyId) listingPolicies.returnPolicyId = policies.returnPolicyId;
      if (Object.keys(listingPolicies).length > 0) {
        offerPayload.listingPolicies = listingPolicies;
      }

      const existingOffer = await findOfferForSku(apiBase, token, sku, marketplaceId);
      const offerRes = existingOffer?.offerId
        ? await ebayRequest(`${apiBase}/sell/inventory/v1/offer/${existingOffer.offerId}`, token, "PUT", offerPayload)
        : await ebayRequest(`${apiBase}/sell/inventory/v1/offer`, token, "POST", offerPayload);
      console.log("Offer response:", offerRes.status, offerRes.body);

      if (offerRes.status < 200 || offerRes.status >= 300) {
        console.error("eBay offer error:", offerRes.status, offerRes.body);
        return new Response(JSON.stringify({
          success: false,
          error: `eBay offer failed: ${offerRes.body.slice(0, 500)}`,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const offerData = safeJson(offerRes.body);
      const offerId = offerData.offerId || existingOffer?.offerId;

      if (!offerId) {
        return new Response(JSON.stringify({
          success: false,
          error: "eBay offer created but no offerId returned.",
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Step 3: Publish the offer
      let publishRes = { status: 0, body: "" };
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await sleep(2000);
        publishRes = await ebayRequest(
          `${apiBase}/sell/inventory/v1/offer/${offerId}/publish`,
          token,
          "POST",
          {},
        );
        console.log(`Publish attempt ${attempt + 1}:`, publishRes.status, publishRes.body);
        if (publishRes.status >= 200 && publishRes.status < 300) break;
      }

      if (publishRes.status < 200 || publishRes.status >= 300) {
        console.error("eBay publish error:", publishRes.status, publishRes.body);
        return new Response(JSON.stringify({
          success: false,
          error: `eBay publish failed: ${publishRes.body.slice(0, 500)}`,
          item_id: sku,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const publishData = safeJson(publishRes.body);
      const listingId = publishData.listingId;

      if (!listingId) {
        console.error("eBay publish missing listingId:", publishRes.body);
        return new Response(JSON.stringify({
          success: false,
          error: `eBay published response did not include a listing ID: ${publishRes.body.slice(0, 500)}`,
          item_id: sku,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await sb.from("products").update({ ebay_listing_id: String(listingId) } as any).eq("id", productId);

      return new Response(JSON.stringify({
        success: true,
        item_id: sku,
        listing_id: listingId,
        action: "published",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("push-to-ebay error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
