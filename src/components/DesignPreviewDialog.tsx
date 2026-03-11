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
import { Download, Loader2, ImagePlus, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  designUrl: string | null;
  messageText: string | null;
  messageId: string | null;
  organizationId: string;
  userId: string;
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
  onRegenerate,
}: Props) => {
  const [notes, setNotes] = useState("");
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
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

  return (
    <Dialog
      open={open}
      onOpenChange={() => {
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

        {/* Regenerate with feedback */}
        {onRegenerate && messageId && (
          <div className="space-y-3 border-t border-border pt-3">
            <p className="text-sm font-medium text-muted-foreground">Regenerate design</p>

            <Textarea
              placeholder="What should change? (e.g. 'bigger font', 'use attached reference image style')"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="text-sm"
              disabled={regenerating}
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
              size="sm"
              className="gap-1.5"
              disabled={regenerating}
              onClick={async () => {
                setRegenerating(true);
                try {
                  await onRegenerate(messageId, notes.trim());
                } finally {
                  setRegenerating(false);
                }
              }}
            >
              {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {regenerating ? "Regenerating…" : "Regenerate"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
