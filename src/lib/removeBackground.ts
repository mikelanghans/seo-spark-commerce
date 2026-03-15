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
 * Smart background removal for imported designs.
 * 1. If the image already has significant transparency (>5%), skip removal entirely.
 * 2. Auto-detects background color from edge pixels (handles any solid color, not just B/W).
 * 3. Falls back to standard white/black removal if edge detection fails.
 */
export async function smartRemoveBackground(imageUrl: string): Promise<string> {
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
  const totalPixels = width * height;

  // 1. Check if already has significant transparency → return as-is
  let transparentCount = 0;
  for (let i = 0; i < totalPixels; i++) {
    if (pixels[i * 4 + 3] < 250) transparentCount++;
  }
  if (transparentCount > totalPixels * 0.05) {
    console.log("[smartRemoveBackground] Image already has transparency, skipping removal");
    return canvasToPngBase64(canvas);
  }

  // 2. Sample edge pixels to detect dominant background color
  const edgeColor = sampleEdgeColorFromPixels(pixels, width, height);
  if (edgeColor) {
    console.log(`[smartRemoveBackground] Detected edge bg color: rgb(${edgeColor.r},${edgeColor.g},${edgeColor.b})`);
    // Flood-fill from edges using detected color
    const tolerance = 35;
    const isBackground = (idx: number): boolean => {
      return (
        Math.abs(pixels[idx] - edgeColor.r) < tolerance &&
        Math.abs(pixels[idx + 1] - edgeColor.g) < tolerance &&
        Math.abs(pixels[idx + 2] - edgeColor.b) < tolerance
      );
    };

    const visited = new Uint8Array(totalPixels);
    const queue: number[] = [];

    for (let x = 0; x < width; x++) {
      queue.push(x);
      queue.push((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y++) {
      queue.push(y * width);
      queue.push(y * width + (width - 1));
    }

    let head = 0;
    while (head < queue.length) {
      const pos = queue[head++];
      if (pos < 0 || pos >= totalPixels || visited[pos]) continue;
      if (!isBackground(pos * 4)) continue;
      visited[pos] = 1;
      const x = pos % width;
      const y = Math.floor(pos / width);
      if (x > 0) queue.push(pos - 1);
      if (x < width - 1) queue.push(pos + 1);
      if (y > 0) queue.push(pos - width);
      if (y < height - 1) queue.push(pos + width);
    }

    let removedCount = 0;
    for (let i = 0; i < totalPixels; i++) {
      if (visited[i]) {
        pixels[i * 4 + 3] = 0;
        removedCount++;
      }
    }

    // Clean up checkerboard artifacts
    cleanCheckerboardArtifacts(pixels, width, height, totalPixels);

    ctx.putImageData(imageData, 0, 0);
    console.log(`[smartRemoveBackground] Removed ${removedCount} bg pixels (${((removedCount / totalPixels) * 100).toFixed(1)}%)`);
    return canvasToPngBase64(canvas);
  }

  // 3. Fallback: try white, then black
  console.log("[smartRemoveBackground] Edge detection failed, falling back to white/black");
  try {
    return await removeBackground(imageUrl, "white");
  } catch {
    return await removeBackground(imageUrl, "black");
  }
}

function sampleEdgeColorFromPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): { r: number; g: number; b: number } | null {
  const samples: Array<{ r: number; g: number; b: number }> = [];
  const read = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    samples.push({ r: pixels[idx], g: pixels[idx + 1], b: pixels[idx + 2] });
  };

  for (let x = 0; x < width; x++) {
    read(x, 0);
    read(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    read(0, y);
    read(width - 1, y);
  }

  if (samples.length === 0) return null;

  const avg = samples.reduce(
    (acc, s) => ({ r: acc.r + s.r, g: acc.g + s.g, b: acc.b + s.b }),
    { r: 0, g: 0, b: 0 },
  );
  const r = Math.round(avg.r / samples.length);
  const g = Math.round(avg.g / samples.length);
  const b = Math.round(avg.b / samples.length);

  // Check edge uniformity — only proceed if edges are consistent
  const variance = samples.reduce((acc, s) => {
    const dr = s.r - r;
    const dg = s.g - g;
    const db = s.b - b;
    return acc + dr * dr + dg * dg + db * db;
  }, 0) / samples.length;

  if (variance > 2500) return null;
  return { r, g, b };
}

function cleanCheckerboardArtifacts(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  totalPixels: number,
) {
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    if (pixels[idx + 3] === 0) continue;
    const r = pixels[idx];
    const g = pixels[idx + 1];
    const b = pixels[idx + 2];
    const isGray = Math.abs(r - g) < 5 && Math.abs(g - b) < 5 && r > 180 && r < 220;
    if (!isGray) continue;
    const x = i % width;
    const y = Math.floor(i / width);
    let transparentNeighbors = 0;
    if (y > 0 && pixels[(i - width) * 4 + 3] === 0) transparentNeighbors++;
    if (y < height - 1 && pixels[(i + width) * 4 + 3] === 0) transparentNeighbors++;
    if (x > 0 && pixels[(i - 1) * 4 + 3] === 0) transparentNeighbors++;
    if (x < width - 1 && pixels[(i + 1) * 4 + 3] === 0) transparentNeighbors++;
    if (transparentNeighbors >= 2) pixels[idx + 3] = 0;
  }
}

/**
 * Recolor every non-transparent pixel to a single target color.
 * Useful for generating a clean dark-ink variant for light garments.
 * Accepts either a full data URL or raw base64 payload.
 */
export async function recolorOpaquePixels(
  sourceImage: string,
  targetColor: { r: number; g: number; b: number } = { r: 24, g: 24, b: 24 },
  options: { preserveAll?: boolean } = {},
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

  const ALPHA_THRESHOLD = 6;
  const MIN_COVERAGE = 0.08;
  const MIN_BRIGHTNESS = 0.25;
  const out = ctx.createImageData(w, h);
  const outData = out.data;

  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    const srcAlpha = src[idx + 3] / 255;
    if (srcAlpha * 255 < ALPHA_THRESHOLD) continue;

    if (options.preserveAll) {
      // For imported designs: recolor ALL non-transparent pixels,
      // preserving luminance gradients so shading/depth is visible
      const luma = (0.2126 * src[idx] + 0.7152 * src[idx + 1] + 0.0722 * src[idx + 2]) / 255;
      // Mix target color with luminance to preserve shading
      const shade = Math.max(0.15, luma); // floor so nothing disappears entirely
      outData[idx] = Math.round(targetColor.r * shade);
      outData[idx + 1] = Math.round(targetColor.g * shade);
      outData[idx + 2] = Math.round(targetColor.b * shade);
      outData[idx + 3] = src[idx + 3];
    } else {
      // For AI-generated designs: filter by luminance to skip background remnants
      const maxChannel = Math.max(src[idx], src[idx + 1], src[idx + 2]) / 255;
      if (maxChannel < MIN_BRIGHTNESS) continue;
      const coverage = srcAlpha * maxChannel;
      if (coverage < MIN_COVERAGE) continue;

      outData[idx] = targetColor.r;
      outData[idx + 1] = targetColor.g;
      outData[idx + 2] = targetColor.b;
      outData[idx + 3] = Math.round(Math.min(1, coverage) * 255);
    }
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
