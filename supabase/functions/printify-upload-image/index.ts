import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode, encode } from "https://deno.land/x/pngs@0.1.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Remove a solid background color from a PNG, replacing it with transparency.
 * Uses a flood-fill from edges approach to only remove the outer background,
 * preserving any same-colored elements inside the design.
 */
function removeBackground(
  imageData: Uint8Array,
  bgColor: "black" | "white",
  tolerance = 35,
): Uint8Array {
  const img = decode(imageData);
  const width = img.width;
  const height = img.height;
  const pixels = new Uint8Array(img.image);

  // Determine if a pixel matches the background color
  const isBackground = (idx: number): boolean => {
    const r = pixels[idx];
    const g = pixels[idx + 1];
    const b = pixels[idx + 2];
    if (bgColor === "white") {
      return r > 255 - tolerance && g > 255 - tolerance && b > 255 - tolerance;
    } else {
      return r < tolerance && g < tolerance && b < tolerance;
    }
  };

  // Flood-fill from all edge pixels to mark connected background
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  // Seed edges
  for (let x = 0; x < width; x++) {
    queue.push(x); // top row
    queue.push((height - 1) * width + x); // bottom row
  }
  for (let y = 1; y < height - 1; y++) {
    queue.push(y * width); // left col
    queue.push(y * width + (width - 1)); // right col
  }

  // BFS flood fill
  let head = 0;
  while (head < queue.length) {
    const pos = queue[head++];
    if (pos < 0 || pos >= width * height) continue;
    if (visited[pos]) continue;
    
    const pixelIdx = pos * 4;
    if (!isBackground(pixelIdx)) continue;
    
    visited[pos] = 1;
    
    const x = pos % width;
    const y = Math.floor(pos / width);
    if (x > 0) queue.push(pos - 1);
    if (x < width - 1) queue.push(pos + 1);
    if (y > 0) queue.push(pos - width);
    if (y < height - 1) queue.push(pos + width);
  }

  // Set visited background pixels to transparent
  for (let i = 0; i < width * height; i++) {
    if (visited[i]) {
      pixels[i * 4 + 3] = 0; // alpha = 0
    }
  }

  // Also handle checkerboard pattern pixels that might not be connected to edges
  // (gray pixels that are part of a checkerboard transparency pattern)
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const r = pixels[idx];
    const g = pixels[idx + 1];
    const b = pixels[idx + 2];
    const a = pixels[idx + 3];
    
    if (a === 0) continue; // already transparent
    
    // Detect checkerboard gray (~191,191,191 or ~204,204,204)
    const isCheckerboardGray = Math.abs(r - g) < 5 && Math.abs(g - b) < 5 && r > 180 && r < 220;
    
    if (isCheckerboardGray) {
      // Check if neighbors are background or transparent — if so, this is likely part of the pattern
      const x = i % width;
      const y = Math.floor(i / width);
      let transparentNeighbors = 0;
      const neighbors = [
        y > 0 ? i - width : -1,
        y < height - 1 ? i + width : -1,
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
      ];
      for (const n of neighbors) {
        if (n >= 0 && (visited[n] || pixels[n * 4 + 3] === 0)) {
          transparentNeighbors++;
        }
      }
      if (transparentNeighbors >= 2) {
        pixels[idx + 3] = 0;
      }
    }
  }

  return encode(pixels, width, height);
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

    const { imageUrl, fileName, removeBackgroundColor } = await req.json();
    if (!imageUrl) throw new Error("imageUrl is required");

    if (removeBackgroundColor === "black" || removeBackgroundColor === "white") {
      // Download image, remove background, upload as base64
      console.log(`Removing ${removeBackgroundColor} background from design...`);
      
      const imgResponse = await fetch(imageUrl);
      if (!imgResponse.ok) throw new Error(`Failed to download image: ${imgResponse.status}`);
      
      const imageBytes = new Uint8Array(await imgResponse.arrayBuffer());
      const transparentPng = removeBackground(imageBytes, removeBackgroundColor);
      
      console.log(`Background removed. Original: ${imageBytes.length} bytes, Transparent: ${transparentPng.length} bytes`);
      
      // Convert to base64 for Printify upload
      const base64 = btoa(String.fromCharCode(...transparentPng));
      
      const res = await fetch("https://api.printify.com/v1/uploads/images.json", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${printifyToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file_name: fileName || "design.png",
          contents: base64,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Printify upload error (${res.status}): ${text}`);
      }

      const image = await res.json();
      console.log(`Uploaded transparent design to Printify: ${image.id} (${image.width}x${image.height})`);

      return new Response(JSON.stringify({ image, trimmed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: upload via URL (no background removal)
    const res = await fetch("https://api.printify.com/v1/uploads/images.json", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${printifyToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file_name: fileName || "design.png",
        url: imageUrl,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Printify upload error (${res.status}): ${text}`);
    }

    const image = await res.json();

    return new Response(JSON.stringify({ image, trimmed: false }), {
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
