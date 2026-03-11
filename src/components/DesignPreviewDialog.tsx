import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Loader2, ImagePlus, X, RefreshCw, History, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface HistoryEntry {
  id: string;
  design_url: string;
  feedback_notes: string;
  created_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  designUrl: string | null;
  messageText: string | null;
  messageId: string | null;
  organizationId: string;
  userId: string;
  onRegenerate?: (messageId: string, feedback: string, referenceImageUrl?: string) => Promise<void>;
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
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch history when dialog opens
  useEffect(() => {
    if (open && messageId) {
      supabase
        .from("design_history" as any)
        .select("id, design_url, feedback_notes, created_at")
        .eq("message_id", messageId)
        .order("created_at", { ascending: false })
        .then(({ data }: any) => {
          setHistory(data || []);
        });
    }
    if (!open) {
      setHistory([]);
      setShowHistory(false);
      setViewingUrl(null);
    }
  }, [open, messageId]);

  // Refresh history after regeneration
  const refreshHistory = async () => {
    if (!messageId) return;
    const { data } = await supabase
      .from("design_history" as any)
      .select("id, design_url, feedback_notes, created_at")
      .eq("message_id", messageId)
      .order("created_at", { ascending: false }) as any;
    setHistory(data || []);
  };

  const activeUrl = viewingUrl || designUrl;

  const handleDownload = async () => {
    if (!activeUrl) return;
    try {
      const response = await fetch(activeUrl);
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

        {activeUrl && (
          <img
            src={activeUrl}
            alt={messageText || "Design preview"}
            className="w-full rounded-lg border border-border"
          />
        )}

        {/* Version history strip */}
        {history.length > 0 && (
          <div className="space-y-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <History className="h-3.5 w-3.5" />
              {showHistory ? "Hide" : "Show"} version history ({history.length} previous)
            </button>

            {showHistory && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {/* Current version */}
                <button
                  onClick={() => setViewingUrl(null)}
                  className={cn(
                    "relative flex-shrink-0 rounded-md border-2 overflow-hidden transition-all",
                    !viewingUrl
                      ? "border-primary ring-1 ring-primary/30"
                      : "border-border hover:border-muted-foreground"
                  )}
                >
                  {designUrl && (
                    <img
                      src={designUrl}
                      alt="Current"
                      className="h-16 w-16 object-cover"
                    />
                  )}
                  <span className="absolute bottom-0 inset-x-0 bg-background/80 text-[9px] font-medium text-center py-0.5">
                    Current
                  </span>
                </button>

                {/* Past versions */}
                {history.map((entry, i) => (
                  <button
                    key={entry.id}
                    onClick={() => setViewingUrl(entry.design_url)}
                    title={entry.feedback_notes || `Version ${history.length - i}`}
                    className={cn(
                      "relative flex-shrink-0 rounded-md border-2 overflow-hidden transition-all",
                      viewingUrl === entry.design_url
                        ? "border-primary ring-1 ring-primary/30"
                        : "border-border hover:border-muted-foreground"
                    )}
                  >
                    <img
                      src={entry.design_url}
                      alt={`v${history.length - i}`}
                      className="h-16 w-16 object-cover"
                    />
                    <span className="absolute bottom-0 inset-x-0 bg-background/80 text-[9px] font-medium text-center py-0.5">
                      v{history.length - i}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Download */}
        <Button variant="outline" className="w-full gap-2" onClick={handleDownload}>
          <Download className="h-4 w-4" />
          Download{viewingUrl ? " This Version" : " Design"}
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
                  // Upload reference image first if one is selected
                  let refUrl: string | undefined;
                  if (referenceImage) {
                    const ext = referenceImage.name.split(".").pop() || "png";
                    const path = `${userId}/feedback-refs/${Date.now()}.${ext}`;
                    const { error: uploadErr } = await supabase.storage
                      .from("product-images")
                      .upload(path, referenceImage, { contentType: referenceImage.type });
                    if (uploadErr) {
                      toast.error("Failed to upload reference image");
                      setRegenerating(false);
                      return;
                    }
                    const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
                    refUrl = urlData.publicUrl;
                  }
                  await onRegenerate(messageId, notes.trim(), refUrl);
                  await refreshHistory();
                  setViewingUrl(null);
                  setNotes("");
                  clearReferenceImage();
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
