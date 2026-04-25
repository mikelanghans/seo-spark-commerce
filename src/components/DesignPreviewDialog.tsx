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
import { Download, Loader2, ImagePlus, X, RefreshCw, History, ThumbsDown, ArrowRight, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { hasMeaningfulAccentColors, isMultiColorDesign, recolorOpaquePixels, removeBackground } from "@/lib/removeBackground";

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
  darkDesignUrl?: string | null;
  messageText: string | null;
  messageId: string | null;
  organizationId: string;
  userId: string;
  onRegenerate?: (messageId: string, feedback: string, referenceImageUrl?: string, baseDesignUrl?: string) => Promise<void>;
  onDiscardDesign?: (messageId: string) => void;
  onCreateProduct?: (messageId: string) => void;
  onReplaceDesign?: (messageId: string, file: File, variant: "light" | "dark") => Promise<void>;
  onDarkDesignGenerated?: (messageId: string, darkUrl: string) => void;
  designVariantMode?: string;
  hasProduct?: boolean;
}

export const DesignPreviewDialog = ({
  open,
  onClose,
  designUrl,
  darkDesignUrl,
  messageText,
  messageId,
  organizationId,
  userId,
  onRegenerate,
  onDiscardDesign,
  onCreateProduct,
  onReplaceDesign,
  onDarkDesignGenerated,
  designVariantMode = "both",
  hasProduct,
}: Props) => {
  const [notes, setNotes] = useState("");
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenElapsed, setRegenElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [generatingDark, setGeneratingDark] = useState(false);
  
  const [activeVariant, setActiveVariant] = useState<"light" | "dark">("light");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Progress timer during regeneration
  useEffect(() => {
    if (!regenerating) { setRegenElapsed(0); return; }
    const t = setInterval(() => setRegenElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [regenerating]);

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
      setActiveVariant("light");
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

  const effectiveDarkDesignUrl = darkDesignUrl || designUrl;
  const activeUrl = viewingUrl || (activeVariant === "dark" && effectiveDarkDesignUrl ? effectiveDarkDesignUrl : designUrl);

  const generateDarkVariantLocally = async (): Promise<string | null> => {
    if (!designUrl || !messageId) throw new Error("Missing design");

    const lightDesignBase64 = await fetch(designUrl)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load design");
        return response.blob();
      })
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("Failed to read design"));
            reader.readAsDataURL(blob);
          }),
      );

    const preserveAccentColors = await hasMeaningfulAccentColors(lightDesignBase64) || await isMultiColorDesign(lightDesignBase64);
    if (preserveAccentColors) {
      return null;
    }

    const darkVariantBase64 = `data:image/png;base64,${await recolorOpaquePixels(await removeBackground(lightDesignBase64, "black"), { r: 24, g: 24, b: 24 })}`;

    const darkBlob = await fetch(darkVariantBase64).then((response) => response.blob());
    const path = `${userId}/designs/${messageId}-dark-${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(path, darkBlob, { contentType: "image/png", upsert: true });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
    const savedDarkUrl = urlData.publicUrl;

    const { error: updateError } = await supabase
      .from("generated_messages")
      .update({ dark_design_url: savedDarkUrl })
      .eq("id", messageId);

    if (updateError) throw updateError;

    return savedDarkUrl;
  };

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

  const [replaceVariant, setReplaceVariant] = useState<"light" | "dark">("light");

  const handleReplaceFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !messageId || !onReplaceDesign) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10MB");
      return;
    }
    setUploading(true);
    try {
      await onReplaceDesign(messageId, file, replaceVariant);
      await refreshHistory();
    } finally {
      setUploading(false);
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
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

        {/* Variant toggle — only when brand uses both variants */}
        {designUrl && !viewingUrl && designVariantMode === "both" && (
          <div className="flex rounded-md border border-input bg-background overflow-hidden">
            <button
              type="button"
              onClick={() => setActiveVariant("light")}
              className={cn(
                "flex-1 px-3 py-1.5 text-xs font-medium transition-colors",
                activeVariant === "light"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              ☀️ Light ink (dark shirts)
            </button>
            <button
              type="button"
              disabled={generatingDark}
              onClick={async () => {
                setActiveVariant("dark");
                // Generate dark variant on-demand if not yet available
                if (!darkDesignUrl && !generatingDark && designUrl && messageId) {
                  setGeneratingDark(true);
                  try {
                    const savedDarkUrl = await generateDarkVariantLocally();
                    if (savedDarkUrl) {
                      toast.success("Dark variant generated!");
                      onDarkDesignGenerated?.(messageId, savedDarkUrl);
                    } else {
                      toast.success("This design uses the same artwork on light shirts.");
                    }
                  } catch {
                    toast.error("Failed to generate dark variant");
                    setActiveVariant("light");
                  } finally {
                    setGeneratingDark(false);
                  }
                }
              }}
              className={cn(
                "flex-1 px-3 py-1.5 text-xs font-medium transition-colors",
                activeVariant === "dark"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              {generatingDark ? (
                <span className="flex items-center justify-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Generating…
                </span>
              ) : (
                <>🌙 Dark ink (light shirts){!darkDesignUrl && " ✦"}</>
              )}
            </button>
          </div>
        )}

        {/* Design image */}
        {activeVariant === "dark" && generatingDark && !darkDesignUrl ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-lg border border-border bg-card/50">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Generating dark ink variant…</p>
          </div>
        ) : activeUrl ? (
          <img
            src={activeUrl}
            alt={messageText || "Design preview"}
            className="w-full rounded-lg border border-border"
          />
        ) : null}

        {/* Action buttons row: Download + Upload replacement */}
        <div className="flex gap-2 flex-wrap">
          {activeUrl && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDownload}>
              <Download className="h-4 w-4" />
              Download {designUrl && darkDesignUrl ? (activeVariant === "light" ? "light" : "dark") : ""}
            </Button>
          )}
          {designUrl && darkDesignUrl && !viewingUrl && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={async () => {
                try {
                  for (const [url, label] of [[designUrl, "light"], [darkDesignUrl, "dark"]] as const) {
                    const response = await fetch(url);
                    const blob = await response.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = blobUrl;
                    a.download = `design-${messageId || "image"}-${label}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(blobUrl);
                  }
                  toast.success("Both variants downloaded");
                } catch {
                  toast.error("Failed to download images");
                }
              }}
            >
              <Download className="h-4 w-4" />
              Download both
            </Button>
          )}
          {onReplaceDesign && messageId && (
            <>
              <input
                ref={replaceInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleReplaceFileSelect}
              />
              {designUrl && darkDesignUrl && designVariantMode === "both" ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={uploading}
                    onClick={() => {
                      setReplaceVariant("light");
                      replaceInputRef.current?.click();
                    }}
                  >
                    {uploading && replaceVariant === "light" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Replace light
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={uploading}
                    onClick={() => {
                      setReplaceVariant("dark");
                      replaceInputRef.current?.click();
                    }}
                  >
                    {uploading && replaceVariant === "dark" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Replace dark
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={uploading}
                  onClick={() => {
                    setReplaceVariant(activeVariant);
                    replaceInputRef.current?.click();
                  }}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? "Uploading…" : "Replace design"}
                </Button>
              )}
            </>
          )}
        </div>

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

        {/* Actions: Create product or discard design */}
        {messageId && !hasProduct && (
          <div className="flex gap-2">
            {onCreateProduct && (
              <Button
                className="flex-1 gap-2"
                onClick={() => {
                  onCreateProduct(messageId);
                  onClose();
                }}
              >
                <ArrowRight className="h-4 w-4" />
                Create Product
              </Button>
            )}
            {onDiscardDesign && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  onDiscardDesign(messageId);
                  onClose();
                }}
                title="Remove design, keep message"
                className="shrink-0 text-muted-foreground hover:text-destructive hover:border-destructive/50"
              >
                <ThumbsDown className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        {hasProduct && (
          <p className="text-xs text-center text-muted-foreground">Product already created</p>
        )}

        {/* Regenerate with feedback - always available */}
        {onRegenerate && messageId && (
          <div className="space-y-3 border-t border-border pt-3">
            <p className="text-sm font-medium text-muted-foreground">Regenerate design</p>

            <Textarea
              placeholder="What should change? (e.g. 'bigger font', 'different colors', 'use attached reference')"
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
                  await onRegenerate(messageId, notes.trim(), refUrl, viewingUrl || designUrl || undefined);
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
              {regenerating
                ? regenElapsed < 10
                  ? "Generating design…"
                  : regenElapsed < 40
                    ? `Regenerating design… (${regenElapsed}s)`
                    : `Still working… (${regenElapsed}s)`
                : "Regenerate"}
            </Button>
            {regenerating && regenElapsed >= 15 && (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                This generates 2 design variants using AI — it typically takes 30-90 seconds.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
