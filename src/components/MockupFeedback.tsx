import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ThumbsUp, ThumbsDown, MessageSquare, ArrowDownFromLine, ArrowUpFromLine, Palette } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  productImageId: string;
  productId: string;
  organizationId: string;
  userId: string;
  colorName: string;
  /** Compact inline mode for card overlay */
  compact?: boolean;
}

type Rating = "good" | "bad" | "neutral";
type SizeFeedback = "too-large" | "too-small" | "just-right" | null;
type ColorAccuracy = "accurate" | "inaccurate" | null;

export const MockupFeedback = ({
  productImageId,
  productId,
  organizationId,
  userId,
  colorName,
  compact = true,
}: Props) => {
  const [rating, setRating] = useState<Rating>("neutral");
  const [showDetail, setShowDetail] = useState(false);
  const [sizeFeedback, setSizeFeedback] = useState<SizeFeedback>(null);
  const [colorAccuracy, setColorAccuracy] = useState<ColorAccuracy>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleQuickRate = async (r: Rating) => {
    setRating(r);
    if (r === "bad") {
      setShowDetail(true);
      return;
    }
    // Quick save for thumbs up
    try {
      await supabase.from("mockup_feedback" as any).insert({
        product_image_id: productImageId,
        product_id: productId,
        organization_id: organizationId,
        user_id: userId,
        rating: r,
        color_name: colorName,
      });
      setSubmitted(true);
    } catch {
      // silent
    }
  };

  const handleDetailedSubmit = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("mockup_feedback" as any).insert({
        product_image_id: productImageId,
        product_id: productId,
        organization_id: organizationId,
        user_id: userId,
        rating,
        size_feedback: sizeFeedback,
        color_accuracy: colorAccuracy,
        notes: notes.trim() || null,
        color_name: colorName,
      });
      if (error) throw error;
      toast.success("Feedback saved — thanks!");
      setShowDetail(false);
      setSubmitted(true);
    } catch {
      toast.error("Failed to save feedback");
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <span className="text-[10px] text-muted-foreground italic">
        {rating === "good" ? "👍" : "📝"} Noted
      </span>
    );
  }

  return (
    <>
      {compact && (
        <div className="flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              "h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity",
              rating === "good" && "opacity-100 text-green-500"
            )}
            onClick={(e) => { e.stopPropagation(); handleQuickRate("good"); }}
            title="Looks good"
          >
            <ThumbsUp className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              "h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity",
              rating === "bad" && "opacity-100 text-destructive"
            )}
            onClick={(e) => { e.stopPropagation(); handleQuickRate("bad"); }}
            title="Needs improvement"
          >
            <ThumbsDown className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); setShowDetail(true); }}
            title="Detailed feedback"
          >
            <MessageSquare className="h-3 w-3" />
          </Button>
        </div>
      )}

      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Mockup Feedback — {colorName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Size feedback */}
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Design Size</p>
              <div className="flex gap-2">
                {([
                  { value: "too-large" as const, label: "Too Large", icon: ArrowUpFromLine },
                  { value: "just-right" as const, label: "Just Right", icon: ThumbsUp },
                  { value: "too-small" as const, label: "Too Small", icon: ArrowDownFromLine },
                ]).map(({ value, label, icon: Icon }) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={sizeFeedback === value ? "default" : "outline"}
                    className="flex-1 gap-1 text-xs"
                    onClick={() => setSizeFeedback(sizeFeedback === value ? null : value)}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Color accuracy */}
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Color Accuracy</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={colorAccuracy === "accurate" ? "default" : "outline"}
                  className="flex-1 gap-1 text-xs"
                  onClick={() => setColorAccuracy(colorAccuracy === "accurate" ? null : "accurate")}
                >
                  <Palette className="h-3 w-3" />
                  Accurate
                </Button>
                <Button
                  size="sm"
                  variant={colorAccuracy === "inaccurate" ? "default" : "outline"}
                  className="flex-1 gap-1 text-xs"
                  onClick={() => setColorAccuracy(colorAccuracy === "inaccurate" ? null : "inaccurate")}
                >
                  <Palette className="h-3 w-3" />
                  Off
                </Button>
              </div>
            </div>

            {/* Free-text notes */}
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Notes (optional)</p>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. ghost design visible, design shifted left..."
                className="h-16 text-xs"
              />
            </div>

            <Button
              className="w-full"
              size="sm"
              onClick={handleDetailedSubmit}
              disabled={saving}
            >
              {saving ? "Saving..." : "Submit Feedback"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
