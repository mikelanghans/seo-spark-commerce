/**
 * Detect the horizontal center of a garment in a mockup template.
 *
 * Strategy (in order of weight):
 *   1. Build a binary garment mask via background subtraction (corner-sampled bg).
 *   2. Restrict to the chest band (top 20–55% of the mask) — this is where the
 *      shirt body is widest and most symmetric, and avoids hems/props below.
 *   3. SYMMETRY SEARCH: slide a candidate vertical axis across ±18% of image
 *      width and score how well the mask mirrors around that axis. The axis
 *      with the highest symmetry wins. Bilateral symmetry is the most reliable
 *      signal a shirt has — robust to props, folds, and uneven lighting.
 *   4. Confidence = how peaked the symmetry score is vs. the runner-up.
 */

export interface GarmentCenter {
  offsetX: number;
  confidence: number;
  /** Whether the result is reliable enough to apply automatically (>=0.6). */
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

/** Force a re-analysis (used by the Auto-Center button to bust the cache). */
export async function detectGarmentCenterFresh(templateUrl: string): Promise<GarmentCenter> {
  cache.delete(templateUrl);
  return detectGarmentCenter(templateUrl);
}

function analyze(img: HTMLImageElement): GarmentCenter {
  try {
    const W = 280;
    const H = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * W));
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    if (!ctx) return { offsetX: 0, confidence: 0, reliable: false };
    ctx.drawImage(img, 0, 0, W, H);
    const all = ctx.getImageData(0, 0, W, H).data;

    // --- Background sample from corners (median per channel) ---
    const cornerSamples: number[][] = [];
    const cs = 6;
    for (const [cx, cy] of [[0, 0], [W - cs, 0], [0, H - cs], [W - cs, H - cs]]) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = cy; y < cy + cs; y++) {
        for (let x = cx; x < cx + cs; x++) {
          const i = (y * W + x) * 4;
          r += all[i]; g += all[i + 1]; b += all[i + 2]; n++;
        }
      }
      cornerSamples.push([r / n, g / n, b / n]);
    }
    const med = (vs: number[]) => vs.sort((a, b) => a - b)[Math.floor(vs.length / 2)];
    const bg = [
      med(cornerSamples.map(s => s[0])),
      med(cornerSamples.map(s => s[1])),
      med(cornerSamples.map(s => s[2])),
    ];

    // --- Build a binary garment mask: 1 = garment, 0 = background ---
    const mask = new Uint8Array(W * H);
    const thresh = 38 * 38;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const dr = all[i] - bg[0], dg = all[i + 1] - bg[1], db = all[i + 2] - bg[2];
        if (dr * dr + dg * dg + db * db > thresh) mask[y * W + x] = 1;
      }
    }

    // --- Restrict to chest band (rows 20%–55%) ---
    const yStart = Math.floor(H * 0.20);
    const yEnd = Math.floor(H * 0.55);
    if (yEnd - yStart < 8) return { offsetX: 0, confidence: 0, reliable: false };

    // Quick sanity check — need enough garment pixels in the chest band.
    let chestPixels = 0;
    for (let y = yStart; y < yEnd; y++) {
      for (let x = 0; x < W; x++) chestPixels += mask[y * W + x];
    }
    if (chestPixels < (yEnd - yStart) * W * 0.12) {
      return { offsetX: 0, confidence: 0, reliable: false };
    }

    // --- SYMMETRY SEARCH ---
    // For each candidate center axis, count mirrored matches in the chest band.
    // Score = matches / total_compared. Higher = more symmetric.
    const searchHalf = Math.floor(W * 0.18); // ±18% of width
    const axisMin = Math.floor(W * 0.5) - searchHalf;
    const axisMax = Math.floor(W * 0.5) + searchHalf;

    let bestAxis = Math.floor(W / 2);
    let bestScore = -1;
    let secondScore = -1;
    const scores: number[] = [];

    for (let axis = axisMin; axis <= axisMax; axis++) {
      // Only compare within the half-width that fits on both sides of the axis.
      const halfRange = Math.min(axis, W - 1 - axis);
      if (halfRange < W * 0.15) continue;

      let matches = 0;
      let total = 0;
      // Sample every 2 px for speed.
      for (let y = yStart; y < yEnd; y += 2) {
        const row = y * W;
        for (let dx = 1; dx <= halfRange; dx += 2) {
          const left = mask[row + axis - dx];
          const right = mask[row + axis + dx];
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

    if (bestScore <= 0) return { offsetX: 0, confidence: 0, reliable: false };

    // Confidence: how much the winner beats the average + how peaked it is.
    const avg = scores.reduce((s, v) => s + v, 0) / Math.max(1, scores.length);
    const lift = Math.max(0, bestScore - avg);            // 0..~0.15
    const peakedness = Math.max(0, bestScore - secondScore); // 0..~0.05
    // Calibrate so "obvious" symmetry (lift > 0.05) gives confidence ~0.85+.
    let confidence = Math.min(1, bestScore * 0.4 + lift * 4 + peakedness * 6);
    // Floor: an absolute symmetry score below 0.7 is not trustworthy regardless.
    if (bestScore < 0.7) confidence = Math.min(confidence, 0.4);

    const offset = (bestAxis - W / 2) / W;
    const clamped = Math.max(-0.18, Math.min(0.18, offset));
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
