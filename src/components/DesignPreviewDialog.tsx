import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThumbsUp, ThumbsDown, Download, Loader2, Send, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  designUrl: string | null;
  messageText: string | null;
  messageId: string | null;
  organizationId: string;
  userId: string;
  onFeedbackSaved?: () => void;
  onRegenerate?: (messageId: string, feedback: string) => Promise<void>;
}

export const DesignPreviewDialog = ({
  open,
  onClose,
  designUrl,
  messageText,
  messageId,
  organizationId,
  userId,
  onFeedbackSaved,
  onRegenerate,
}: Props) => {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [regenFeedback, setRegenFeedback] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  const handleDownload = async () => {
    if (!designUrl) return;
    try {
      const response = await fetch(designUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `design-${messageId || "image"}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download image");
    }
  };

  const handleSubmitFeedback = async () => {
    if (!rating) {
      toast.error("Please select thumbs up or down");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("design_feedback").insert({
        user_id: userId,
        organization_id: organizationId,
        message_id: messageId,
        rating,
        notes: notes.trim(),
      });
      if (error) throw error;
      toast.success("Feedback saved — future designs will reflect your preferences!");
      setRating(null);
      setNotes("");
      onFeedbackSaved?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to save feedback");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegenerate = async () => {
    if (!messageId || !onRegenerate) return;
    setRegenerating(true);
    try {
      await onRegenerate(messageId, regenFeedback.trim());
      setRegenFeedback("");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={() => {
        setRating(null);
        setNotes("");
        setRegenFeedback("");
        onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">{messageText}</DialogTitle>
        </DialogHeader>

        {designUrl && (
          <img
            src={designUrl}
            alt={messageText || "Design preview"}
            className="w-full rounded-lg border border-border"
          />
        )}

        {/* Download */}
        <Button variant="outline" className="w-full gap-2" onClick={handleDownload}>
          <Download className="h-4 w-4" />
          Download Design
        </Button>

        {/* Regenerate with feedback */}
        {onRegenerate && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-sm font-medium text-muted-foreground">Regenerate design</p>
            <Textarea
              placeholder="What should change? (e.g. 'bigger font', 'less whitespace', 'bolder style')"
              value={regenFeedback}
              onChange={(e) => setRegenFeedback(e.target.value)}
              rows={2}
              className="text-sm"
              disabled={regenerating}
            />
            <Button
              onClick={handleRegenerate}
              disabled={regenerating}
              size="sm"
              variant="outline"
              className="gap-1.5"
            >
              {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {regenerating ? "Regenerating..." : "Regenerate"}
            </Button>
          </div>
        )}

        {/* Feedback */}
        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-sm font-medium text-muted-foreground">Rate this design</p>
          <div className="flex gap-2">
            <Button
              variant={rating === "up" ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => setRating("up")}
            >
              <ThumbsUp className="h-4 w-4" />
              Like
            </Button>
            <Button
              variant={rating === "down" ? "destructive" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => setRating("down")}
            >
              <ThumbsDown className="h-4 w-4" />
              Dislike
            </Button>
          </div>

          <Textarea
            placeholder="Optional: what did you like or dislike? (e.g. 'font too thin', 'love the layout')"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="text-sm"
          />

          <Button
            onClick={handleSubmitFeedback}
            disabled={!rating || submitting}
            size="sm"
            className="gap-1.5"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit Feedback
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
