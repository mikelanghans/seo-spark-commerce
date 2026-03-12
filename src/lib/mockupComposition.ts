const MASK_DIFF_THRESHOLD = 16;
const MASK_LUMA_THRESHOLD = 10;
const MIN_MASK_COVERAGE = 0.01;

interface CompositionLockParams {
  templateDataUrl: string;
  generatedDataUrl: string;
  targetWidth: number;
  targetHeight: number;
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
}: CompositionLockParams): Promise<Blob> {
  const generatedImage = await loadImage(generatedDataUrl);

  // Simply resize/crop the AI output to match template dimensions.
  // The AI is already instructed to preserve framing, props, and composition —
  // the old diff-mask approach was incorrectly reverting large color changes
  // (e.g. black→white) because the shirt touched image edges.
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  drawCover(ctx, generatedImage, targetWidth, targetHeight);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to convert composed image to blob"));
        return;
      }
      resolve(blob);
    }, "image/png");
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
  const designWidth = cleanedDesignCanvas.width;
  const designHeight = cleanedDesignCanvas.height;

  // Chest-print sizing/placement
  const designScale = 0.58;
  const drawWidth = w * designScale;
  const drawHeight = drawWidth * (designHeight / designWidth);
  const dx = (w - drawWidth) / 2;
  const dy = h * 0.24;

  ctx.drawImage(cleanedDesignCanvas, dx, dy, drawWidth, drawHeight);

  return canvas.toDataURL("image/png");
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

  // If design already has transparency, don't alter it.
  let transparentPixels = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) transparentPixels++;
  }
  if (transparentPixels > (canvas.width * canvas.height) * 0.002) {
    return canvas;
  }

  const edge = sampleEdgeColor(data, canvas.width, canvas.height);
  if (!edge) return canvas;

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

  const tolerance = 32;

  while (head < tail) {
    const pos = queue[head++];
    const p = pos * 4;

    const dr = Math.abs(data[p] - edge.r);
    const dg = Math.abs(data[p + 1] - edge.g);
    const db = Math.abs(data[p + 2] - edge.b);

    if (dr > tolerance || dg > tolerance || db > tolerance) continue;

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

  // Only strip when edges are fairly uniform (solid background)
  if (variance > 1200) return null;

  return { r, g, b };
}
