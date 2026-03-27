import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ThumbsUp,
  ThumbsDown,
  ArrowDownFromLine,
  ArrowUpFromLine,
  CheckCircle2,
  ArrowRight,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Check,
} from "lucide-react";
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
  onRegenerateSingle?: (colorName: string, feedback: string) => Promise<void>;
}

type SizeFeedback = "too-large" | "too-small" | "just-right" | null;

const ISSUE_OPTIONS = [
  { value: "color-off", label: "Color is wrong" },
  { value: "too-large", label: "Design too large" },
  { value: "too-small", label: "Design too small" },
  { value: "ghosting", label: "Ghost / artifacts" },
  { value: "placement", label: "Placement is off" },
  { value: "quality", label: "Low quality" },
] as const;

type IssueType = (typeof ISSUE_OPTIONS)[number]["value"];

type Step = "size-check" | "review-all";

export const MockupReviewDialog = ({
  open,
  onClose,
  mockups,
  productId,
  organizationId,
  userId,
  onRegenerateSingle,
}: Props) => {
  const [step, setStep] = useState<Step>("size-check");
  const [sizeFeedback, setSizeFeedback] = useState<SizeFeedback>(null);
  const [sizeNotes, setSizeNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Per-mockup feedback state
  const [feedbackMockupId, setFeedbackMockupId] = useState<string | null>(null);
  const [issues, setIssues] = useState<Set<IssueType>>(new Set());
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  const resetState = () => {
    setStep("size-check");
    setSizeFeedback(null);
    setSizeNotes("");
    setFeedbackMockupId(null);
    setIssues(new Set());
    setFeedbackNotes("");
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // Step 1: Save general size feedback and move to step 2
  const handleSizeSubmit = async () => {
    if (sizeFeedback && sizeFeedback !== "just-right") {
      setSaving(true);
      try {
        await supabase.from("mockup_feedback").insert({
          product_image_id: mockups[0]?.id,
          product_id: productId,
          organization_id: organizationId,
          user_id: userId,
          rating: "bad",
          size_feedback: sizeFeedback,
          notes: sizeNotes.trim() || null,
          color_name: "general",
        });
      } catch {
        // Non-critical
      } finally {
        setSaving(false);
      }
    }
    setStep("review-all");
  };

  // Per-mockup feedback
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
    if (feedbackNotes.trim()) parts.push(feedbackNotes.trim());
    return parts.join(". ");
  };

  const handleRegenerateMockup = async () => {
    const mockup = mockups.find((m) => m.id === feedbackMockupId);
    if (!mockup) return;

    const text = buildFeedbackText();
    if (!text) {
      toast.error("Please select at least one issue or add a note.");
      return;
    }

    setRegenerating(true);
    try {
      // Save feedback
      await supabase.from("mockup_feedback").insert({
        product_image_id: mockup.id,
        product_id: productId,
        organization_id: organizationId,
        user_id: userId,
        rating: "bad",
        size_feedback: issues.has("too-large")
          ? "too-large"
          : issues.has("too-small")
          ? "too-small"
          : null,
        color_accuracy: issues.has("color-off") ? "inaccurate" : null,
        notes: text,
        color_name: mockup.color_name,
      });

      // Delete old mockup
      await supabase.from("product_images").delete().eq("id", mockup.id);

      // Regenerate
      if (onRegenerateSingle) {
        await onRegenerateSingle(mockup.color_name, text);
      }

      toast.success(`Regenerating ${mockup.color_name} mockup…`);
      setFeedbackMockupId(null);
      setIssues(new Set());
      setFeedbackNotes("");
    } catch (err: any) {
      toast.error(err.message || "Failed to regenerate");
    } finally {
      setRegenerating(false);
    }
  };

  if (mockups.length === 0) return null;

  const feedbackMockup = mockups.find((m) => m.id === feedbackMockupId);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !regenerating && handleClose()}>
      <DialogContent className="max-w-md">
        {/* Step 1: General size/location check on one mockup */}
        {step === "size-check" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Quick Check — Size & Placement
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-secondary overflow-hidden">
                <img
                  src={mockups[0].image_url}
                  alt={mockups[0].color_name}
                  className="w-full object-contain max-h-64"
                  loading="lazy"
                />
                <p className="text-center text-[10px] text-muted-foreground py-1">
                  {mockups[0].color_name}
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  How's the design size on the garment?
                </p>
                <div className="flex gap-2">
                  {(
                    [
                      { value: "too-large" as const, label: "Too Large", icon: ArrowUpFromLine },
                      { value: "just-right" as const, label: "Just Right", icon: ThumbsUp },
                      { value: "too-small" as const, label: "Too Small", icon: ArrowDownFromLine },
                    ] as const
                  ).map(({ value, label, icon: Icon }) => (
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

              {sizeFeedback && sizeFeedback !== "just-right" && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                    Details (optional)
                  </p>
                  <Textarea
                    value={sizeNotes}
                    onChange={(e) => setSizeNotes(e.target.value)}
                    placeholder="e.g. Design should be 20% smaller, or moved up…"
                    className="h-14 text-xs"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep("review-all")}>
                  Skip
                </Button>
                <Button
                  size="sm"
                  onClick={handleSizeSubmit}
                  disabled={saving}
                  className="gap-1"
                >
                  {saving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ArrowRight className="h-3 w-3" />
                  )}
                  {sizeFeedback ? "Next" : "Looks Good"}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Step 2: Review all mockups with per-mockup thumbs-down */}
        {step === "review-all" && !feedbackMockupId && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Review Mockups
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Tap <ThumbsDown className="inline h-3 w-3 mx-0.5" /> on any mockup that needs fixing.
              </p>

              <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
                {mockups.map((m) => (
                  <div
                    key={m.id}
                    className="group relative rounded-lg border border-border bg-card overflow-hidden"
                  >
                    <div className="aspect-square overflow-hidden bg-secondary">
                      <img
                        src={m.image_url}
                        alt={m.color_name}
                        className="h-full w-full object-contain p-1"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <span className="text-[11px] font-medium truncate">{m.color_name}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0 hover:text-destructive"
                        onClick={() => {
                          setFeedbackMockupId(m.id);
                          setIssues(new Set());
                          setFeedbackNotes("");
                        }}
                        title={`Fix ${m.color_name}`}
                      >
                        <ThumbsDown className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button size="sm" onClick={handleClose}>
                  Done
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Per-mockup feedback panel */}
        {step === "review-all" && feedbackMockup && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Fix Mockup — {feedbackMockup.color_name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-secondary overflow-hidden">
                <img
                  src={feedbackMockup.image_url}
                  alt={feedbackMockup.color_name}
                  className="w-full object-contain max-h-48"
                  loading="lazy"
                />
              </div>

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

              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Additional details (optional)
                </p>
                <Textarea
                  value={feedbackNotes}
                  onChange={(e) => setFeedbackNotes(e.target.value)}
                  placeholder="e.g. Color should be darker, design needs to be centered…"
                  className="h-16 text-xs"
                  disabled={regenerating}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFeedbackMockupId(null);
                    setIssues(new Set());
                    setFeedbackNotes("");
                  }}
                  disabled={regenerating}
                >
                  Back
                </Button>
                <Button
                  onClick={handleRegenerateMockup}
                  disabled={regenerating || (issues.size === 0 && !feedbackNotes.trim())}
                  className="flex-1 gap-2"
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
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
