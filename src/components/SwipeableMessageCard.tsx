import { useState, useRef, useEffect, type TouchEvent, type MouseEvent } from "react";
import { Check, X, Paintbrush, Eye, RefreshCw, Loader2, Pencil, MessageSquare, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface SwipeableMessageCardProps {
  id: string;
  messageText: string;
  designUrl: string | null;
  hasProduct: boolean;
  isKept: boolean;
  isGeneratingDesign: boolean;
  isRefining: boolean;
  disableDesignActions: boolean;
  onKeep: (id: string) => void;
  onDiscard: (id: string) => void;
  onEdit: (id: string, newText: string) => void;
  onRefine: (id: string, feedback: string) => void;
  onGenerateDesign: (id: string) => void;
  onPreviewDesign: (id: string) => void;
}

const SWIPE_THRESHOLD = 80;

export const SwipeableMessageCard = ({
  id,
  messageText,
  designUrl,
  hasProduct,
  isKept,
  isGeneratingDesign,
  isRefining,
  disableDesignActions,
  onKeep,
  onDiscard,
  onEdit,
  onRefine,
  onGenerateDesign,
  onPreviewDesign,
}: SwipeableMessageCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(messageText);
  const [showRefine, setShowRefine] = useState(false);
  const [refineFeedback, setRefineFeedback] = useState("");
  const [designVariant, setDesignVariant] = useState<"dark-on-light" | "light-on-dark" | "both">("light-on-dark");
  const inputRef = useRef<HTMLInputElement>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isExiting, setIsExiting] = useState<"left" | "right" | null>(null);
  const wasRefining = useRef(false);

  // Auto-close refine panel when refining completes
  useEffect(() => {
    if (isRefining) {
      wasRefining.current = true;
    } else if (wasRefining.current) {
      wasRefining.current = false;
      setShowRefine(false);
      setRefineFeedback("");
    }
  }, [isRefining]);
  const startX = useRef(0);
  const startY = useRef(0);
  const isHorizontal = useRef<boolean | null>(null);

  const handleStart = (clientX: number, clientY: number) => {
    if (hasProduct) return;
    startX.current = clientX;
    startY.current = clientY;
    isHorizontal.current = null;
    setIsDragging(true);
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging || hasProduct) return;

    const dx = clientX - startX.current;
    const dy = clientY - startY.current;

    // Determine scroll direction on first significant move
    if (isHorizontal.current === null) {
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isHorizontal.current = Math.abs(dx) > Math.abs(dy);
      }
      return;
    }

    if (!isHorizontal.current) return;

    setOffsetX(dx);
  };

  const handleEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    if (Math.abs(offsetX) > SWIPE_THRESHOLD) {
      const direction = offsetX > 0 ? "right" : "left";
      setIsExiting(direction);
      setTimeout(() => {
        if (direction === "right") {
          onKeep(id);
        } else {
          onDiscard(id);
        }
        setOffsetX(0);
        setIsExiting(null);
      }, 250);
    } else {
      setOffsetX(0);
    }
  };

  // Touch handlers
  const onTouchStart = (e: TouchEvent) => handleStart(e.touches[0].clientX, e.touches[0].clientY);
  const onTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX, e.touches[0].clientY);
  const onTouchEnd = () => handleEnd();

  // Mouse handlers for desktop
  const onMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    handleStart(e.clientX, e.clientY);
  };
  const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
  const onMouseUp = () => handleEnd();
  const onMouseLeave = () => { if (isDragging) handleEnd(); };

  const progress = Math.min(Math.abs(offsetX) / SWIPE_THRESHOLD, 1);
  const isSwipingRight = offsetX > 0;
  const isSwipingLeft = offsetX < 0;
  const hasDesign = !!designUrl;

  return (
    <div className="relative rounded-lg">
      {/* Swipeable card area */}
      <div className="relative overflow-hidden rounded-lg">
        {/* Background indicators */}
        <div
          className={cn(
            "absolute inset-0 flex items-center rounded-lg transition-opacity",
            isSwipingRight ? "justify-start pl-4 bg-emerald-500/20" : "opacity-0"
          )}
          style={{ opacity: isSwipingRight ? progress : 0 }}
        >
          <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm">
            <Check className="h-5 w-5" />
            Keep
          </div>
        </div>
        <div
          className={cn(
            "absolute inset-0 flex items-center rounded-lg transition-opacity",
            isSwipingLeft ? "justify-end pr-4 bg-destructive/20" : "opacity-0"
          )}
          style={{ opacity: isSwipingLeft ? progress : 0 }}
        >
          <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
            Discard
            <X className="h-5 w-5" />
          </div>
        </div>

        {/* Card content */}
        <div
        className={cn(
          "relative flex items-center gap-3 rounded-lg border p-3 bg-card cursor-grab active:cursor-grabbing select-none",
          isKept
            ? "border-emerald-500/50 bg-emerald-500/5"
            : "border-border hover:bg-muted/50",
          hasProduct && "opacity-60 cursor-default",
          isExiting === "left" && "animate-slide-out-left",
          isExiting === "right" && "animate-slide-out-right"
        )}
        style={{
          transform: isExiting
            ? undefined
            : `translateX(${offsetX}px) rotate(${offsetX * 0.02}deg)`,
          transition: isDragging ? "none" : "transform 0.3s ease",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        {/* Thumbs up / down */}
        {!hasProduct && !isEditing && (
          <div className="flex flex-col gap-0.5 shrink-0">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (!isKept) onKeep(id); }}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                isKept
                  ? "text-emerald-500 bg-emerald-500/10"
                  : "text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10"
              )}
              title="Keep"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDiscard(id); }}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-destructive hover:bg-destructive/10"
              title="Discard"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {hasProduct && (
          <div className="shrink-0 w-1.5 h-8 rounded-full bg-muted-foreground/20" />
        )}

        {/* Design thumbnail */}
        {hasDesign ? (
          <button
            type="button"
            onClick={() => onPreviewDesign(id)}
            className="shrink-0 rounded-md border border-border overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all"
          >
            <img
              src={designUrl!}
              alt={messageText}
              className="h-12 w-12 object-cover"
            />
          </button>
        ) : (
          <div className="shrink-0 h-12 w-12 rounded-md border border-dashed border-border flex items-center justify-center">
            <Paintbrush className="h-4 w-4 text-muted-foreground" />
          </div>
        )}

        {/* Message text / edit mode */}
        {isEditing ? (
          <form
            className="flex-1 flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (editText.trim() && editText !== messageText) {
                onEdit(id, editText.trim());
              }
              setIsEditing(false);
            }}
          >
            <Input
              ref={inputRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="h-8 text-sm"
              autoFocus
              onBlur={() => {
                if (editText.trim() && editText !== messageText) {
                  onEdit(id, editText.trim());
                }
                setIsEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setEditText(messageText);
                  setIsEditing(false);
                }
              }}
            />
          </form>
        ) : (
          <span
            className="flex-1 text-sm font-medium leading-snug"
            onDoubleClick={() => {
              if (!hasProduct) {
                setEditText(messageText);
                setIsEditing(true);
              }
            }}
          >
            {messageText}
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {hasProduct && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              Has product
            </span>
          )}
          {hasDesign && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPreviewDesign(id)}
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
          )}
          {!hasProduct && !isEditing && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setEditText(messageText);
                setIsEditing(true);
              }}
              title="Edit message"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {!hasProduct && !isEditing && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={isRefining}
              onClick={() => setShowRefine(!showRefine)}
              title="Regenerate with feedback"
            >
              {isRefining ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MessageSquare className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
          {!hasProduct && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDesignVariant((v) => 
                  v === "light-on-dark" ? "dark-on-light" : v === "dark-on-light" ? "both" : "light-on-dark"
                );
              }}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/50 shrink-0"
              title={
                designVariant === "dark-on-light" ? "Light garment (dark ink)" 
                : designVariant === "light-on-dark" ? "Dark garment (light ink)" 
                : "Both variants"
              }
            >
              {designVariant === "dark-on-light" ? (
                <Sun className="h-3 w-3" />
              ) : designVariant === "light-on-dark" ? (
                <Moon className="h-3 w-3" />
              ) : (
                <Layers className="h-3 w-3" />
              )}
            </button>
          )}
          {!hasProduct && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={isGeneratingDesign || disableDesignActions}
              onClick={() => onGenerateDesign(id, designVariant)}
              title={hasDesign ? "Regenerate design" : "Generate design"}
            >
              {isGeneratingDesign ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : hasDesign ? (
                <RefreshCw className="h-3.5 w-3.5" />
              ) : (
                <Paintbrush className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>
      </div>
      </div>

      {/* Refine feedback panel - onMouseDown stopped to prevent swipe interference */}
      {showRefine && (
        <div className="mt-1 rounded-lg border border-border bg-card p-3 space-y-2" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
          <p className="text-xs text-muted-foreground">
            What should change? (e.g. "make it shorter", "more sarcastic", "less aggressive")
          </p>
          <Textarea
            value={refineFeedback}
            onChange={(e) => setRefineFeedback(e.target.value)}
            placeholder="Your feedback..."
            className="min-h-[60px] text-sm"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              disabled={isRefining}
              onClick={() => {
                setShowRefine(false);
                setRefineFeedback("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!refineFeedback.trim() || isRefining}
              onClick={() => {
                onRefine(id, refineFeedback.trim());
              }}
              className="gap-1"
            >
              {isRefining ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {isRefining ? "Generating…" : "Regenerate"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
