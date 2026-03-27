import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Move, ZoomIn, Check, RotateCcw, ArrowLeftRight, ArrowUpDown } from "lucide-react";

export interface PlacementParams {
  scale: number;    // 0.15 – 0.65
  offsetX: number;  // -0.30 – 0.30 (fraction of canvas width, 0 = centered)
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
const DEFAULT_OFFSET_X = 0;
const DEFAULT_OFFSET_Y = 0.25;
const MIN_SCALE = 0.15;
const MAX_SCALE = 0.90;
const MIN_OFFSET_X = -0.30;
const MAX_OFFSET_X = 0.30;
const MIN_OFFSET_Y = 0.05;
const MAX_OFFSET_Y = 0.70;

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
  const [offsetX, setOffsetX] = useState(DEFAULT_OFFSET_X);
  const [offsetY, setOffsetY] = useState(DEFAULT_OFFSET_Y);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [templateImg, setTemplateImg] = useState<HTMLImageElement | null>(null);
  const [designImg, setDesignImg] = useState<HTMLImageElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragStart = useRef<{ x: number; y: number; startOffsetX: number; startOffsetY: number }>({ x: 0, y: 0, startOffsetX: 0, startOffsetY: 0 });
  const resizeStart = useRef<{ y: number; startScale: number }>({ y: 0, startScale: 0 });

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
      ([t, d]) => { setTemplateImg(t); setDesignImg(d); }
    );
  }, [open, templateDataUrl, designDataUrl]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !templateImg || !designImg) return;

    const displayW = canvas.width;
    const displayH = canvas.height;
    ctx.clearRect(0, 0, displayW, displayH);

    const tScale = Math.min(displayW / templateImg.width, displayH / templateImg.height);
    const tw = templateImg.width * tScale;
    const th = templateImg.height * tScale;
    const tx = (displayW - tw) / 2;
    const ty = (displayH - th) / 2;
    ctx.drawImage(templateImg, tx, ty, tw, th);

    const designW = tw * scale;
    const designH = designW * (designImg.height / designImg.width);
    const dx = tx + (tw - designW) / 2 + tw * offsetX;
    const dy = ty + th * offsetY;

    if (isDarkGarment) {
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(dx - 4, dy - 4, designW + 8, designH + 8);
      ctx.globalAlpha = 1;
    }

    ctx.drawImage(designImg, dx, dy, designW, designH);

    // Dashed placement frame
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(dx - 2, dy - 2, designW + 4, designH + 4);
    ctx.setLineDash([]);

    // Corner handles
    const hs = 8;
    ctx.fillStyle = "#22c55e";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    for (const [cx, cy] of [
      [dx - 2, dy - 2],
      [dx + designW + 2 - hs, dy - 2],
      [dx - 2, dy + designH + 2 - hs],
      [dx + designW + 2 - hs, dy + designH + 2 - hs],
    ]) {
      ctx.fillRect(cx, cy, hs, hs);
      ctx.strokeRect(cx, cy, hs, hs);
    }

    // Center move icon
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.arc(dx + designW / 2, dy + designH / 2, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⊕", dx + designW / 2, dy + designH / 2);
  }, [templateImg, designImg, scale, offsetX, offsetY, isDarkGarment]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    canvasRef.current.width = rect.width;
    canvasRef.current.height = rect.height;
    draw();
  }, [templateImg, draw]);

  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current || !templateImg || !designImg) return;
    const canvas = canvasRef.current;
    const { x: mx, y: my } = getCanvasPos(e);

    const tScale = Math.min(canvas.width / templateImg.width, canvas.height / templateImg.height);
    const tw = templateImg.width * tScale;
    const th = templateImg.height * tScale;
    const tx = (canvas.width - tw) / 2;
    const ty = (canvas.height - th) / 2;

    const designW = tw * scale;
    const designH = designW * (designImg.height / designImg.width);
    const dx = tx + (tw - designW) / 2 + tw * offsetX;
    const dy = ty + th * offsetY;

    // Resize handle (any corner)
    const corners = [
      [dx, dy], [dx + designW, dy],
      [dx, dy + designH], [dx + designW, dy + designH],
    ];
    if (corners.some(([cx, cy]) => Math.abs(mx - cx) < 20 && Math.abs(my - cy) < 20)) {
      setResizing(true);
      resizeStart.current = { y: my, startScale: scale };
      e.preventDefault();
      return;
    }

    // Drag (inside design)
    if (mx >= dx && mx <= dx + designW && my >= dy && my <= dy + designH) {
      setDragging(true);
      dragStart.current = { x: mx, y: my, startOffsetX: offsetX, startOffsetY: offsetY };
      e.preventDefault();
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current || !templateImg) return;
    const { x: mx, y: my } = getCanvasPos(e);
    const canvas = canvasRef.current;
    const tScale = Math.min(canvas.width / templateImg.width, canvas.height / templateImg.height);
    const tw = templateImg.width * tScale;
    const th = templateImg.height * tScale;

    if (dragging) {
      const deltaX = (mx - dragStart.current.x) / tw;
      const deltaY = (my - dragStart.current.y) / th;
      setOffsetX(Math.max(MIN_OFFSET_X, Math.min(MAX_OFFSET_X, dragStart.current.startOffsetX + deltaX)));
      setOffsetY(Math.max(MIN_OFFSET_Y, Math.min(MAX_OFFSET_Y, dragStart.current.startOffsetY + deltaY)));
    }

    if (resizing) {
      const deltaY = (my - resizeStart.current.y) / th;
      setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, resizeStart.current.startScale + deltaY * 1.5)));
    }
  };

  const handlePointerUp = () => { setDragging(false); setResizing(false); };

  const handleReset = () => {
    setScale(defaultScale);
    setOffsetX(DEFAULT_OFFSET_X);
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
          Drag to reposition, corner handles to resize, or fine-tune with sliders.
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
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <ZoomIn className="h-3 w-3" /> Scale
              </label>
              <span className="text-[11px] font-mono text-muted-foreground">
                {Math.round(scale * 100)}%
              </span>
            </div>
            <Slider value={[scale]} min={MIN_SCALE} max={MAX_SCALE} step={0.01} onValueChange={([v]) => setScale(v)} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <ArrowLeftRight className="h-3 w-3" /> Horizontal
              </label>
              <span className="text-[11px] font-mono text-muted-foreground">
                {offsetX > 0 ? "+" : ""}{Math.round(offsetX * 100)}
              </span>
            </div>
            <Slider value={[offsetX]} min={MIN_OFFSET_X} max={MAX_OFFSET_X} step={0.01} onValueChange={([v]) => setOffsetX(v)} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <ArrowUpDown className="h-3 w-3" /> Vertical
              </label>
              <span className="text-[11px] font-mono text-muted-foreground">
                {Math.round(offsetY * 100)}%
              </span>
            </div>
            <Slider value={[offsetY]} min={MIN_OFFSET_Y} max={MAX_OFFSET_Y} step={0.01} onValueChange={([v]) => setOffsetY(v)} />
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
            <Button size="sm" onClick={() => onConfirm({ scale, offsetX, offsetY })} className="gap-1">
              <Check className="h-3.5 w-3.5" /> Confirm & Generate
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
