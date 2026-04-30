import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { RotateCw, Check, Loader2 } from "lucide-react";
import type { DesignPlacement } from "@/lib/mockupComposition";
import { ensureImageDataUrl, getPreparedDesignDataUrl } from "@/lib/mockupComposition";
import { smartRemoveBackground } from "@/lib/removeBackground";

interface Props {
  templateUrl: string;
  designUrl: string;
  designStyle?: string;
  initialPlacement?: DesignPlacement;
  onConfirm: (placement: DesignPlacement) => void;
  onCancel: () => void;
}

const DEFAULT_SCALE = 0.36;
const TEXT_ONLY_SCALE = 0.28;

const useOriginalDesignForPreview = async (url: string) => {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load design"));
    image.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  let transparent = 0;
  let opaque = 0;
  let accent = 0;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 50) transparent++;
    if (alpha < 90) continue;
    opaque++;
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (sat > 0.22 && max - min > 0.18 && luma > 0.12 && luma < 0.95) accent++;
  }

  return transparent / Math.max(1, canvas.width * canvas.height) > 0.2
    && accent / Math.max(1, opaque) > 0.003;
};

export const DesignPlacementEditor = ({
  templateUrl,
  designUrl,
  designStyle,
  initialPlacement,
  onConfirm,
  onCancel,
}: Props) => {
  const defaultScale = designStyle === "text-only" ? TEXT_ONLY_SCALE : DEFAULT_SCALE;
  const [scale, setScale] = useState(initialPlacement?.scale ?? defaultScale);
  const [shirtCenterOffset, setShirtCenterOffset] = useState(0); // detected garment-center offset from image center, in fraction of width
  const [offsetX, setOffsetX] = useState(initialPlacement?.offsetX ?? 0);
  const [offsetY, setOffsetY] = useState(initialPlacement?.offsetY ?? 0.20);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [templateAspect, setTemplateAspect] = useState(1);
  const [designLoaded, setDesignLoaded] = useState(false);
  const [designAspect, setDesignAspect] = useState(1);
  const dragStartRef = useRef<{ x: number; y: number; startOffsetX: number; startOffsetY: number } | null>(null);
  const resizeStartRef = useRef<{ x: number; y: number; startScale: number } | null>(null);
  const [processedDesignUrl, setProcessedDesignUrl] = useState<string | null>(null);
  const [processingDesign, setProcessingDesign] = useState(true);
  const userTouchedXRef = useRef(initialPlacement?.offsetX !== undefined && initialPlacement?.offsetX !== 0);

  // Detect garment horizontal center by sampling the template's middle band
  // and finding the centroid of "garment" pixels (mid-luma, low-saturation mass
  // distinct from the surrounding background).
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        const W = 200;
        const H = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * W));
        const c = document.createElement("canvas");
        c.width = W; c.height = H;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, W, H);
        // Sample horizontal band around the chest area (y: 25%–55%)
        const y0 = Math.floor(H * 0.25);
        const y1 = Math.floor(H * 0.55);
        const data = ctx.getImageData(0, y0, W, y1 - y0).data;
        // Sample background color from the corners (avg of 4 corners)
        const corner = (cx: number, cy: number) => {
          const d = ctx.getImageData(cx, cy, 1, 1).data;
          return [d[0], d[1], d[2]];
        };
        const bg = [
          corner(2, 2), corner(W - 3, 2),
          corner(2, H - 3), corner(W - 3, H - 3),
        ].reduce((acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b], [0, 0, 0])
          .map(v => v / 4);
        let sumX = 0, count = 0;
        for (let y = 0; y < y1 - y0; y++) {
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            const dr = data[i] - bg[0], dg = data[i + 1] - bg[1], db = data[i + 2] - bg[2];
            const dist = Math.sqrt(dr * dr + dg * dg + db * db);
            if (dist > 35) { sumX += x; count++; }
          }
        }
        if (count > W * 5) {
          const cx = sumX / count;
          const offset = (cx - W / 2) / W; // fraction of width, signed
          // clamp tiny noise
          const clamped = Math.abs(offset) < 0.01 ? 0 : Math.max(-0.2, Math.min(0.2, offset));
          if (!cancelled) {
            setShirtCenterOffset(clamped);
            // If the user hasn't manually set X yet, snap initial position to the detected center
            if (!userTouchedXRef.current) setOffsetX(clamped);
          }
        }
      } catch { /* ignore */ }
    };
    img.src = templateUrl;
    return () => { cancelled = true; };
  }, [templateUrl]);

  // Strip background from design for transparent preview
  useEffect(() => {
    let cancelled = false;
    setProcessingDesign(true);
    // IMPORTANT: Always run the design through getPreparedDesignDataUrl so the
    // preview uses the SAME tight-cropped canvas the final composition uses.
    // Otherwise extra transparent padding around the artwork shifts the visual
    // top of the design downward in the editor while the real composite anchors
    // the cropped art at offsetY → design appears "higher" than placed.
    useOriginalDesignForPreview(designUrl)
      .then((useOriginal) => useOriginal
        ? getPreparedDesignDataUrl(designUrl)
        : smartRemoveBackground(designUrl).then((base64) => getPreparedDesignDataUrl(ensureImageDataUrl(base64))))
      .then((preparedUrl) => {
        if (!cancelled) setProcessedDesignUrl(preparedUrl);
      })
      .catch(() => {
        getPreparedDesignDataUrl(designUrl)
          .then((preparedUrl) => {
            if (!cancelled) setProcessedDesignUrl(preparedUrl);
          })
          .catch(() => {
            if (!cancelled) setProcessedDesignUrl(designUrl);
          });
      })
      .finally(() => {
        if (!cancelled) setProcessingDesign(false);
      });
    return () => { cancelled = true; };
  }, [designUrl]);

  const handleDesignLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDesignAspect(img.naturalHeight / img.naturalWidth);
    setDesignLoaded(true);
  };

  const handleReset = () => {
    setScale(defaultScale);
    setOffsetX(shirtCenterOffset);
    setOffsetY(0.20);
    userTouchedXRef.current = false;
  };

  // Drag handling
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    userTouchedXRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startOffsetX: offsetX,
      startOffsetY: offsetY,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [offsetX, offsetY]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || !dragStartRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = (e.clientX - dragStartRef.current.x) / rect.width;
    const dy = (e.clientY - dragStartRef.current.y) / rect.height;
    let nextX = dragStartRef.current.startOffsetX + dx;
    // Magnetic snap to the SHIRT's center (not image center)
    if (Math.abs(nextX - shirtCenterOffset) < 0.015) nextX = shirtCenterOffset;
    setOffsetX(Math.max(-0.3, Math.min(0.3, nextX)));
    setOffsetY(Math.max(0.05, Math.min(0.7, dragStartRef.current.startOffsetY + dy)));
  }, [dragging, shirtCenterOffset]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
    setResizing(false);
    dragStartRef.current = null;
    resizeStartRef.current = null;
  }, []);

  // Resize via corner handles
  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    resizeStartRef.current = { x: e.clientX, y: e.clientY, startScale: scale };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [scale]);

  const handleResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizing || !resizeStartRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = (e.clientX - resizeStartRef.current.x) / rect.width;
    const dy = (e.clientY - resizeStartRef.current.y) / rect.height;
    const delta = (dx + dy) / 2;
    setScale(Math.max(0.10, Math.min(0.60, resizeStartRef.current.startScale + delta)));
  }, [resizing]);

  // Compute design position in the preview
  const designWidthPct = scale * 100;
  const designHeightPct = designWidthPct * designAspect * templateAspect;
  const designLeftPct = (50 - designWidthPct / 2) + offsetX * 100;
  const designTopPct = offsetY * 100;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold">Adjust Design Placement</h4>
          <p className="text-xs text-muted-foreground">Drag the design or use sliders to fine-tune position & size</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setOffsetX(shirtCenterOffset); userTouchedXRef.current = false; }} className="gap-1.5" title="Snap to shirt center">
            ↔ Center
          </Button>
          <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5">
            <RotateCw className="h-3.5 w-3.5" /> Reset
          </Button>
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      </div>

      {/* Visual Preview */}
      <div
        ref={containerRef}
        className="relative mx-auto overflow-hidden rounded-lg bg-secondary select-none"
          style={{ maxWidth: 420, aspectRatio: `${templateAspect}` }}
      >
        <img
          src={templateUrl}
          alt="Template"
          className="h-full w-full object-contain"
          onLoad={(e) => {
            const img = e.currentTarget;
            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;
            setTemplateAspect(width > 0 && height > 0 ? width / height : 1);
            setTemplateLoaded(true);
          }}
          draggable={false}
        />

        {/* Centering guides — vertical center line, chest line, and chest target box.
            The vertical line turns solid + brighter when the design is horizontally centered. */}
        {templateLoaded && (
          <>
            {/* Vertical center line */}
            <div
              className={`absolute top-0 bottom-0 pointer-events-none transition-colors ${
                Math.abs(offsetX) < 0.01
                  ? "border-l-2 border-primary/80"
                  : "border-l border-dashed border-primary/30"
              }`}
              style={{ left: "50%", transform: "translateX(-0.5px)" }}
            />
            {/* Chest target box (recommended placement zone, ~28% wide × 32% tall, centered, top at 20%) */}
            <div
              className="absolute pointer-events-none border border-dashed border-primary/35 rounded"
              style={{ left: "36%", top: "20%", width: "28%", height: "32%" }}
            />
            {/* Tiny center crosshair at chest sweet spot */}
            <div
              className="absolute pointer-events-none w-3 h-3 rounded-full border border-primary/60"
              style={{ left: "50%", top: "36%", transform: "translate(-50%, -50%)" }}
            />
          </>
        )}

        {processingDesign && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        {templateLoaded && processedDesignUrl && (
          <img
            src={processedDesignUrl}
            alt="Design"
            draggable={false}
            onLoad={handleDesignLoad}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={`absolute pointer-events-auto ${dragging ? "cursor-grabbing" : "cursor-grab"} ${designLoaded ? "opacity-100" : "opacity-0"} transition-opacity`}
            style={{
              width: `${designWidthPct}%`,
              height: `${designHeightPct}%`,
              left: `${designLeftPct}%`,
              top: `${designTopPct}%`,
              touchAction: "none",
              filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.3))",
            }}
          />
        )}

        {/* Corner handles — grabbable for resizing */}
        {templateLoaded && designLoaded && (
          <>
            {[
              { left: designLeftPct, top: designTopPct, cursor: "nwse-resize" },
              { left: designLeftPct + designWidthPct, top: designTopPct, cursor: "nesw-resize" },
              { left: designLeftPct, top: designTopPct + designHeightPct, cursor: "nesw-resize" },
              { left: designLeftPct + designWidthPct, top: designTopPct + designHeightPct, cursor: "nwse-resize" },
            ].map((pos, i) => (
              <div
                key={i}
                onPointerDown={handleResizePointerDown}
                onPointerMove={handleResizePointerMove}
                onPointerUp={handlePointerUp}
                className="absolute w-4 h-4 rounded-full bg-primary border-2 border-primary-foreground shadow-md z-20 hover:scale-125 transition-transform"
                style={{
                  left: `${pos.left}%`,
                  top: `${pos.top}%`,
                  transform: "translate(-50%, -50%)",
                  cursor: pos.cursor,
                  touchAction: "none",
                }}
              />
            ))}
            {/* Dashed border */}
            <div
              className="absolute border border-dashed border-primary/60 rounded pointer-events-none"
              style={{
                left: `${designLeftPct}%`,
                top: `${designTopPct}%`,
                width: `${designWidthPct}%`,
                height: `${designHeightPct}%`,
              }}
            />
          </>
        )}
      </div>

      {/* Sliders */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">
            Size: {Math.round(scale * 100)}%
          </label>
          <Slider
            value={[scale]}
            onValueChange={([v]) => setScale(v)}
            min={0.10}
            max={0.60}
            step={0.01}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">
            Horizontal: {offsetX > 0 ? "+" : ""}{Math.round(offsetX * 100)}
          </label>
          <Slider
            value={[offsetX]}
            onValueChange={([v]) => setOffsetX(v)}
            min={-0.3}
            max={0.3}
            step={0.005}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">
            Vertical: {Math.round(offsetY * 100)}%
          </label>
          <Slider
            value={[offsetY]}
            onValueChange={([v]) => setOffsetY(v)}
            min={0.05}
            max={0.70}
            step={0.005}
          />
        </div>
      </div>

      {/* Confirm */}
      <div className="flex justify-end pt-2 border-t border-border">
        <Button size="sm" onClick={() => onConfirm({ scale, offsetX, offsetY })} className="gap-2">
          <Check className="h-3.5 w-3.5" /> Looks Good — Generate
        </Button>
      </div>
    </div>
  );
};
