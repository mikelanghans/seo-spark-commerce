import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Trim transparent pixels from a PNG, returning cropped base64 */
async function trimTransparent(imageBytes: Uint8Array): Promise<{ base64: string; trimmed: boolean }> {
  try {
    const img = await Image.decode(imageBytes);
    const w = img.width;
    const h = img.height;

    // Find bounding box of non-transparent pixels (alpha > 10)
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const pixel = img.getPixelAt(x + 1, y + 1); // 1-indexed
        const alpha = pixel & 0xFF;
        if (alpha > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX <= minX || maxY <= minY) {
      console.log("No content found or image is fully transparent");
      const raw = await img.encode();
      return { base64: btoa(String.fromCharCode(...raw)), trimmed: false };
    }

    // Add 5% padding around content
    const contentW = maxX - minX + 1;
    const contentH = maxY - minY + 1;
    const padX = Math.round(contentW * 0.05);
    const padY = Math.round(contentH * 0.05);
    
    const cropX = Math.max(0, minX - padX);
    const cropY = Math.max(0, minY - padY);
    const cropW = Math.min(w - cropX, contentW + padX * 2);
    const cropH = Math.min(h - cropY, contentH + padY * 2);

    console.log(`Original: ${w}x${h}, Content bounds: (${minX},${minY})-(${maxX},${maxY}), Cropped: ${cropW}x${cropH}`);

    const cropped = img.crop(cropX + 1, cropY + 1, cropW, cropH); // 1-indexed
    const encoded = await cropped.encode();
    
    // Convert to base64
    let binary = "";
    for (let i = 0; i < encoded.length; i++) {
      binary += String.fromCharCode(encoded[i]);
    }
    
    return { base64: btoa(binary), trimmed: true };
  } catch (err) {
    console.error("Trim failed, uploading original:", err);
    return { base64: "", trimmed: false };
  }
}

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

    const { imageUrl, fileName } = await req.json();
    if (!imageUrl) throw new Error("imageUrl is required");

    // Fetch the image and auto-trim transparent pixels
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
    const imageBytes = new Uint8Array(await imgRes.arrayBuffer());

    const { base64, trimmed } = await trimTransparent(imageBytes);

    let uploadBody: any;
    if (trimmed && base64) {
      console.log("Uploading trimmed image as base64");
      uploadBody = {
        file_name: fileName || "design.png",
        contents: base64,
      };
    } else {
      console.log("Uploading original image via URL");
      uploadBody = {
        file_name: fileName || "design.png",
        url: imageUrl,
      };
    }

    const res = await fetch("https://api.printify.com/v1/uploads/images.json", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${printifyToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(uploadBody),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Printify upload error (${res.status}): ${text}`);
    }

    const image = await res.json();

    return new Response(JSON.stringify({ image, trimmed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("printify-upload-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
