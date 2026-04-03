import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ImagePlus, Upload, ThumbsUp, ThumbsDown, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface SocialImageCardProps {
  platformId: string;
  platformLabel: string;
  imageUrl: string | null;
  generatingImage: boolean;
  onGenerateImage: () => void;
  onImageChange: (url: string) => void;
  userId: string;
}

export function SocialImageCard({
  platformId,
  platformLabel,
  imageUrl,
  generatingImage,
  onGenerateImage,
  onImageChange,
  userId,
}: SocialImageCardProps) {
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFeedback = (type: "up" | "down") => {
    if (feedback === type) {
      setFeedback(null);
      setShowNotes(false);
      return;
    }
    setFeedback(type);
    if (type === "down") {
      setShowNotes(true);
    } else {
      setShowNotes(false);
      toast.success("Thanks for the feedback!");
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${userId}/social/${platformId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(path, file, { contentType: file.type, upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(path);

      onImageChange(urlData.publicUrl);
      setFeedback(null);
      setShowNotes(false);
      toast.success("Image uploaded!");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      {/* Action buttons */}
      <div className="flex items-center gap-1 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={onGenerateImage}
          disabled={generatingImage}
          className="gap-1.5"
        >
          {generatingImage ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
          ) : (
            <><ImagePlus className="h-3.5 w-3.5" /> {imageUrl ? "Regenerate" : "AI Image"}</>
          )}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="gap-1.5"
        >
          {uploading ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
          ) : (
            <><Upload className="h-3.5 w-3.5" /> Upload Own</>
          )}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      {/* Image preview */}
      {imageUrl && (
        <div className="space-y-2">
          <div className="rounded-lg overflow-hidden border border-border">
            <img
              src={imageUrl}
              alt={`${platformLabel} promo`}
              className="w-full max-h-[300px] object-contain bg-muted/30"
            />
          </div>

          {/* Feedback row */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">How's this image?</span>
            <Button
              variant={feedback === "up" ? "default" : "outline"}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => handleFeedback("up")}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={feedback === "down" ? "destructive" : "outline"}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => handleFeedback("down")}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Feedback notes on thumbs-down */}
          {showNotes && feedback === "down" && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              <Textarea
                placeholder="What should be different? (e.g., 'Make the text bigger', 'Use warmer colors')"
                value={feedbackNotes}
                onChange={(e) => setFeedbackNotes(e.target.value)}
                className="text-sm min-h-[60px]"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => {
                    toast.success("Feedback noted – try regenerating!");
                    setShowNotes(false);
                  }}
                >
                  Save Note
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setShowNotes(false);
                    setFeedback(null);
                    onGenerateImage();
                  }}
                  disabled={generatingImage}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Regenerate
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
