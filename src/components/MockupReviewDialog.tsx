import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ThumbsUp, ThumbsDown, ArrowDownFromLine, ArrowUpFromLine, Palette, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface MockupItem {
  id: string;
  image_url: string;
  color_name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  mockups: MockupItem[];
  productId: string;
  organizationId: string;
  userId: string;
}

interface FeedbackState {
  rating: "good" | "bad" | "neutral";
  sizeFeedback: "too-large" | "too-small" | "just-right" | null;
  colorAccuracy: "accurate" | "inaccurate" | null;
  notes: string;
}

export const MockupReviewDialog = ({ open, onClose, mockups, productId, organizationId, userId }: Props) => {
  const [feedbackMap, setFeedbackMap] = useState<Record<string, FeedbackState>>({});
  const [saving, setSaving] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const getFeedback = (id: string): FeedbackState =>
    feedbackMap[id] || { rating: "neutral", sizeFeedback: null, colorAccuracy: null, notes: "" };

  const updateFeedback = (id: string, partial: Partial<FeedbackState>) => {
    setFeedbackMap((prev) => ({
      ...prev,
      [id]: { ...getFeedback(id), ...partial },
    }));
  };

  const handleSubmitAll = async () => {
    const entries = Object.entries(feedbackMap).filter(
      ([, fb]) => fb.rating !== "neutral" || fb.sizeFeedback || fb.colorAccuracy || fb.notes.trim()
    );
    if (entries.length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      const rows = entries.map(([imageId, fb]) => {
        const mockup = mockups.find((m) => m.id === imageId);
        return {
          product_image_id: imageId,
          product_id: productId,
          organization_id: organizationId,
          user_id: userId,
          rating: fb.rating,
          size_feedback: fb.sizeFeedback,
          color_accuracy: fb.colorAccuracy,
          notes: fb.notes.trim() || null,
          color_name: mockup?.color_name || "",
        };
      });

      const { error } = await supabase.from("mockup_feedback" as any).insert(rows);
      if (error) throw error;
      toast.success(`Saved feedback for ${rows.length} mockup${rows.length !== 1 ? "s" : ""}`);
      onClose();
    } catch {
      toast.error("Failed to save feedback");
    } finally {
      setSaving(false);
    }
  };

  if (mockups.length === 0) return null;

  const current = mockups[activeIdx];
  const fb = getFeedback(current.id);
  const reviewedCount = Object.values(feedbackMap).filter(
    (f) => f.rating !== "neutral" || f.sizeFeedback || f.colorAccuracy || f.notes.trim()
  ).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Review Mockups ({activeIdx + 1}/{mockups.length})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Image preview */}
          <div className="rounded-lg border border-border bg-secondary overflow-hidden">
            <img
              src={current.image_url}
              alt={current.color_name}
              className="w-full object-contain max-h-64"
              loading="lazy"
            />
          </div>
          <p className="text-center text-xs font-medium">{current.color_name}</p>

          {/* Quick rating */}
          <div className="flex justify-center gap-3">
            <Button
              size="sm"
              variant={fb.rating === "good" ? "default" : "outline"}
              className="gap-1"
              onClick={() => updateFeedback(current.id, { rating: fb.rating === "good" ? "neutral" : "good" })}
            >
              <ThumbsUp className="h-3.5 w-3.5" /> Good
            </Button>
            <Button
              size="sm"
              variant={fb.rating === "bad" ? "default" : "outline"}
              className="gap-1"
              onClick={() => updateFeedback(current.id, { rating: fb.rating === "bad" ? "neutral" : "bad" })}
            >
              <ThumbsDown className="h-3.5 w-3.5" /> Needs Work
            </Button>
          </div>

          {/* Detail fields — always visible for quick access */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Design Size</p>
              <div className="flex flex-col gap-1">
                {([
                  { value: "too-large" as const, label: "Too Large", icon: ArrowUpFromLine },
                  { value: "just-right" as const, label: "Just Right", icon: ThumbsUp },
                  { value: "too-small" as const, label: "Too Small", icon: ArrowDownFromLine },
                ]).map(({ value, label, icon: Icon }) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={fb.sizeFeedback === value ? "default" : "outline"}
                    className="justify-start gap-1 text-[11px] h-7"
                    onClick={() => updateFeedback(current.id, { sizeFeedback: fb.sizeFeedback === value ? null : value })}
                  >
                    <Icon className="h-3 w-3" /> {label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Color Accuracy</p>
              <div className="flex flex-col gap-1">
                <Button
                  size="sm"
                  variant={fb.colorAccuracy === "accurate" ? "default" : "outline"}
                  className="justify-start gap-1 text-[11px] h-7"
                  onClick={() => updateFeedback(current.id, { colorAccuracy: fb.colorAccuracy === "accurate" ? null : "accurate" })}
                >
                  <Palette className="h-3 w-3" /> Accurate
                </Button>
                <Button
                  size="sm"
                  variant={fb.colorAccuracy === "inaccurate" ? "default" : "outline"}
                  className="justify-start gap-1 text-[11px] h-7"
                  onClick={() => updateFeedback(current.id, { colorAccuracy: fb.colorAccuracy === "inaccurate" ? null : "inaccurate" })}
                >
                  <Palette className="h-3 w-3" /> Off
                </Button>
              </div>
            </div>
          </div>

          <Textarea
            value={fb.notes}
            onChange={(e) => updateFeedback(current.id, { notes: e.target.value })}
            placeholder="Optional notes (e.g. ghost design, shifted placement...)"
            className="h-14 text-xs"
          />

          {/* Navigation */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex gap-1">
              {mockups.map((_, i) => (
                <button
                  key={i}
                  className={cn(
                    "h-2 w-2 rounded-full transition-colors",
                    i === activeIdx ? "bg-primary" : "bg-muted-foreground/30"
                  )}
                  onClick={() => setActiveIdx(i)}
                />
              ))}
            </div>
            <div className="flex gap-2">
              {activeIdx < mockups.length - 1 ? (
                <Button size="sm" onClick={() => setActiveIdx(activeIdx + 1)}>
                  Next
                </Button>
              ) : (
                <Button size="sm" onClick={handleSubmitAll} disabled={saving}>
                  {saving ? "Saving..." : reviewedCount > 0 ? `Submit (${reviewedCount})` : "Skip"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
