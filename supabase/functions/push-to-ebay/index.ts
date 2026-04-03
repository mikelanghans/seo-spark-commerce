import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import https from "node:https";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ebayRequest = async (url: string, token: string, method: string, payload?: unknown) => {
  const urlObj = new URL(url);
  const body = payload != null ? JSON.stringify(payload) : undefined;
  const headers: Record<string, string | number> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "Content-Language": "en-US",
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
    const { userId, productId, listing, images } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

    const { client_id, client_secret, environment, access_token, refresh_token } = conn;

    // Determine API base URL
    const isSandbox = environment === "sandbox";
    const apiBase = isSandbox
      ? "https://api.sandbox.ebay.com"
      : "https://api.ebay.com";

    // Get/refresh access token if needed
    let token = access_token;

    if (!token && client_id && client_secret) {
      // Get client credentials token (limited scope)
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
        body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
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
        token_expires_at: new Date(Date.now() + (tokenData.expires_in || 7200) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      } as any).eq("id", conn.id);
    }

    if (!token) {
      throw new Error("No eBay access token available. Please reconnect.");
    }

    // Get current product to check existing listing
    const { data: product } = await sb.from("products").select("ebay_listing_id").eq("id", productId).maybeSingle();
    const existingItemId = product?.ebay_listing_id;

    const description = (listing.description || "").replace(/[#*_]/g, "");
    const tags = (listing.tags || []).slice(0, 30);

    if (existingItemId) {
      // Revise existing listing
      const reviseRes = await ebayRequest(`${apiBase}/sell/inventory/v1/inventory_item/${existingItemId}`, token, "PUT", {
        product: {
          title: listing.title.slice(0, 80),
          description: `<p>${description}</p>`,
          aspects: {},
          imageUrls: images?.map((img: any) => img.image_url).filter(Boolean) || [],
        },
        condition: "NEW",
        availability: {
          shipToLocationAvailability: {
            quantity: 999,
          },
        },
      });

      if (reviseRes.status < 200 || reviseRes.status >= 300) {
        console.error("eBay revise error:", reviseRes.status, reviseRes.body);
        throw new Error(`eBay update failed: ${reviseRes.status}`);
      }

      return new Response(JSON.stringify({ success: true, item_id: existingItemId, action: "updated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Create new inventory item
      const sku = `BA-${productId.slice(0, 8)}-${Date.now()}`;

      const createRes = await ebayRequest(`${apiBase}/sell/inventory/v1/inventory_item/${sku}`, token, "PUT", {
        product: {
          title: listing.title.slice(0, 80),
          description: `<p>${description}</p>`,
          aspects: {},
          imageUrls: images?.map((img: any) => img.image_url).filter(Boolean) || [],
        },
        condition: "NEW",
        availability: {
          shipToLocationAvailability: {
            quantity: 999,
          },
        },
      });

      if (createRes.status < 200 || createRes.status >= 300) {
        const errText = createRes.body;
        console.error("eBay create error:", createRes.status, errText);

        if (createRes.status === 401 || createRes.status === 403) {
          throw new Error("eBay authentication failed. Your credentials may be invalid.");
        }
        throw new Error(`eBay create failed: ${createRes.status} — ${errText.slice(0, 200)}`);
      }

      // Save eBay item ID (SKU) back to product
      await sb.from("products").update({ ebay_listing_id: sku } as any).eq("id", productId);

      // Step 2: Create an offer
      const marketplaceId = isSandbox ? "EBAY_US" : "EBAY_US";
      const price = listing.price || "29.99";

      // Ensure a default inventory location exists
      const locationKey = "default-location";
      const locCheck = await ebayRequest(
        `${apiBase}/sell/inventory/v1/location/${locationKey}`,
        token,
        "GET",
      );
      if (locCheck.status === 404 || locCheck.status >= 400) {
        console.log("Creating default inventory location...");
        const locCreate = await ebayRequest(
          `${apiBase}/sell/inventory/v1/location/${locationKey}`,
          token,
          "PUT",
          {
            location: {
              address: {
                city: "New York",
                stateOrProvince: "NY",
                postalCode: "10001",
                country: "US",
              },
            },
            locationTypes: ["WAREHOUSE"],
            name: "Default Location",
            merchantLocationStatus: "ENABLED",
          },
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
        categoryId: "11450", // default: Clothing > T-Shirts
        listingDescription: `<p>${description}</p>`,
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

      const offerRes = await ebayRequest(`${apiBase}/sell/inventory/v1/offer`, token, "POST", offerPayload);
      console.log("Offer response:", offerRes.status, offerRes.body);

      if (offerRes.status < 200 || offerRes.status >= 300) {
        // Inventory item was created, but offer failed — still return partial success
        console.error("eBay offer error:", offerRes.status, offerRes.body);
        return new Response(JSON.stringify({
          success: true,
          item_id: sku,
          action: "created",
          warning: `Inventory item created but offer failed: ${offerRes.body.slice(0, 200)}`,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const offerData = JSON.parse(offerRes.body);
      const offerId = offerData.offerId;

      if (!offerId) {
        return new Response(JSON.stringify({
          success: true,
          item_id: sku,
          action: "created",
          warning: "Offer created but no offerId returned.",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Step 3: Publish the offer
      const publishRes = await ebayRequest(
        `${apiBase}/sell/inventory/v1/offer/${offerId}/publish`,
        token,
        "POST",
        {},
      );
      console.log("Publish response:", publishRes.status, publishRes.body);

      if (publishRes.status < 200 || publishRes.status >= 300) {
        console.error("eBay publish error:", publishRes.status, publishRes.body);
        return new Response(JSON.stringify({
          success: true,
          item_id: sku,
          action: "created",
          warning: `Offer created but publish failed: ${publishRes.body.slice(0, 200)}`,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const publishData = JSON.parse(publishRes.body);
      const listingId = publishData.listingId;

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
