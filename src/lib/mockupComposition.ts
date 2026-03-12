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
  const [templateImage, generatedImage] = await Promise.all([
    loadImage(templateDataUrl),
    loadImage(generatedDataUrl),
  ]);

  const templateCanvas = document.createElement("canvas");
  templateCanvas.width = targetWidth;
  templateCanvas.height = targetHeight;
  const templateCtx = templateCanvas.getContext("2d");
  if (!templateCtx) throw new Error("Canvas context unavailable");
  drawCover(templateCtx, templateImage, targetWidth, targetHeight);

  const generatedCanvas = document.createElement("canvas");
  generatedCanvas.width = targetWidth;
  generatedCanvas.height = targetHeight;
  const generatedCtx = generatedCanvas.getContext("2d");
  if (!generatedCtx) throw new Error("Canvas context unavailable");
  drawCover(generatedCtx, generatedImage, targetWidth, targetHeight);

  const templateData = templateCtx.getImageData(0, 0, targetWidth, targetHeight);
  const generatedData = generatedCtx.getImageData(0, 0, targetWidth, targetHeight);

  const rawMask = buildRawChangeMask(templateData.data, generatedData.data);
  const lockedMask = removeEdgeConnectedChanges(rawMask, targetWidth, targetHeight);
  const coverage = countMaskCoverage(lockedMask);
  const finalMask =
    coverage < MIN_MASK_COVERAGE
      ? rawMask
      : blurMask(lockedMask, targetWidth, targetHeight, 2);

  const outData = templateCtx.createImageData(targetWidth, targetHeight);
  compositeFromMask(templateData.data, generatedData.data, finalMask, outData.data);

  templateCtx.putImageData(outData, 0, 0);

  return await new Promise<Blob>((resolve, reject) => {
    templateCanvas.toBlob((blob) => {
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
