import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Loader2, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ISSUE_OPTIONS = [
  { value: "color-off", label: "Color is wrong" },
  { value: "too-large", label: "Design too large" },
  { value: "too-small", label: "Design too small" },
  { value: "ghosting", label: "Ghost / artifacts" },
  { value: "placement", label: "Placement is off" },
  { value: "quality", label: "Low quality" },
] as const;

type IssueType = (typeof ISSUE_OPTIONS)[number]["value"];

interface Props {
  productImageId: string;
  productId: string;
  organizationId: string;
  userId: string;
  colorName: string;
  imageUrl: string;
  onRegenerate?: (colorName: string, feedback: string) => Promise<void>;
}

export const MockupFeedback = ({
  productImageId,
  productId,
  organizationId,
  userId,
  colorName,
  imageUrl,
  onRegenerate,
}: Props) => {
  const [showDialog, setShowDialog] = useState(false);
  const [issues, setIssues] = useState<Set<IssueType>>(new Set());
  const [notes, setNotes] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  const toggleIssue = (issue: IssueType) => {
    setIssues((prev) => {
      const next = new Set(prev);
      if (next.has(issue)) next.delete(issue);
      else next.add(issue);
      return next;
    });
  };

  const buildFeedbackText = () => {
    const parts: string[] = [];
    for (const issue of issues) {
      const label = ISSUE_OPTIONS.find((o) => o.value === issue)?.label;
      if (label) parts.push(label);
    }
    if (notes.trim()) parts.push(notes.trim());
    return parts.join(". ");
  };

  const handleRegenerate = async () => {
    const feedbackText = buildFeedbackText();
    if (!feedbackText) {
      toast.error("Please select at least one issue or add a note.");
      return;
    }

    setRegenerating(true);
    try {
      // Save feedback to DB for training
      await supabase.from("mockup_feedback" as any).insert({
        product_image_id: productImageId,
        product_id: productId,
        organization_id: organizationId,
        user_id: userId,
        rating: "bad",
        size_feedback: issues.has("too-large") ? "too-large" : issues.has("too-small") ? "too-small" : null,
        color_accuracy: issues.has("color-off") ? "inaccurate" : null,
        notes: feedbackText,
        color_name: colorName,
      });

      // Delete the old mockup
      await supabase.from("product_images").delete().eq("id", productImageId);

      // Regenerate
      if (onRegenerate) {
        await onRegenerate(colorName, feedbackText);
      }

      toast.success(`Regenerating ${colorName} mockup…`);
      setShowDialog(false);
      setIssues(new Set());
      setNotes("");
    } catch (err: any) {
      toast.error(err.message || "Failed to regenerate");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => { e.stopPropagation(); setShowDialog(true); }}
        title="Fix & regenerate this mockup"
      >
        <RefreshCw className="h-3 w-3" />
      </Button>

      <Dialog open={showDialog} onOpenChange={(open) => !regenerating && setShowDialog(open)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Fix Mockup — {colorName}
            </DialogTitle>
          </DialogHeader>

          {/* Preview */}
          <div className="rounded-lg border border-border bg-secondary overflow-hidden">
            <img src={imageUrl} alt={colorName} className="w-full object-contain max-h-48" loading="lazy" />
          </div>

          {/* Issue selection */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">What's wrong?</p>
            <div className="grid grid-cols-2 gap-1.5">
              {ISSUE_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleIssue(value)}
                  disabled={regenerating}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors text-left flex items-center gap-1.5",
                    issues.has(value)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-secondary"
                  )}
                >
                  {issues.has(value) && <Check className="h-3 w-3 shrink-0" />}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Additional details (optional)</p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Color should be darker, design needs to be centered…"
              className="h-16 text-xs"
              disabled={regenerating}
            />
          </div>

          <Button
            onClick={handleRegenerate}
            disabled={regenerating || (issues.size === 0 && !notes.trim())}
            className="w-full gap-2"
            size="sm"
          >
            {regenerating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Regenerating…
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                Fix & Regenerate
              </>
            )}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
};
