/**
 * Detect the horizontal center of a garment in a flat-lay/ghost-mannequin
 * mockup template. Uses the SHOULDER LINE as the primary signal because:
 *   - It's the widest, highest-contrast horizontal feature on the garment
 *   - It sits above where props (jeans, sunglasses, etc.) usually appear
 *   - It's symmetric on virtually every product photo
 *
 * Returns offsetX as a signed fraction of image width (0 = image center,
 * positive = right of center). `confidence` 0-1 — caller should ignore
 * results below ~0.6.
 */

export interface GarmentCenter {
  offsetX: number;
  confidence: number;
}

const cache = new Map<string, GarmentCenter>();

export async function detectGarmentCenter(templateUrl: string): Promise<GarmentCenter> {
  const cached = cache.get(templateUrl);
  if (cached) return cached;

  const result = await new Promise<GarmentCenter>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(analyze(img));
    img.onerror = () => resolve({ offsetX: 0, confidence: 0 });
    img.src = templateUrl;
  });

  cache.set(templateUrl, result);
  return result;
}

function analyze(img: HTMLImageElement): GarmentCenter {
  try {
    const W = 240;
    const H = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * W));
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    if (!ctx) return { offsetX: 0, confidence: 0 };
    ctx.drawImage(img, 0, 0, W, H);
    const all = ctx.getImageData(0, 0, W, H).data;

    // Sample background color from the four corners.
    const cornerSamples: number[][] = [];
    const cornerSize = 6;
    for (const [cx, cy] of [[0, 0], [W - cornerSize, 0], [0, H - cornerSize], [W - cornerSize, H - cornerSize]]) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = cy; y < cy + cornerSize; y++) {
        for (let x = cx; x < cx + cornerSize; x++) {
          const i = (y * W + x) * 4;
          r += all[i]; g += all[i + 1]; b += all[i + 2]; n++;
        }
      }
      cornerSamples.push([r / n, g / n, b / n]);
    }
    // Use median per-channel to ignore one rogue corner (e.g. a prop in a corner).
    const med = (vs: number[]) => vs.sort((a, b) => a - b)[Math.floor(vs.length / 2)];
    const bg = [
      med(cornerSamples.map(s => s[0])),
      med(cornerSamples.map(s => s[1])),
      med(cornerSamples.map(s => s[2])),
    ];

    const isGarment = (i: number) => {
      const dr = all[i] - bg[0], dg = all[i + 1] - bg[1], db = all[i + 2] - bg[2];
      return dr * dr + dg * dg + db * db > 35 * 35;
    };

    // Sample several horizontal bands across the upper-to-mid garment area.
    // For each band, find the LARGEST contiguous run of garment pixels —
    // this rejects narrow props (sleeves of folded denim, sunglasses)
    // because the shirt body is always the widest run on that row.
    const bands = [0.18, 0.22, 0.27, 0.33, 0.42, 0.50, 0.58];
    const centers: { center: number; width: number }[] = [];

    for (const yFrac of bands) {
      const y = Math.floor(H * yFrac);
      let bestStart = -1, bestEnd = -1, bestLen = 0;
      let curStart = -1;
      for (let x = 0; x < W; x++) {
        if (isGarment((y * W + x) * 4)) {
          if (curStart === -1) curStart = x;
        } else if (curStart !== -1) {
          const len = x - curStart;
          if (len > bestLen) { bestLen = len; bestStart = curStart; bestEnd = x - 1; }
          curStart = -1;
        }
      }
      if (curStart !== -1) {
        const len = W - curStart;
        if (len > bestLen) { bestLen = len; bestStart = curStart; bestEnd = W - 1; }
      }
      // Reject runs that touch the image edge (likely prop bleeding off-frame)
      // and runs that are too narrow to be a shirt.
      if (bestLen >= W * 0.25 && bestStart > 1 && bestEnd < W - 2) {
        centers.push({ center: (bestStart + bestEnd) / 2, width: bestLen });
      }
    }

    if (centers.length < 3) return { offsetX: 0, confidence: 0 };

    // Weight by run width (wider rows = more reliable) and by row consensus.
    const totalW = centers.reduce((s, c) => s + c.width, 0);
    const avgCenter = centers.reduce((s, c) => s + c.center * c.width, 0) / totalW;

    // Confidence: low spread between rows = high confidence.
    const variance = centers.reduce((s, c) => s + (c.center - avgCenter) ** 2 * c.width, 0) / totalW;
    const spreadFrac = Math.sqrt(variance) / W; // 0 = perfect agreement
    const confidence = Math.max(0, Math.min(1, 1 - spreadFrac * 8));

    const offset = (avgCenter - W / 2) / W;
    const clamped = Math.max(-0.2, Math.min(0.2, offset));

    // Snap tiny offsets to zero to avoid noisy nudges on already-centered shots.
    const finalOffset = Math.abs(clamped) < 0.008 ? 0 : clamped;

    return { offsetX: finalOffset, confidence };
  } catch {
    return { offsetX: 0, confidence: 0 };
  }
}
