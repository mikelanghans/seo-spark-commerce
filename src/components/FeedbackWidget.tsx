import { useState } from "react";
import { MessageSquarePlus, Star, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export const FeedbackWidget = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  if (!user) return null;

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.from("app_feedback" as any).insert({
        user_id: user.id,
        rating,
        message: message.trim(),
        page_url: window.location.pathname,
      } as any);
      if (error) throw error;
      toast.success("Thanks for your feedback!");
      setRating(0);
      setMessage("");
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to send feedback");
    } finally {
      setSending(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-5 right-5 z-50 h-12 w-12 rounded-full shadow-lg bg-primary hover:bg-primary/90"
        >
          <MessageSquarePlus className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-80 p-4 space-y-3"
      >
        <h4 className="font-semibold text-sm text-foreground">How's your experience?</h4>

        <div className="flex gap-1 justify-center py-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoveredStar(star)}
              onMouseLeave={() => setHoveredStar(0)}
              className="p-0.5 transition-transform hover:scale-110"
            >
              <Star
                className={cn(
                  "h-7 w-7 transition-colors",
                  (hoveredStar || rating) >= star
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-muted-foreground"
                )}
              />
            </button>
          ))}
        </div>

        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what you think… (optional)"
          rows={3}
          className="text-sm resize-none"
        />

        <Button
          onClick={handleSubmit}
          disabled={sending || rating === 0}
          size="sm"
          className="w-full gap-2"
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Send Feedback
        </Button>
      </PopoverContent>
    </Popover>
  );
};
