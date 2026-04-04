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
      // Basic darkness check
      if (r >= tolerance || g >= tolerance || b >= tolerance) return false;
      // Protect dark pixels with meaningful chrominance (nebula edges, glows)
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      if (sat > 0.08 && max > 5) return false;
      return true;
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
  cleanCheckerboardArtifacts(pixels, width, height, totalPixels);

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

  // 1. Check if the OUTER BORDER is already mostly transparent → return as-is
  // (Don't use global transparency — designs with watercolor/splash art have internal
  //  transparency but still need their rectangular background stripped.)
  if (hasMostlyTransparentBorder(pixels, width, height)) {
    console.log("[smartRemoveBackground] Border already transparent, skipping removal");
    return canvasToPngBase64(canvas);
  }

  // 2. Sample edge pixels to detect dominant background color
  const edgeColor = sampleEdgeColorFromPixels(pixels, width, height);
  if (edgeColor) {
    console.log(`[smartRemoveBackground] Detected edge bg color: rgb(${edgeColor.r},${edgeColor.g},${edgeColor.b})`);
    // Flood-fill from edges using detected color.
    // For dark backgrounds, also check chrominance: preserve dark pixels
    // that have meaningful color (e.g. dark purple nebula edges).
    const tolerance = 35;
    const edgeLuma = (edgeColor.r + edgeColor.g + edgeColor.b) / 3;
    const isDarkBg = edgeLuma < 50;

    const isBackground = (idx: number): boolean => {
      const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
      if (
        Math.abs(r - edgeColor.r) >= tolerance ||
        Math.abs(g - edgeColor.g) >= tolerance ||
        Math.abs(b - edgeColor.b) >= tolerance
      ) return false;

      // For dark backgrounds, protect pixels with meaningful color/saturation
      if (isDarkBg) {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        // If the pixel has noticeable chroma, it's likely part of artwork
        if (sat > 0.08 && max > 5) return false;
      }

      return true;
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

/**
 * Check if the outermost border of an image is already mostly transparent.
 * This prevents skipping bg removal for designs that have internal transparency
 * (e.g. watercolor splashes) but still have an opaque rectangular background.
 */
function hasMostlyTransparentBorder(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): boolean {
  let total = 0;
  let transparent = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 120));

  for (let x = 0; x < width; x += step) {
    const topIdx = x * 4 + 3;
    const botIdx = ((height - 1) * width + x) * 4 + 3;
    total += 2;
    if (pixels[topIdx] < 20) transparent++;
    if (pixels[botIdx] < 20) transparent++;
  }
  for (let y = 1; y < height - 1; y += step) {
    const leftIdx = (y * width) * 4 + 3;
    const rightIdx = (y * width + width - 1) * 4 + 3;
    total += 2;
    if (pixels[leftIdx] < 20) transparent++;
    if (pixels[rightIdx] < 20) transparent++;
  }

  if (total === 0) return false;
  return transparent / total > 0.65;
}

function cleanCheckerboardArtifacts(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  totalPixels: number,
) {
  // Phase 1: Detect large checkerboard regions (alternating white + gray squares).
  // The AI sometimes renders a transparency grid instead of a solid background.
  // We detect this by looking for a regular alternating pattern of white-ish and
  // gray-ish pixels along rows. If a significant contiguous region matches,
  // we mark the entire region transparent.
  const isWhitish = (idx: number) => {
    const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
    return pixels[idx + 3] > 200 && r > 240 && g > 240 && b > 240;
  };
  const isCheckerGray = (idx: number) => {
    const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
    return pixels[idx + 3] > 200 && Math.abs(r - g) < 8 && Math.abs(g - b) < 8 && r > 170 && r < 225;
  };

  // Detect checkerboard square size by scanning top rows for alternating runs
  let detectedSquareSize = 0;
  for (let testSize = 4; testSize <= 32; testSize *= 2) {
    let matchCount = 0;
    const sampleRows = Math.min(height, testSize * 4);
    for (let y = 0; y < sampleRows; y++) {
      for (let x = 0; x < width - testSize * 2; x += testSize) {
        const idx1 = (y * width + x) * 4;
        const idx2 = (y * width + x + testSize) * 4;
        const cell1White = isWhitish(idx1);
        const cell1Gray = isCheckerGray(idx1);
        const cell2White = isWhitish(idx2);
        const cell2Gray = isCheckerGray(idx2);
        if ((cell1White && cell2Gray) || (cell1Gray && cell2White)) {
          matchCount++;
        }
      }
    }
    const possiblePairs = (sampleRows * Math.floor(width / testSize / 2));
    if (possiblePairs > 0 && matchCount / possiblePairs > 0.4) {
      detectedSquareSize = testSize;
      break;
    }
  }

  if (detectedSquareSize > 0) {
    console.log(`[cleanCheckerboard] Detected checkerboard grid with ~${detectedSquareSize}px squares`);
    // Mark all pixels that are part of the checkerboard pattern as transparent.
    // A pixel is "checkerboard" if it's white-ish or checker-gray, and the pixel
    // one square-size away horizontally is the opposite color.
    const marked = new Uint8Array(totalPixels);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const idx = i * 4;
        if (pixels[idx + 3] === 0) continue;
        const w = isWhitish(idx);
        const g = isCheckerGray(idx);
        if (!w && !g) continue;
        // Check neighbor one square-size away
        const nx = x + detectedSquareSize;
        if (nx < width) {
          const nIdx = (y * width + nx) * 4;
          if ((w && isCheckerGray(nIdx)) || (g && isWhitish(nIdx))) {
            marked[i] = 1;
          }
        }
        const px = x - detectedSquareSize;
        if (px >= 0) {
          const pIdx = (y * width + px) * 4;
          if ((w && isCheckerGray(pIdx)) || (g && isWhitish(pIdx))) {
            marked[i] = 1;
          }
        }
      }
    }
    let checkerRemoved = 0;
    for (let i = 0; i < totalPixels; i++) {
      if (marked[i]) {
        pixels[i * 4 + 3] = 0;
        checkerRemoved++;
      }
    }
    if (checkerRemoved > 0) {
      console.log(`[cleanCheckerboard] Removed ${checkerRemoved} checkerboard pixels (${((checkerRemoved / totalPixels) * 100).toFixed(1)}%)`);
    }
  }

  // Phase 2: Clean up remaining isolated gray pixels near transparent areas
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
 * Detect whether a transparent design image contains multiple distinct colors
 * (i.e. an imported multi-color design vs a monochrome AI-generated one).
 * If true, the design should NOT be recolored for light garments — use as-is.
 */
export async function isMultiColorDesign(base64: string): Promise<boolean> {
  const analysis = await analyzeDesignColors(base64);
  const chromaRatio = analysis.opaqueCount > 0 ? analysis.chromaCount / analysis.opaqueCount : 0;
  const accentRatio = analysis.opaqueCount > 0 ? analysis.accentPixelCount / analysis.opaqueCount : 0;

  return (
    (analysis.hueBuckets.size >= 3 && chromaRatio > 0.04) ||
    (analysis.accentPixelCount >= 36 && accentRatio > 0.003)
  );
}

export async function hasMeaningfulAccentColors(base64: string): Promise<boolean> {
  const analysis = await analyzeDesignColors(base64);
  const accentRatio = analysis.opaqueCount > 0 ? analysis.accentPixelCount / analysis.opaqueCount : 0;

  return analysis.accentPixelCount >= 36 && accentRatio > 0.003;
}

async function analyzeDesignColors(base64: string) {
  const src = base64.startsWith("data:image/") ? base64 : `data:image/png;base64,${base64}`;
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      opaqueCount: 0,
      chromaCount: 0,
      accentPixelCount: 0,
      hueBuckets: new Set<number>(),
    };
  }
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Collect unique hue buckets from opaque pixels (bucket by 30° slices = 12 buckets)
  const hueBuckets = new Set<number>();
  let opaqueCount = 0;
  let chromaCount = 0; // pixels with meaningful saturation
  let accentPixelCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    if (alpha < 0.12) continue; // skip transparent
    opaqueCount++;
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const delta = max - min;
    const sat = max === 0 ? 0 : delta / max;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    if (delta < 0.12 || sat < 0.12) continue; // near-gray, skip

    chromaCount++;
    let hue = 0;
    if (delta > 0) {
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      hue = Math.round(((hue * 60 + 360) % 360) / 30); // 12 buckets
    }
    hueBuckets.add(hue);

    if (alpha >= 0.35 && sat > 0.22 && delta > 0.18 && luma > 0.12 && luma < 0.95) {
      accentPixelCount++;
    }
  }

  return { opaqueCount, chromaCount, accentPixelCount, hueBuckets };
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

/**
 * Selectively darken bright/near-white pixels in a multi-color design
 * to create a contrast-safe variant for light garments.
 * Preserves chromatic (colored) pixels — only darkens near-neutral bright pixels.
 */
export async function darkenBrightPixels(
  sourceImage: string,
  targetLuma = 24,
): Promise<string> {
  const normalizedSource = sourceImage.startsWith("data:image/")
    ? sourceImage
    : `data:image/png;base64,${sourceImage.replace(/^data:image\/[^;]+;base64,/, "")}`;
  const img = await loadImage(normalizedSource);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  const sourcePixels = new Uint8ClampedArray(d);

  const countDenseOpaqueNeighbors = (pixelIndex: number) => {
    const x = (pixelIndex / 4) % canvas.width;
    const y = Math.floor(pixelIndex / 4 / canvas.width);
    let count = 0;

    for (let ny = Math.max(0, y - 2); ny <= Math.min(canvas.height - 1, y + 2); ny++) {
      for (let nx = Math.max(0, x - 2); nx <= Math.min(canvas.width - 1, x + 2); nx++) {
        if (nx === x && ny === y) continue;
        const neighborIdx = (ny * canvas.width + nx) * 4;
        if (sourcePixels[neighborIdx + 3] >= 120) count++;
      }
    }

    return count;
  };

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 30) continue; // skip transparent

    const alpha = d[i + 3] / 255;
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = max === 0 ? 0 : (max - min) / max;

    // Only darken near-neutral bright pixels (low saturation, high luminance)
    if (sat < 0.15 && luma > 0.55) {
      // Aggressively darken very bright near-whites
      const darkFactor = luma > 0.82 ? targetLuma / 255 : Math.max(0.15, 1 - luma);
      d[i] = Math.round(d[i] * darkFactor);
      d[i + 1] = Math.round(d[i + 1] * darkFactor);
      d[i + 2] = Math.round(d[i + 2] * darkFactor);

      // Boost alpha only for solid text/artwork — leave soft glows/sparkles at their natural alpha
      if (alpha >= 0.78) {
        d[i + 3] = Math.max(d[i + 3], 210);
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
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
