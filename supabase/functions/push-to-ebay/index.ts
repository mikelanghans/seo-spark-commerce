import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import https from "node:https";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ebayInventoryPut = async (url: string, token: string, payload: unknown) => {
  const urlObj = new URL(url);
  const body = JSON.stringify(payload);

  return await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = https.request({
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      path: `${urlObj.pathname}${urlObj.search}`,
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Content-Language": "en-US",
      },
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
    req.write(body);
    req.end();
  });
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
      const reviseRes = await ebayInventoryPut(`${apiBase}/sell/inventory/v1/inventory_item/${existingItemId}`, token, {
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

      const createRes = await ebayInventoryPut(`${apiBase}/sell/inventory/v1/inventory_item/${sku}`, token, {
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

      return new Response(JSON.stringify({ success: true, item_id: sku, action: "created" }), {
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
