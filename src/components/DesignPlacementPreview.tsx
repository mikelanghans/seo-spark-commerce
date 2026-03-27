import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Move, ZoomIn, Check, RotateCcw } from "lucide-react";

export interface PlacementParams {
  scale: number;    // 0.15 – 0.65
  offsetY: number;  // 0.05 – 0.70 (fraction of canvas height for design top)
}

interface Props {
  open: boolean;
  onConfirm: (params: PlacementParams) => void;
  onCancel: () => void;
  templateDataUrl: string;
  designDataUrl: string;
  isDarkGarment?: boolean;
  designStyle?: string;
}

const DEFAULT_SCALE = 0.35;
const DEFAULT_OFFSET_Y = 0.25;
const MIN_SCALE = 0.15;
const MAX_SCALE = 0.65;
const MIN_OFFSET = 0.05;
const MAX_OFFSET = 0.70;

export const DesignPlacementPreview = ({
  open,
  onConfirm,
  onCancel,
  templateDataUrl,
  designDataUrl,
  isDarkGarment,
  designStyle,
}: Props) => {
  const defaultScale = designStyle === "text-only" ? 0.30 : DEFAULT_SCALE;
  const [scale, setScale] = useState(defaultScale);
  const [offsetY, setOffsetY] = useState(DEFAULT_OFFSET_Y);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [templateImg, setTemplateImg] = useState<HTMLImageElement | null>(null);
  const [designImg, setDesignImg] = useState<HTMLImageElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragStart = useRef<{ y: number; startOffsetY: number }>({ y: 0, startOffsetY: 0 });
  const resizeStart = useRef<{ y: number; startScale: number }>({ y: 0, startScale: 0 });

  // Load images
  useEffect(() => {
    if (!open) return;
    const loadImg = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    Promise.all([loadImg(templateDataUrl), loadImg(designDataUrl)]).then(
      ([t, d]) => {
        setTemplateImg(t);
        setDesignImg(d);
      }
    );
  }, [open, templateDataUrl, designDataUrl]);

  // Draw preview
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !templateImg || !designImg) return;

    const displayW = canvas.width;
    const displayH = canvas.height;

    ctx.clearRect(0, 0, displayW, displayH);

    // Draw template
    const tScale = Math.min(displayW / templateImg.width, displayH / templateImg.height);
    const tw = templateImg.width * tScale;
    const th = templateImg.height * tScale;
    const tx = (displayW - tw) / 2;
    const ty = (displayH - th) / 2;
    ctx.drawImage(templateImg, tx, ty, tw, th);

    // Draw design
    const designW = tw * scale;
    const designH = designW * (designImg.height / designImg.width);
    const dx = tx + (tw - designW) / 2;
    const dy = ty + th * offsetY;

    // Semi-transparent underbase indicator for dark garments
    if (isDarkGarment) {
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(dx - 4, dy - 4, designW + 8, designH + 8);
      ctx.globalAlpha = 1;
    }

    ctx.drawImage(designImg, dx, dy, designW, designH);

    // Draw placement frame (dashed border like the reference)
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(dx - 2, dy - 2, designW + 4, designH + 4);
    ctx.setLineDash([]);

    // Corner handles (green squares like the reference)
    const handleSize = 8;
    ctx.fillStyle = "#22c55e";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    const corners = [
      [dx - 2, dy - 2],
      [dx + designW + 2 - handleSize, dy - 2],
      [dx - 2, dy + designH + 2 - handleSize],
      [dx + designW + 2 - handleSize, dy + designH + 2 - handleSize],
    ];
    corners.forEach(([cx, cy]) => {
      ctx.fillRect(cx, cy, handleSize, handleSize);
      ctx.strokeRect(cx, cy, handleSize, handleSize);
    });

    // Center move indicator
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.arc(dx + designW / 2, dy + designH / 2, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⊕", dx + designW / 2, dy + designH / 2);
  }, [templateImg, designImg, scale, offsetY, isDarkGarment]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Set canvas size
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvasRef.current.width = rect.width * dpr;
    canvasRef.current.height = rect.height * dpr;
    canvasRef.current.style.width = `${rect.width}px`;
    canvasRef.current.style.height = `${rect.height}px`;
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) ctx.scale(dpr, dpr);
    // Reset to logical size for drawing
    canvasRef.current.width = rect.width;
    canvasRef.current.height = rect.height;
    draw();
  }, [templateImg, draw]);

  const getCanvasY = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return clientY - rect.top;
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current || !templateImg || !designImg) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const mx = clientX - rect.left;
    const my = clientY - rect.top;

    const tScale = Math.min(canvas.width / templateImg.width, canvas.height / templateImg.height);
    const tw = templateImg.width * tScale;
    const th = templateImg.height * tScale;
    const tx = (canvas.width - tw) / 2;
    const ty = (canvas.height - th) / 2;

    const designW = tw * scale;
    const designH = designW * (designImg.height / designImg.width);
    const dx = tx + (tw - designW) / 2;
    const dy = ty + th * offsetY;

    // Check if near bottom-right corner (resize handle)
    const cornerX = dx + designW;
    const cornerY = dy + designH;
    if (Math.abs(mx - cornerX) < 20 && Math.abs(my - cornerY) < 20) {
      setResizing(true);
      resizeStart.current = { y: my, startScale: scale };
      e.preventDefault();
      return;
    }

    // Check if inside design area (drag)
    if (mx >= dx && mx <= dx + designW && my >= dy && my <= dy + designH) {
      setDragging(true);
      dragStart.current = { y: my, startOffsetY: offsetY };
      e.preventDefault();
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current || !templateImg) return;
    const my = getCanvasY(e);
    const canvas = canvasRef.current;
    const tScale = Math.min(canvas.width / templateImg.width, canvas.height / templateImg.height);
    const th = templateImg.height * tScale;

    if (dragging) {
      const deltaY = (my - dragStart.current.y) / th;
      const newOffset = Math.max(MIN_OFFSET, Math.min(MAX_OFFSET, dragStart.current.startOffsetY + deltaY));
      setOffsetY(newOffset);
    }

    if (resizing) {
      const deltaY = (my - resizeStart.current.y) / th;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, resizeStart.current.startScale + deltaY * 1.5));
      setScale(newScale);
    }
  };

  const handlePointerUp = () => {
    setDragging(false);
    setResizing(false);
  };

  const handleReset = () => {
    setScale(defaultScale);
    setOffsetY(DEFAULT_OFFSET_Y);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Move className="h-4 w-4 text-primary" />
            Adjust Design Placement
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Drag the design to reposition, use corner handles to resize, or adjust with sliders below.
        </p>

        <div
          ref={containerRef}
          className="relative w-full rounded-lg border border-border bg-secondary overflow-hidden"
          style={{ height: 380 }}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-move"
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          />
        </div>

        {/* Sliders */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <ZoomIn className="h-3 w-3" /> Scale
              </label>
              <span className="text-[11px] font-mono text-muted-foreground">
                {Math.round(scale * 100)}%
              </span>
            </div>
            <Slider
              value={[scale]}
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={0.01}
              onValueChange={([v]) => setScale(v)}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <Move className="h-3 w-3" /> Vertical
              </label>
              <span className="text-[11px] font-mono text-muted-foreground">
                {Math.round(offsetY * 100)}%
              </span>
            </div>
            <Slider
              value={[offsetY]}
              min={MIN_OFFSET}
              max={MAX_OFFSET}
              step={0.01}
              onValueChange={([v]) => setOffsetY(v)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1 text-xs">
            <RotateCcw className="h-3 w-3" /> Reset
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => onConfirm({ scale, offsetY })} className="gap-1">
              <Check className="h-3.5 w-3.5" /> Confirm & Generate
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
