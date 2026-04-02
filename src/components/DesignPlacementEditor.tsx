import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { RotateCw, Check, Loader2 } from "lucide-react";
import type { DesignPlacement } from "@/lib/mockupComposition";
import { ensureImageDataUrl } from "@/lib/mockupComposition";
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
  const [offsetX, setOffsetX] = useState(initialPlacement?.offsetX ?? 0.015);
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

  // Strip background from design for transparent preview
  useEffect(() => {
    let cancelled = false;
    setProcessingDesign(true);
    smartRemoveBackground(designUrl)
      .then((base64) => {
        if (!cancelled) setProcessedDesignUrl(ensureImageDataUrl(base64));
      })
      .catch(() => {
        if (!cancelled) setProcessedDesignUrl(designUrl);
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
    setOffsetX(0.015);
    setOffsetY(0.20);
  };

  // Drag handling
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
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
    setOffsetX(Math.max(-0.3, Math.min(0.3, dragStartRef.current.startOffsetX + dx)));
    setOffsetY(Math.max(0.05, Math.min(0.7, dragStartRef.current.startOffsetY + dy)));
  }, [dragging]);

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
