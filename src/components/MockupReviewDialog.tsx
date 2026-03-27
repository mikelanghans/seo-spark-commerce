import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ThumbsUp, ArrowDownFromLine, ArrowUpFromLine, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

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

type SizeFeedback = "too-large" | "too-small" | "just-right" | null;

export const MockupReviewDialog = ({ open, onClose, mockups, productId, organizationId, userId }: Props) => {
  const [sizeFeedback, setSizeFeedback] = useState<SizeFeedback>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!sizeFeedback && !notes.trim()) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      // Save one general feedback entry (using first mockup as reference)
      const { error } = await supabase.from("mockup_feedback" as any).insert({
        product_image_id: mockups[0]?.id,
        product_id: productId,
        organization_id: organizationId,
        user_id: userId,
        rating: sizeFeedback === "just-right" ? "good" : sizeFeedback ? "bad" : "neutral",
        size_feedback: sizeFeedback,
        notes: notes.trim() || null,
        color_name: "general",
      });
      if (error) throw error;
      toast.success("Thanks! Your feedback will improve future mockups.");
      onClose();
    } catch {
      toast.error("Failed to save feedback");
    } finally {
      setSaving(false);
    }
  };

  if (mockups.length === 0) return null;

  // Show a small grid of generated mockups for context
  const previewMockups = mockups.slice(0, 4);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            How do the mockups look?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quick preview grid */}
          <div className="grid grid-cols-4 gap-1.5 rounded-lg border border-border bg-secondary p-2">
            {previewMockups.map((m) => (
              <div key={m.id} className="aspect-square rounded overflow-hidden">
                <img src={m.image_url} alt={m.color_name} className="h-full w-full object-contain" loading="lazy" />
              </div>
            ))}
            {mockups.length > 4 && (
              <div className="col-span-4 text-center text-[10px] text-muted-foreground pt-1">
                +{mockups.length - 4} more
              </div>
            )}
          </div>

          {/* Design size — one-time general feedback */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Overall design size on the garment</p>
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

          {/* General notes */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Anything else? (optional)</p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Design placement is too high, colors look washed out…"
              className="h-14 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Skip
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving…" : "Submit"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
