const MASK_DIFF_THRESHOLD = 16;
const MASK_LUMA_THRESHOLD = 10;
const MIN_MASK_COVERAGE = 0.01;

export interface DesignPlacement {
  scale: number;    // fraction of canvas width the design occupies
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
        const designImg = await loadImage(designDataUrl);
        const cleanedDesign = stripSolidEdgeBackground(designImg);
        const preparedDesign = prepareDesignForCompositing(cleanedDesign);
        drawDesignWithUnderbase(ctx, preparedDesign, targetWidth, targetHeight, isDarkGarment, designStyle, placement);
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
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const dx = (targetWidth - drawWidth) / 2;
  const dy = (targetHeight - drawHeight) / 2;

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
) {
  const designWidth = cleanedDesign.width;
  const designHeight = cleanedDesign.height;

  // Use custom placement if provided, otherwise use defaults
  const designScale = placement?.scale ?? (designStyle === "text-only" ? 0.30 : 0.35);
  const drawWidth = targetWidth * designScale;
  const drawHeight = drawWidth * (designHeight / designWidth);
  const dx = (targetWidth - drawWidth) / 2;
  const dy = targetHeight * (placement?.offsetY ?? 0.25);

  // For dark garments, add a subtle white underbase behind the design
  // so dark outlines / shadows in the artwork remain visible on dark fabric.
  if (isDarkGarment) {
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

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 20) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

    // Only lift near-NEUTRAL dark pixels (text outlines, black strokes).
    // Leave chromatic/colorful dark pixels alone — they're intentional
    // design colors (dark blue, purple, etc.) that are already visible
    // through their chromaticity on dark garments.
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;

    if (luma < 0.18 && saturation < 0.15) {
      // Only lift truly black/near-black neutral pixels
      const lift = Math.min(1, (0.18 - luma) / 0.18);
      const blend = 0.5 * lift;
      data[i] = Math.round(r * (1 - blend) + 200 * blend);
      data[i + 1] = Math.round(g * (1 - blend) + 200 * blend);
      data[i + 2] = Math.round(b * (1 - blend) + 200 * blend);
      data[i + 3] = Math.max(alpha, Math.round(170 + 85 * lift));
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

/**
 * Composite a design onto a template photo (center-chest placement).
 * If the design has a solid edge background (black/white), it is stripped first.
 */
export async function compositeDesignOntoTemplate(
  templateDataUrl: string,
  designDataUrl: string,
  isDarkGarment?: boolean,
  designStyle?: string,
): Promise<string> {
  const [templateImg, designImg] = await Promise.all([
    loadImage(templateDataUrl),
    loadImage(designDataUrl),
  ]);

  const w = templateImg.naturalWidth || templateImg.width;
  const h = templateImg.naturalHeight || templateImg.height;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  // Draw template first
  ctx.drawImage(templateImg, 0, 0, w, h);

  // Clean design (remove solid edge bg if needed)
  const cleanedDesignCanvas = stripSolidEdgeBackground(designImg);
  const preparedDesignCanvas = prepareDesignForCompositing(cleanedDesignCanvas);
  drawDesignWithUnderbase(ctx, preparedDesignCanvas, w, h, isDarkGarment, designStyle);

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

  // Only skip stripping when the OUTER border is already mostly transparent.
  // Some designs (like watercolor art) contain internal transparency while still
  // having an opaque rectangular background — global alpha checks miss that case.
  if (hasTransparentBorder(data, canvas.width, canvas.height)) {
    return canvas;
  }

  // Strategy 1: Try full-edge sampling (works for solid bg designs)
  const edge = sampleEdgeColor(data, canvas.width, canvas.height);
  if (edge) {
    return floodFillBackground(canvas, ctx, imgData, data, edge, 36);
  }

  // Strategy 2: Corner sampling (works for designs with text/art touching edges)
  const cornerEdge = sampleCornerColor(data, canvas.width, canvas.height);
  if (cornerEdge) {
    return floodFillBackground(canvas, ctx, imgData, data, cornerEdge, 42);
  }

  // Strategy 3: Try just the very outermost 2-pixel border
  // This handles complex designs where corners also have artwork
  const borderEdge = sampleThinBorderColor(data, canvas.width, canvas.height);
  if (borderEdge) {
    return floodFillBackground(canvas, ctx, imgData, data, borderEdge, 48);
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

function prepareDesignForCompositing(source: HTMLCanvasElement): HTMLCanvasElement {
  const srcCtx = source.getContext("2d");
  if (!srcCtx) return source;

  const srcImage = srcCtx.getImageData(0, 0, source.width, source.height);
  const srcData = srcImage.data;
  const ALPHA_KEEP_THRESHOLD = 10;

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
    return source;
  }

  const pad = 6;
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
  return cropped;
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

  ctx.putImageData(imgData, 0, 0);
  return canvas;
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
