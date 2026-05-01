/**
 * Detect the horizontal center of a garment in a mockup template.
 *
 * Resilient to props (folded jeans, sunglasses, sage bundles) by:
 *   1. Sampling background from EDGE STRIPS (not corners) and rejecting
 *      outlier samples — corners are often where props live.
 *   2. Building a binary garment mask, then using CONNECTED-COMPONENT
 *      analysis to keep only the LARGEST blob (the shirt) and discard
 *      smaller props that survived background subtraction.
 *   3. Restricting symmetry analysis to the cleaned shirt-only mask in
 *      the chest band, so props can't drag the axis sideways.
 */

export interface GarmentCenter {
  offsetX: number;
  confidence: number;
  reliable: boolean;
}

const cache = new Map<string, GarmentCenter>();

export async function detectGarmentCenter(templateUrl: string): Promise<GarmentCenter> {
  const cached = cache.get(templateUrl);
  if (cached) return cached;
  const result = await new Promise<GarmentCenter>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(analyze(img));
    img.onerror = () => resolve({ offsetX: 0, confidence: 0, reliable: false });
    img.src = templateUrl;
  });
  cache.set(templateUrl, result);
  return result;
}

export async function detectGarmentCenterFresh(templateUrl: string): Promise<GarmentCenter> {
  cache.delete(templateUrl);
  return detectGarmentCenter(templateUrl);
}

function analyze(img: HTMLImageElement): GarmentCenter {
  try {
    const W = 280;
    const H = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * W));
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    if (!ctx) return { offsetX: 0, confidence: 0, reliable: false };
    ctx.drawImage(img, 0, 0, W, H);
    const all = ctx.getImageData(0, 0, W, H).data;

    // --- 1. Robust background sampling from edge strips ---
    // Sample many small patches along all four edges, then take the per-channel
    // median. This survives props in any one corner.
    const patches: number[][] = [];
    const patchSize = 4;
    const sampleAlongEdge = (xStart: number, yStart: number, xStep: number, yStep: number, count: number) => {
      for (let k = 0; k < count; k++) {
        const px = xStart + k * xStep;
        const py = yStart + k * yStep;
        if (px < 0 || py < 0 || px + patchSize >= W || py + patchSize >= H) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = py; y < py + patchSize; y++) {
          for (let x = px; x < px + patchSize; x++) {
            const i = (y * W + x) * 4;
            r += all[i]; g += all[i + 1]; b += all[i + 2]; n++;
          }
        }
        patches.push([r / n, g / n, b / n]);
      }
    };
    const edgePad = 2;
    const samplesPerEdge = 12;
    sampleAlongEdge(edgePad, edgePad, Math.floor((W - 2 * edgePad) / samplesPerEdge), 0, samplesPerEdge);                                    // top
    sampleAlongEdge(edgePad, H - edgePad - patchSize, Math.floor((W - 2 * edgePad) / samplesPerEdge), 0, samplesPerEdge);                    // bottom
    sampleAlongEdge(edgePad, edgePad, 0, Math.floor((H - 2 * edgePad) / samplesPerEdge), samplesPerEdge);                                    // left
    sampleAlongEdge(W - edgePad - patchSize, edgePad, 0, Math.floor((H - 2 * edgePad) / samplesPerEdge), samplesPerEdge);                    // right
    if (patches.length < 8) return { offsetX: 0, confidence: 0, reliable: false };

    const median = (vs: number[]) => vs.sort((a, b) => a - b)[Math.floor(vs.length / 2)];
    const bg = [
      median(patches.map(p => p[0])),
      median(patches.map(p => p[1])),
      median(patches.map(p => p[2])),
    ];

    // --- 2. Binary garment mask ---
    const mask = new Uint8Array(W * H);
    const thresh = 38 * 38;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const dr = all[i] - bg[0], dg = all[i + 1] - bg[1], db = all[i + 2] - bg[2];
        if (dr * dr + dg * dg + db * db > thresh) mask[y * W + x] = 1;
      }
    }

    // --- 3. Connected-component labelling — keep only the largest blob ---
    // The shirt is always the biggest non-background object in a product photo.
    // Anything smaller (folded jeans, sage, sunglasses) gets discarded.
    const labels = new Int32Array(W * H);
    const sizes: number[] = [0]; // index 0 = background
    let nextLabel = 1;
    const stack: number[] = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (mask[idx] !== 1 || labels[idx] !== 0) continue;
        // Flood fill (4-connected)
        labels[idx] = nextLabel;
        let size = 0;
        stack.push(idx);
        while (stack.length) {
          const p = stack.pop()!;
          size++;
          const py = (p / W) | 0;
          const px = p - py * W;
          if (px > 0) {
            const n = p - 1;
            if (mask[n] === 1 && labels[n] === 0) { labels[n] = nextLabel; stack.push(n); }
          }
          if (px < W - 1) {
            const n = p + 1;
            if (mask[n] === 1 && labels[n] === 0) { labels[n] = nextLabel; stack.push(n); }
          }
          if (py > 0) {
            const n = p - W;
            if (mask[n] === 1 && labels[n] === 0) { labels[n] = nextLabel; stack.push(n); }
          }
          if (py < H - 1) {
            const n = p + W;
            if (mask[n] === 1 && labels[n] === 0) { labels[n] = nextLabel; stack.push(n); }
          }
        }
        sizes.push(size);
        nextLabel++;
      }
    }
    if (sizes.length < 2) return { offsetX: 0, confidence: 0, reliable: false };

    let bestLabel = 1;
    let bestSize = 0;
    for (let l = 1; l < sizes.length; l++) {
      if (sizes[l] > bestSize) { bestSize = sizes[l]; bestLabel = l; }
    }
    // Sanity: shirt should occupy at least 12% of image
    if (bestSize < W * H * 0.12) return { offsetX: 0, confidence: 0, reliable: false };

    // Build shirt-only mask
    const shirt = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) shirt[i] = labels[i] === bestLabel ? 1 : 0;

    // --- 4. Find shirt's vertical extent so chest band is relative to the SHIRT, not the image ---
    let yMin = H, yMax = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (shirt[y * W + x]) { if (y < yMin) yMin = y; if (y > yMax) yMax = y; break; }
      }
    }
    if (yMax - yMin < 20) return { offsetX: 0, confidence: 0, reliable: false };
    // Chest band: 15%–55% down the SHIRT (not the image)
    const shirtH = yMax - yMin;
    const yStart = yMin + Math.floor(shirtH * 0.15);
    const yEnd = yMin + Math.floor(shirtH * 0.55);

    // --- 5. Symmetry search on shirt-only mask ---
    // Search around the shirt's bounding-box center, not the image center.
    let xMin = W, xMax = 0;
    for (let y = yStart; y < yEnd; y++) {
      for (let x = 0; x < W; x++) {
        if (shirt[y * W + x]) { if (x < xMin) xMin = x; if (x > xMax) xMax = x; }
      }
    }
    if (xMax - xMin < 20) return { offsetX: 0, confidence: 0, reliable: false };
    const bboxCenter = (xMin + xMax) / 2;

    const searchHalf = Math.floor(W * 0.10); // ±10% of image width around bbox center
    const axisMin = Math.max(Math.floor(W * 0.30), Math.floor(bboxCenter) - searchHalf);
    const axisMax = Math.min(Math.floor(W * 0.70), Math.floor(bboxCenter) + searchHalf);

    let bestAxis = Math.floor(bboxCenter);
    let bestScore = -1;
    let secondScore = -1;
    const scores: number[] = [];

    for (let axis = axisMin; axis <= axisMax; axis++) {
      const halfRange = Math.min(axis - xMin, xMax - axis);
      if (halfRange < (xMax - xMin) * 0.30) continue; // need meaningful overlap
      let matches = 0, total = 0;
      for (let y = yStart; y < yEnd; y += 2) {
        const row = y * W;
        for (let dx = 1; dx <= halfRange; dx += 2) {
          const left = shirt[row + axis - dx];
          const right = shirt[row + axis + dx];
          total++;
          if (left === right) matches++;
        }
      }
      const score = total > 0 ? matches / total : 0;
      scores.push(score);
      if (score > bestScore) {
        secondScore = bestScore;
        bestScore = score;
        bestAxis = axis;
      } else if (score > secondScore) {
        secondScore = score;
      }
    }

    if (bestScore <= 0 || scores.length === 0) {
      // Fallback to bbox center with low confidence
      const offset = (bboxCenter - W / 2) / W;
      return { offsetX: Math.max(-0.18, Math.min(0.18, offset)), confidence: 0.35, reliable: false };
    }

    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const lift = Math.max(0, bestScore - avg);
    const peakedness = Math.max(0, bestScore - secondScore);
    let confidence = Math.min(1, bestScore * 0.4 + lift * 4 + peakedness * 6);
    if (bestScore < 0.65) confidence = Math.min(confidence, 0.4);

    // Cross-check with the shirt's bounding-box center.
    // - If they AGREE closely (<2% of width apart), this is the strongest possible
    //   signal — both independent methods picked the same axis. Boost confidence.
    // - If they disagree moderately (2–6%), trust symmetry but cap confidence.
    // - If they disagree strongly (>6%), average them and heavily dampen.
    const bboxOffsetFrac = Math.abs(bestAxis - bboxCenter) / W;
    let finalAxis = bestAxis;
    if (bboxOffsetFrac < 0.02) {
      // Strong agreement — high-confidence centering.
      confidence = Math.max(confidence, 0.85);
    } else if (bboxOffsetFrac < 0.06) {
      confidence = Math.max(confidence, 0.6);
    } else {
      finalAxis = (bestAxis + bboxCenter) / 2;
      confidence *= 0.6;
    }

    const offset = (finalAxis - W / 2) / W;
    const clamped = Math.max(-0.15, Math.min(0.15, offset));
    const finalOffset = Math.abs(clamped) < 0.005 ? 0 : clamped;

    return {
      offsetX: finalOffset,
      confidence: Number(confidence.toFixed(3)),
      reliable: confidence >= 0.6,
    };
  } catch {
    return { offsetX: 0, confidence: 0, reliable: false };
  }
}
