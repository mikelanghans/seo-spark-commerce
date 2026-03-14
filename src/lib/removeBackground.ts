/**
 * Remove a solid background color from an image using Canvas API (client-side).
 * Uses flood-fill from edges to only remove the outer background.
 * Also detects and removes checkerboard transparency patterns.
 * 
 * Returns a base64 string (without data URL prefix) of the transparent PNG.
 */
export async function removeBackground(
  imageUrl: string,
  bgColor: "black" | "white",
  tolerance = 35,
): Promise<string> {
  // Load image
  const img = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const width = canvas.width;
  const height = canvas.height;

  // Check if a pixel matches the background color
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
  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);
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
    if (pos < 0 || pos >= totalPixels || visited[pos]) continue;

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
  for (let i = 0; i < totalPixels; i++) {
    if (visited[i]) {
      pixels[i * 4 + 3] = 0;
    }
  }

  // Also handle checkerboard pattern pixels
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    if (pixels[idx + 3] === 0) continue; // already transparent

    const r = pixels[idx];
    const g = pixels[idx + 1];
    const b = pixels[idx + 2];

    // Detect checkerboard gray (~191 or ~204)
    const isGray = Math.abs(r - g) < 5 && Math.abs(g - b) < 5 && r > 180 && r < 220;
    if (!isGray) continue;

    // Check if neighbors are transparent
    const x = i % width;
    const y = Math.floor(i / width);
    let transparentNeighbors = 0;
    if (y > 0 && pixels[(i - width) * 4 + 3] === 0) transparentNeighbors++;
    if (y < height - 1 && pixels[(i + width) * 4 + 3] === 0) transparentNeighbors++;
    if (x > 0 && pixels[(i - 1) * 4 + 3] === 0) transparentNeighbors++;
    if (x < width - 1 && pixels[(i + 1) * 4 + 3] === 0) transparentNeighbors++;

    if (transparentNeighbors >= 2) {
      pixels[idx + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvasToPngBase64(canvas);
}

/**
 * Recolor every non-transparent pixel to a single target color.
 * Useful for generating a clean dark-ink variant for light garments.
 * Accepts either a full data URL or raw base64 payload.
 */
export async function recolorOpaquePixels(
  sourceImage: string,
  targetColor: { r: number; g: number; b: number } = { r: 24, g: 24, b: 24 },
): Promise<string> {
  const normalizedSource = sourceImage.startsWith("data:image/")
    ? sourceImage
    : `data:image/png;base64,${sourceImage.replace(/^data:image\/[^;]+;base64,/, "")}`;
  const img = await loadImage(normalizedSource);
  const canvas = document.createElement("canvas");
  const w = img.width;
  const h = img.height;
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const src = imageData.data;

  // Build alpha mask from source
  const alphaMap = new Uint8Array(w * h);
  for (let i = 0; i < alphaMap.length; i++) {
    alphaMap[i] = src[i * 4 + 3];
  }

  // Step 1: Fill interior holes via flood-fill from edges.
  // Any transparent pixel NOT reachable from the image border is inside a letterform.
  const reachable = new Uint8Array(w * h); // 0 = not visited
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const enqueue = (idx: number) => {
    if (idx < 0 || idx >= w * h || reachable[idx]) return;
    if (alphaMap[idx] >= 5) return; // opaque = boundary, don't cross
    reachable[idx] = 1;
    queue[tail++] = idx;
  };

  // Seed from all edge pixels
  for (let x = 0; x < w; x++) {
    enqueue(x);
    enqueue((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    enqueue(y * w);
    enqueue(y * w + (w - 1));
  }

  while (head < tail) {
    const pos = queue[head++];
    const px = pos % w;
    const py = Math.floor(pos / w);
    if (px > 0) enqueue(pos - 1);
    if (px < w - 1) enqueue(pos + 1);
    if (py > 0) enqueue(pos - w);
    if (py < h - 1) enqueue(pos + w);
  }

  // Fill interior holes: transparent pixels not reachable from edges
  const filled = new Uint8Array(alphaMap);
  for (let i = 0; i < w * h; i++) {
    if (filled[i] < 5 && !reachable[i]) {
      filled[i] = 255; // interior hole → fill solid
    }
  }

  // Step 2: Dilate by 1px to thicken thin strokes
  const dilated = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (filled[idx] >= 5) {
        dilated[idx] = 255;
        continue;
      }
      // Check 8-connected neighbors
      let hasNeighbor = false;
      for (let dy = -1; dy <= 1 && !hasNeighbor; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1 && !hasNeighbor; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          if (filled[ny * w + nx] >= 30) hasNeighbor = true;
        }
      }
      if (hasNeighbor) dilated[idx] = 200;
    }
  }

  // Write recolored + dilated pixels
  const out = ctx.createImageData(w, h);
  const outData = out.data;
  for (let i = 0; i < dilated.length; i++) {
    const a = dilated[i];
    if (a === 0) continue;
    const idx = i * 4;
    outData[idx] = targetColor.r;
    outData[idx + 1] = targetColor.g;
    outData[idx + 2] = targetColor.b;
    outData[idx + 3] = a;
  }

  ctx.putImageData(out, 0, 0);
  return canvasToPngBase64(canvas);
}

/**
 * Upscale a base64 PNG (without data URL prefix) to a target width using canvas.
 * Maintains aspect ratio. Returns base64 string without data URL prefix.
 */
export async function upscaleBase64Png(
  base64Png: string,
  targetWidth = 4500,
): Promise<string> {
  const img = await loadImage(`data:image/png;base64,${base64Png}`);
  if (img.width >= targetWidth) return base64Png; // already large enough

  const scale = targetWidth / img.width;
  const targetHeight = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  return canvasToPngBase64(canvas);
}

function canvasToPngBase64(canvas: HTMLCanvasElement): string {
  const dataUrl = canvas.toDataURL("image/png");
  return dataUrl.replace(/^data:image\/png;base64,/, "");
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}
