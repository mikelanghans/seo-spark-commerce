const MASK_DIFF_THRESHOLD = 16;
const MASK_LUMA_THRESHOLD = 10;
const MIN_MASK_COVERAGE = 0.01;
const MAX_PREPARED_DESIGN_DIM = 1800;
const PREPARED_DESIGN_CACHE_LIMIT = 8;
const preparedDesignCache = new Map<string, HTMLCanvasElement>();

interface PrepareDesignOptions {
  preserveFaintPixels?: boolean;
}

function getPreparedDesignCacheKey(designDataUrl: string, options: PrepareDesignOptions = {}) {
  return `${designDataUrl}::${options.preserveFaintPixels ? "preserve-faint" : "default"}`;
}

function cachePreparedDesign(cacheKey: string, canvas: HTMLCanvasElement) {
  if (preparedDesignCache.has(cacheKey)) {
    preparedDesignCache.delete(cacheKey);
  }
  preparedDesignCache.set(cacheKey, canvas);

  if (preparedDesignCache.size > PREPARED_DESIGN_CACHE_LIMIT) {
    const oldestKey = preparedDesignCache.keys().next().value;
    if (oldestKey) preparedDesignCache.delete(oldestKey);
  }
}

export interface DesignPlacement {
  scale: number;    // fraction of canvas width the design occupies
  offsetX: number;  // fraction of canvas width, 0 = centered
  offsetY: number;  // fraction of canvas height for the top of the design
}

interface CompositionLockParams {
  templateDataUrl: string;
  generatedDataUrl: string;
  targetWidth: number;
  targetHeight: number;
  /** Original design to paste back on top after AI recoloring (guarantees design integrity) */
  designDataUrl?: string;
  /** If true, adds a white underbase behind the design for visibility on dark garments */
  isDarkGarment?: boolean;
  /** Design style — text-only uses a smaller scale to avoid oversized text */
  designStyle?: string;
  /** Custom placement overrides from the user preview */
  placement?: DesignPlacement;
  /** Reference design dimensions to ensure consistent sizing across variants */
  referenceDesignSize?: { width: number; height: number };
  /** When true, recomposite the original design without thresholding/tight-cropping. */
  preserveOriginalDesignAlpha?: boolean;
}

export const ensureImageDataUrl = (value: string) =>
  value.startsWith("data:image") ? value : `data:image/png;base64,${value}`;

export async function getImageDimensionsFromDataUrl(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  const img = await loadImage(dataUrl);
  return {
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
  };
}

export async function normalizeAndLockToTemplateBlob({
  templateDataUrl,
  generatedDataUrl,
  targetWidth,
  targetHeight,
  designDataUrl,
  isDarkGarment,
  designStyle,
  placement,
  referenceDesignSize,
  preserveOriginalDesignAlpha,
}: CompositionLockParams): Promise<Blob> {
  const generatedImage = await loadImage(generatedDataUrl);

  // Resize/crop the AI output to match template dimensions.
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  drawCover(ctx, generatedImage, targetWidth, targetHeight);

  // Post-generation design recomposite:
  // Paste the ORIGINAL design back on top so AI can never alter text/graphics
  if (designDataUrl) {
    try {
      const preparedDesign = await getPreparedDesignCanvas(
        designDataUrl,
        preserveOriginalDesignAlpha ? { preserveFaintPixels: true } : undefined,
      );
      drawDesignWithUnderbase(
        ctx,
        preparedDesign,
        targetWidth,
        targetHeight,
        isDarkGarment,
        designStyle,
        placement,
        referenceDesignSize,
        preserveOriginalDesignAlpha,
      );
    } catch (err) {
      console.warn("Design recomposite failed, using AI output as-is:", err);
    }
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to convert composed image to blob"));
        return;
      }
      resolve(blob);
    }, "image/jpeg", 0.88);
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
) {
  const scale = Math.max(targetWidth / image.width, targetHeight / image.height);
  const drawWidth = Math.round(image.width * scale);
  const drawHeight = Math.round(image.height * scale);
  const dx = Math.round((targetWidth - drawWidth) / 2);
  const dy = Math.round((targetHeight - drawHeight) / 2);

  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
}
/**
 * Draw a design onto a canvas with optional white underbase for dark garments.
 * The underbase ensures dark design elements (text outlines, shadows) remain
 * visible on dark-colored garments — similar to DTG white ink underbase.
 */
function drawDesignWithUnderbase(
  ctx: CanvasRenderingContext2D,
  cleanedDesign: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number,
  isDarkGarment?: boolean,
  designStyle?: string,
  placement?: DesignPlacement,
  referenceDesignSize?: { width: number; height: number },
  preserveOriginalAppearance?: boolean,
) {
  // Use reference dimensions if provided for cross-variant consistency
  const designWidth = referenceDesignSize?.width ?? cleanedDesign.width;
  const designHeight = referenceDesignSize?.height ?? cleanedDesign.height;

  // Use custom placement if provided, otherwise use defaults
  const designScale = placement?.scale ?? (designStyle === "text-only" ? 0.28 : 0.36);
  const drawWidth = Math.round(targetWidth * designScale);
  const drawHeight = Math.round(drawWidth * (designHeight / designWidth));
  const dx = Math.round((targetWidth - drawWidth) / 2 + targetWidth * (placement?.offsetX ?? 0));
  const dy = Math.round(targetHeight * (placement?.offsetY ?? 0.20));

  // For dark garments, add a subtle white underbase behind the design
  // so dark outlines / shadows in the artwork remain visible on dark fabric.
  if (isDarkGarment && !preserveOriginalAppearance) {
    const designToDraw = enhanceDarkPixelsForDarkGarment(cleanedDesign);
    ctx.drawImage(designToDraw, dx, dy, drawWidth, drawHeight);
  } else {
    ctx.drawImage(cleanedDesign, dx, dy, drawWidth, drawHeight);
  }
}

function enhanceDarkPixelsForDarkGarment(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;

  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const w = canvas.width;
  const h = canvas.height;

  // Pre-compute a brightness map and identify which dark pixels are adjacent
  // to bright opaque pixels (i.e., actual design strokes vs trapped background).
  const totalPixels = w * h;
  const lumaMap = new Float32Array(totalPixels);
  const alphaMap = new Uint8Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    lumaMap[i] = (0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2]) / 255;
    alphaMap[i] = data[idx + 3];
  }

  // A dark pixel should only be enhanced if it neighbors a bright opaque pixel
  // (luma > 0.5, alpha > 128). This means it's a dark outline/stroke next to
  // visible design content, not a trapped background pixel inside a letter counter.
  const hasBrightNeighbor = (px: number): boolean => {
    const x = px % w;
    const y = Math.floor(px / w);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const ni = ny * w + nx;
        if (alphaMap[ni] > 128 && lumaMap[ni] > 0.5) return true;
      }
    }
    return false;
  };

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const alpha = data[idx + 3];
    if (alpha < 20) continue;

    const luma = lumaMap[i];
    if (luma >= 0.18) continue;

    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;

    if (saturation < 0.15 && hasBrightNeighbor(i)) {
      const lift = Math.min(1, (0.18 - luma) / 0.18);
      const blend = 0.5 * lift;
      data[idx] = Math.round(r * (1 - blend) + 200 * blend);
      data[idx + 1] = Math.round(g * (1 - blend) + 200 * blend);
      data[idx + 2] = Math.round(b * (1 - blend) + 200 * blend);
      data[idx + 3] = Math.max(alpha, Math.round(170 + 85 * lift));
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

function buildRawChangeMask(template: Uint8ClampedArray, generated: Uint8ClampedArray): Uint8Array {
  const totalPixels = template.length / 4;
  const mask = new Uint8Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const dr = Math.abs(template[idx] - generated[idx]);
    const dg = Math.abs(template[idx + 1] - generated[idx + 1]);
    const db = Math.abs(template[idx + 2] - generated[idx + 2]);

    const templateLuma = 0.2126 * template[idx] + 0.7152 * template[idx + 1] + 0.0722 * template[idx + 2];
    const generatedLuma = 0.2126 * generated[idx] + 0.7152 * generated[idx + 1] + 0.0722 * generated[idx + 2];

    const colorDiff = (dr + dg + db) / 3;
    const lumaDiff = Math.abs(templateLuma - generatedLuma);

    if (colorDiff >= MASK_DIFF_THRESHOLD || lumaDiff >= MASK_LUMA_THRESHOLD) {
      mask[i] = 255;
    }
  }

  return mask;
}

function removeEdgeConnectedChanges(mask: Uint8Array, width: number, height: number): Uint8Array {
  const totalPixels = width * height;
  const edgeConnected = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;

  const enqueue = (index: number) => {
    if (index < 0 || index >= totalPixels) return;
    if (mask[index] === 0 || edgeConnected[index]) return;
    edgeConnected[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(y * width);
    enqueue(y * width + (width - 1));
  }

  while (head < tail) {
    const current = queue[head++];
    const x = current % width;
    const y = Math.floor(current / width);

    if (x > 0) enqueue(current - 1);
    if (x < width - 1) enqueue(current + 1);
    if (y > 0) enqueue(current - width);
    if (y < height - 1) enqueue(current + width);
  }

  const result = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    result[i] = mask[i] > 0 && !edgeConnected[i] ? 255 : 0;
  }

  return result;
}

function blurMask(mask: Uint8Array, width: number, height: number, passes = 1): Uint8Array {
  let current = Float32Array.from(mask, (value) => value);
  const totalPixels = width * height;

  for (let pass = 0; pass < passes; pass++) {
    const next = new Float32Array(totalPixels);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;

        for (let ky = -1; ky <= 1; ky++) {
          const ny = y + ky;
          if (ny < 0 || ny >= height) continue;

          for (let kx = -1; kx <= 1; kx++) {
            const nx = x + kx;
            if (nx < 0 || nx >= width) continue;

            sum += current[ny * width + nx];
            count++;
          }
        }

        next[y * width + x] = count > 0 ? sum / count : 0;
      }
    }

    current = next;
  }

  const result = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    result[i] = current[i] < 20 ? 0 : Math.min(255, Math.round(current[i]));
  }

  return result;
}

function compositeFromMask(
  template: Uint8ClampedArray,
  generated: Uint8ClampedArray,
  mask: Uint8Array,
  output: Uint8ClampedArray,
) {
  const totalPixels = mask.length;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const alpha = mask[i] / 255;

    output[idx] = Math.round(template[idx] * (1 - alpha) + generated[idx] * alpha);
    output[idx + 1] = Math.round(template[idx + 1] * (1 - alpha) + generated[idx + 1] * alpha);
    output[idx + 2] = Math.round(template[idx + 2] * (1 - alpha) + generated[idx + 2] * alpha);
    output[idx + 3] = 255;
  }
}

function countMaskCoverage(mask: Uint8Array): number {
  let covered = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > 0) covered++;
  }
  return covered / mask.length;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}

async function loadImageToCanvas(src: string): Promise<HTMLCanvasElement> {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Compute the prepared (tight-cropped) dimensions of a design image.
 * Used to establish a consistent reference size across light/dark variants.
 */
export async function getPreparedDesignCanvas(
  designDataUrl: string,
  options: PrepareDesignOptions = {},
): Promise<HTMLCanvasElement> {
  const cacheKey = getPreparedDesignCacheKey(designDataUrl, options);
  const cached = preparedDesignCache.get(cacheKey);
  if (cached) {
    cachePreparedDesign(cacheKey, cached);
    return cached;
  }

  const img = await loadImage(designDataUrl);
  const cleaned = stripSolidEdgeBackground(img);
  const prepared = prepareDesignForCompositing(cleaned, options);
  cachePreparedDesign(cacheKey, prepared);
  return prepared;
}

export async function getPreparedDesignSize(
  designDataUrl: string,
  options: PrepareDesignOptions = {},
): Promise<{ width: number; height: number }> {
  const prepared = await getPreparedDesignCanvas(designDataUrl, options);
  return { width: prepared.width, height: prepared.height };
}

export async function getPreparedDesignDataUrl(
  designDataUrl: string,
  options: PrepareDesignOptions = {},
): Promise<string> {
  const prepared = await getPreparedDesignCanvas(designDataUrl, options);
  return prepared.toDataURL("image/png");
}

/**
 * Compute a unified reference size from multiple design variants.
 * Uses the maximum bounding box so all variants render at the same visual scale.
 */
export async function getUnifiedDesignSize(
  designDataUrls: (string | undefined)[],
  options: PrepareDesignOptions = {},
): Promise<{ width: number; height: number } | undefined> {
  const urls = designDataUrls.filter(Boolean) as string[];
  if (urls.length === 0) return undefined;

  const sizes = await Promise.all(urls.map((url) => getPreparedDesignSize(url, options)));
  return {
    width: Math.max(...sizes.map((size) => size.width)),
    height: Math.max(...sizes.map((size) => size.height)),
  };
}

export async function compositeDesignOntoTemplate(
  templateDataUrl: string,
  designDataUrl: string,
  isDarkGarment?: boolean,
  designStyle?: string,
  placement?: DesignPlacement,
): Promise<string> {
  const [templateImg, preparedDesignCanvas] = await Promise.all([
    loadImage(templateDataUrl),
    getPreparedDesignCanvas(designDataUrl),
  ]);

  const w = templateImg.naturalWidth || templateImg.width;
  const h = templateImg.naturalHeight || templateImg.height;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.drawImage(templateImg, 0, 0, w, h);
  drawDesignWithUnderbase(ctx, preparedDesignCanvas, w, h, isDarkGarment, designStyle, placement);

  return canvas.toDataURL("image/png");
}

/**
 * Downscale an image data URL to fit within maxDim and compress as JPEG.
 * This keeps payloads under edge function memory limits.
 */
export async function compressForEdgeFunction(
  dataUrl: string,
  maxDim = 1024,
  quality = 0.8,
): Promise<string> {
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const nw = Math.round(w * scale);
  const nh = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = nw;
  canvas.height = nh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.drawImage(img, 0, 0, nw, nh);
  return canvas.toDataURL("image/jpeg", quality);
}

function stripSolidEdgeBackground(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  // Skip stripping when the OUTER border is already mostly transparent —
  // this means the design is already a proper transparent PNG. Stripping
  // would risk removing design elements that happen to match the "background" color.
  if (hasTransparentBorder(data, canvas.width, canvas.height)) {
    console.log("[stripSolidEdgeBackground] Border already transparent — skipping (design is a clean PNG)");
    return canvas;
  }

  // Strategy 1: Try full-edge sampling (works for solid bg designs).
  // Use a conservative tolerance to avoid eating into design content.
  const edge = sampleEdgeColor(data, canvas.width, canvas.height);
  if (edge) {
    return floodFillBackground(canvas, ctx, imgData, data, edge, 30);
  }

  // Strategy 2: Corner sampling
  const cornerEdge = sampleCornerColor(data, canvas.width, canvas.height);
  if (cornerEdge) {
    return floodFillBackground(canvas, ctx, imgData, data, cornerEdge, 36);
  }

  // Strategy 3: outermost 2-pixel border
  const borderEdge = sampleThinBorderColor(data, canvas.width, canvas.height);
  if (borderEdge) {
    return floodFillBackground(canvas, ctx, imgData, data, borderEdge, 40);
  }

  return canvas;
}

function hasTransparentBorder(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): boolean {
  let total = 0;
  let transparent = 0;

  const sample = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = (y * width + x) * 4 + 3;
    total++;
    if (data[idx] < 20) transparent++;
  };

  const step = Math.max(1, Math.floor(Math.min(width, height) / 120));

  for (let x = 0; x < width; x += step) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    sample(0, y);
    sample(width - 1, y);
  }

  if (total === 0) return false;
  return transparent / total > 0.65;
}

function downscaleCanvasIfNeeded(
  source: HTMLCanvasElement,
  maxDim = MAX_PREPARED_DESIGN_DIM,
): HTMLCanvasElement {
  const largestSide = Math.max(source.width, source.height);
  if (largestSide <= maxDim) return source;

  const scale = maxDim / largestSide;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) return source;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function prepareDesignForCompositing(source: HTMLCanvasElement, options: PrepareDesignOptions = {}): HTMLCanvasElement {
  const srcCtx = source.getContext("2d");
  if (!srcCtx) return source;

  const srcImage = srcCtx.getImageData(0, 0, source.width, source.height);
  const srcData = srcImage.data;
  const ALPHA_KEEP_THRESHOLD = options.preserveFaintPixels ? 1 : 10;

  // 0) Clean checkerboard transparency patterns (AI-rendered grids).
  cleanCheckerboardInCompositing(srcData, source.width, source.height);

  // 1) Drop ultra-faint alpha haze that creates square/box artifacts.
  for (let i = 0; i < srcData.length; i += 4) {
    if (srcData[i + 3] < ALPHA_KEEP_THRESHOLD) srcData[i + 3] = 0;
  }

  // 2) Tight-crop to visible pixels after thresholding.
  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const idx = (y * source.width + x) * 4;
      if (srcData[idx + 3] === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  // If nothing left, return original source to avoid hard failure.
  if (maxX < minX || maxY < minY) {
    return downscaleCanvasIfNeeded(source);
  }

  const pad = options.preserveFaintPixels ? 10 : 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(source.width - 1, maxX + pad);
  maxY = Math.min(source.height - 1, maxY + pad);

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;

  const cropped = document.createElement("canvas");
  cropped.width = cw;
  cropped.height = ch;
  const cctx = cropped.getContext("2d");
  if (!cctx) return source;

  // Apply thresholded alpha to a temp canvas before cropping.
  const temp = document.createElement("canvas");
  temp.width = source.width;
  temp.height = source.height;
  const tctx = temp.getContext("2d");
  if (!tctx) return source;
  tctx.putImageData(srcImage, 0, 0);

  cctx.drawImage(temp, minX, minY, cw, ch, 0, 0, cw, ch);
  return downscaleCanvasIfNeeded(cropped);
}

/**
 * Detect and remove checkerboard transparency patterns from design pixels.
 * Mirrors the logic in removeBackground.ts but runs inline on pixel data.
 */
function cleanCheckerboardInCompositing(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const totalPixels = width * height;

  const isWhitish = (idx: number) => {
    const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
    return pixels[idx + 3] > 200 && r > 240 && g > 240 && b > 240;
  };
  const isCheckerGray = (idx: number) => {
    const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
    return pixels[idx + 3] > 200 && Math.abs(r - g) < 8 && Math.abs(g - b) < 8 && r > 170 && r < 225;
  };
  /**
   * Check whether a pixel has meaningful color contrast — protect design
   * elements (colored text, tinted graphics) from being cleaned.
   */
  const hasDesignContrast = (idx: number) => {
    const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // If there's meaningful chrominance, this is design content, not checkerboard
    return (max - min) > 20;
  };

  let detectedSquareSize = 0;
  for (let testSize = 4; testSize <= 32; testSize *= 2) {
    let matchCount = 0;
    const sampleRows = Math.min(height, testSize * 4);
    for (let y = 0; y < sampleRows; y++) {
      for (let x = 0; x < width - testSize * 2; x += testSize) {
        const idx1 = (y * width + x) * 4;
        const idx2 = (y * width + x + testSize) * 4;
        const c1W = isWhitish(idx1), c1G = isCheckerGray(idx1);
        const c2W = isWhitish(idx2), c2G = isCheckerGray(idx2);
        if ((c1W && c2G) || (c1G && c2W)) matchCount++;
      }
    }
    const possiblePairs = sampleRows * Math.floor(width / testSize / 2);
    if (possiblePairs > 0 && matchCount / possiblePairs > 0.4) {
      detectedSquareSize = testSize;
      break;
    }
  }

  // Require a fairly strong signal — avoid false positives on designs with gray tones
  if (detectedSquareSize === 0) return;

  console.log(`[compositing] Detected checkerboard ~${detectedSquareSize}px squares, cleaning`);
  const marked = new Uint8Array(totalPixels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const idx = i * 4;
      if (pixels[idx + 3] === 0) continue;
      // Protect pixels with meaningful color — they're design content
      if (hasDesignContrast(idx)) continue;
      const w = isWhitish(idx), g = isCheckerGray(idx);
      if (!w && !g) continue;
      const nx = x + detectedSquareSize;
      if (nx < width) {
        const nIdx = (y * width + nx) * 4;
        if ((w && isCheckerGray(nIdx)) || (g && isWhitish(nIdx))) marked[i] = 1;
      }
      const px = x - detectedSquareSize;
      if (px >= 0) {
        const pIdx = (y * width + px) * 4;
        if ((w && isCheckerGray(pIdx)) || (g && isWhitish(pIdx))) marked[i] = 1;
      }
    }
  }
  for (let i = 0; i < totalPixels; i++) {
    if (marked[i]) pixels[i * 4 + 3] = 0;
  }

  // Clean isolated gray pixels near transparent areas
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    if (pixels[idx + 3] === 0) continue;
    const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
    const isGray = Math.abs(r - g) < 5 && Math.abs(g - b) < 5 && r > 180 && r < 220;
    if (!isGray) continue;
    const x = i % width, y = Math.floor(i / width);
    let tn = 0;
    if (y > 0 && pixels[(i - width) * 4 + 3] === 0) tn++;
    if (y < height - 1 && pixels[(i + width) * 4 + 3] === 0) tn++;
    if (x > 0 && pixels[(i - 1) * 4 + 3] === 0) tn++;
    if (x < width - 1 && pixels[(i + 1) * 4 + 3] === 0) tn++;
    if (tn >= 2) pixels[idx + 3] = 0;
  }
}

function floodFillBackground(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  imgData: ImageData,
  data: Uint8ClampedArray,
  edge: { r: number; g: number; b: number },
  tolerance: number,
): HTMLCanvasElement {
  const totalPixels = canvas.width * canvas.height;
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;

  const enqueue = (idx: number) => {
    if (idx < 0 || idx >= totalPixels || visited[idx]) return;
    visited[idx] = 1;
    queue[tail++] = idx;
  };

  for (let x = 0; x < canvas.width; x++) {
    enqueue(x);
    enqueue((canvas.height - 1) * canvas.width + x);
  }
  for (let y = 1; y < canvas.height - 1; y++) {
    enqueue(y * canvas.width);
    enqueue(y * canvas.width + (canvas.width - 1));
  }

  const edgeLuma = (edge.r + edge.g + edge.b) / 3;
  const isDarkBg = edgeLuma < 50;

  while (head < tail) {
    const pos = queue[head++];
    const p = pos * 4;

    const r = data[p], g = data[p + 1], b = data[p + 2];
    const dr = Math.abs(r - edge.r);
    const dg = Math.abs(g - edge.g);
    const db = Math.abs(b - edge.b);

    if (dr > tolerance || dg > tolerance || db > tolerance) continue;

    // Protect dark pixels with meaningful chrominance (e.g. dark nebula edges)
    if (isDarkBg) {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      if (sat > 0.08 && max > 5) continue;
    }

    data[p + 3] = 0;

    const x = pos % canvas.width;
    const y = Math.floor(pos / canvas.width);
    if (x > 0) enqueue(pos - 1);
    if (x < canvas.width - 1) enqueue(pos + 1);
    if (y > 0) enqueue(pos - canvas.width);
    if (y < canvas.height - 1) enqueue(pos + canvas.width);
  }

  // Second pass: clear enclosed background regions (letter counters in R, A, O, B, D, P, etc.)
  // These are interior regions that match the background color but aren't connected to edges.
  clearEnclosedBackgroundRegions(data, canvas.width, canvas.height, edge, tolerance);

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * After edge-connected flood fill, find and clear remaining interior regions
 * that match the background color but are fully enclosed by design pixels
 * (e.g., the holes/counters inside letters like R, A, O, B, D, P).
 */
function clearEnclosedBackgroundRegions(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  edge: { r: number; g: number; b: number },
  tolerance: number,
) {
  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);

  // Mark already-transparent pixels as visited (they were cleared by flood fill)
  for (let i = 0; i < totalPixels; i++) {
    if (data[i * 4 + 3] === 0) visited[i] = 1;
  }

  // Mark non-background pixels (design content) as visited
  for (let i = 0; i < totalPixels; i++) {
    if (visited[i]) continue;
    const p = i * 4;
    const dr = Math.abs(data[p] - edge.r);
    const dg = Math.abs(data[p + 1] - edge.g);
    const db = Math.abs(data[p + 2] - edge.b);
    if (dr > tolerance || dg > tolerance || db > tolerance) {
      visited[i] = 1; // design pixel — don't touch
    }
  }

  // Find connected components of unvisited (background-colored, non-edge-connected) pixels
  // These are the enclosed counter regions
  const queue = new Int32Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    if (visited[i]) continue;

    // BFS to collect this region
    let head = 0;
    let tail = 0;
    const region: number[] = [];
    let touchesEdge = false;

    visited[i] = 1;
    queue[tail++] = i;

    while (head < tail) {
      const pos = queue[head++];
      region.push(pos);

      const x = pos % width;
      const y = Math.floor(pos / width);

      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        touchesEdge = true;
      }

      const neighbors = [
        x > 0 ? pos - 1 : -1,
        x < width - 1 ? pos + 1 : -1,
        y > 0 ? pos - width : -1,
        y < height - 1 ? pos + width : -1,
      ];

      for (const n of neighbors) {
        if (n < 0 || visited[n]) continue;
        visited[n] = 1;
        queue[tail++] = n;
      }
    }

    // Only clear if the region doesn't touch the canvas edge and is reasonably small
    // (letter counters are small relative to the full image)
    if (!touchesEdge && region.length < totalPixels * 0.15) {
      for (const idx of region) {
        data[idx * 4 + 3] = 0;
      }
    }
  }
}

function sampleEdgeColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { r: number; g: number; b: number } | null {
  const samples: Array<{ r: number; g: number; b: number }> = [];

  const read = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    samples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
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

  const variance = samples.reduce((acc, s) => {
    const dr = s.r - r;
    const dg = s.g - g;
    const db = s.b - b;
    return acc + dr * dr + dg * dg + db * db;
  }, 0) / samples.length;

  // Allow higher variance since text/graphics may touch edges
  if (variance > 4500) return null;

  return { r, g, b };
}

/**
 * Fallback: sample only the 4 corners to detect background color
 * when text/design elements extend along full edges.
 */
function sampleCornerColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { r: number; g: number; b: number } | null {
  const samples: Array<{ r: number; g: number; b: number }> = [];
  const cornerSize = Math.max(4, Math.min(20, Math.floor(Math.min(width, height) * 0.05)));

  const read = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    samples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
  };

  for (let dy = 0; dy < cornerSize; dy++) {
    for (let dx = 0; dx < cornerSize; dx++) {
      read(dx, dy);
      read(width - 1 - dx, dy);
      read(dx, height - 1 - dy);
      read(width - 1 - dx, height - 1 - dy);
    }
  }

  if (samples.length === 0) return null;

  const avg = samples.reduce(
    (acc, s) => ({ r: acc.r + s.r, g: acc.g + s.g, b: acc.b + s.b }),
    { r: 0, g: 0, b: 0 },
  );

  const r = Math.round(avg.r / samples.length);
  const g = Math.round(avg.g / samples.length);
  const b = Math.round(avg.b / samples.length);

  const variance = samples.reduce((acc, s) => {
    const dr = s.r - r;
    const dg = s.g - g;
    const db = s.b - b;
    return acc + dr * dr + dg * dg + db * db;
  }, 0) / samples.length;

  if (variance > 3000) return null;
  return { r, g, b };
}

/**
 * Sample only the outermost 2-pixel border — handles cases where
 * corners have artwork but the very edge is still background.
 */
function sampleThinBorderColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { r: number; g: number; b: number } | null {
  const samples: Array<{ r: number; g: number; b: number }> = [];

  const read = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = (y * width + x) * 4;
    samples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
  };

  // Sample only the outermost 2 rows/columns
  for (let x = 0; x < width; x += 3) {
    read(x, 0);
    read(x, 1);
    read(x, height - 1);
    read(x, height - 2);
  }
  for (let y = 2; y < height - 2; y += 3) {
    read(0, y);
    read(1, y);
    read(width - 1, y);
    read(width - 2, y);
  }

  if (samples.length === 0) return null;

  const avg = samples.reduce(
    (acc, s) => ({ r: acc.r + s.r, g: acc.g + s.g, b: acc.b + s.b }),
    { r: 0, g: 0, b: 0 },
  );

  const r = Math.round(avg.r / samples.length);
  const g = Math.round(avg.g / samples.length);
  const b = Math.round(avg.b / samples.length);

  const variance = samples.reduce((acc, s) => {
    const dr = s.r - r;
    const dg = s.g - g;
    const db = s.b - b;
    return acc + dr * dr + dg * dg + db * db;
  }, 0) / samples.length;

  if (variance > 5000) return null;
  return { r, g, b };
}
