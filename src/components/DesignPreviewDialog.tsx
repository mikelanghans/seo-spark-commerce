import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThumbsUp, ThumbsDown, Download, Loader2, Send, ImagePlus, X } from "lucide-react";
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
  }
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
}: Props) => {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setReferenceImage(file);
    setReferencePreview(URL.createObjectURL(file));
  };

  const clearReferenceImage = () => {
    setReferenceImage(null);
    if (referencePreview) URL.revokeObjectURL(referencePreview);
    setReferencePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmitFeedback = async () => {
    if (!rating) {
      toast.error("Please select thumbs up or down");
      return;
    }
    setSubmitting(true);
    try {
      let referenceImageUrl: string | null = null;

      if (referenceImage) {
        setUploadingImage(true);
        const ext = referenceImage.name.split(".").pop() || "png";
        const path = `feedback-refs/${userId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("product-images")
          .upload(path, referenceImage, { contentType: referenceImage.type });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
        referenceImageUrl = urlData.publicUrl;
        setUploadingImage(false);
      }

      const { error } = await supabase.from("design_feedback").insert({
        user_id: userId,
        organization_id: organizationId,
        message_id: messageId,
        rating,
        notes: notes.trim(),
        reference_image_url: referenceImageUrl,
      } as any);
      if (error) throw error;
      toast.success("Feedback saved — future designs will reflect your preferences!");
      setRating(null);
      setNotes("");
      clearReferenceImage();
      onFeedbackSaved?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to save feedback");
    } finally {
      setSubmitting(false);
      setUploadingImage(false);
    }
  };


  return (
    <Dialog
      open={open}
      onOpenChange={() => {
        setRating(null);
        setNotes("");
        setNotes("");
        clearReferenceImage();
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

          {/* Reference image upload */}
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            {referencePreview ? (
              <div className="relative inline-block">
                <img
                  src={referencePreview}
                  alt="Reference"
                  className="h-20 w-20 rounded-md border border-border object-cover"
                />
                <button
                  onClick={clearReferenceImage}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
                Add reference image
              </Button>
            )}
          </div>

          <Button
            onClick={handleSubmitFeedback}
            disabled={!rating || submitting}
            size="sm"
            className="gap-1.5"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {uploadingImage ? "Uploading…" : "Submit Feedback"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
