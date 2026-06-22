import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Send, Clock, CheckCircle2, MessageSquare } from "lucide-react";
import { toast } from "sonner";

const RESPONSE_TIMES: Record<string, { label: string; description: string }> = {
  free: { label: "48–72 hours", description: "We'll get back to you within 48–72 hours." },
  starter: { label: "24 hours", description: "Email support — response within 24 hours." },
  pro: { label: "12 hours", description: "Priority support — response within 12 hours." },
};

interface SupportFormProps {
  userId: string;
  userEmail: string;
  userName?: string;
  tier: "free" | "starter" | "pro";
  organizationId?: string;
}

export function SupportForm({ userId, userEmail, userName, tier, organizationId }: SupportFormProps) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const responseTime = RESPONSE_TIMES[tier] || RESPONSE_TIMES.free;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await (supabase as any).from("support_tickets").insert({
        user_id: userId,
        organization_id: organizationId || null,
        name: userName || "",
        email: userEmail,
        subject: subject.trim(),
        message: message.trim(),
        tier,
      });

      if (error) throw error;

      setSubmitted(true);
      toast.success("Support request submitted!");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="text-center py-8 space-y-3">
        <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
        <h4 className="font-semibold text-foreground">Request Received!</h4>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          We'll respond from <strong>support@syncopateddynamics.com</strong> within{" "}
          <strong>{responseTime.label}</strong>.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSubmitted(false);
            setSubject("");
            setMessage("");
          }}
          className="mt-2"
        >
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Contact Support
          </h3>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1">
          <Clock className="h-3 w-3 text-primary" />
          <span className="text-xs font-medium text-primary">
            Response within {responseTime.label}
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="support-subject" className="text-xs">Subject</Label>
          <Input
            id="support-subject"
            placeholder="What do you need help with?"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="support-message" className="text-xs">Message</Label>
          <Textarea
            id="support-message"
            placeholder="Describe your issue or question..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={2000}
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            We'll reply from support@syncopateddynamics.com
          </p>
          <Button type="submit" size="sm" disabled={submitting || !subject.trim() || !message.trim()} className="gap-1.5">
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Submit
          </Button>
        </div>
      </form>
    </div>
  );
}
