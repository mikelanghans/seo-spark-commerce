import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SwipeableMessageCard } from "@/components/SwipeableMessageCard";
import { DesignPreviewDialog } from "@/components/DesignPreviewDialog";
import { Loader2, Sparkles, Trash2, ArrowRight, Paintbrush } from "lucide-react";
import { toast } from "sonner";
import { handleAiError } from "@/lib/aiErrors";

interface Organization {
  id: string;
  name: string;
  niche: string;
  tone: string;
  audience: string;
}

interface GeneratedMessage {
  id: string;
  message_text: string;
  is_selected: boolean;
  product_id: string | null;
  design_url: string | null;
  created_at: string;
}

interface Props {
  organization: Organization;
  userId: string;
  onCreateProduct?: (messageText: string, designUrl: string) => void;
}

export const MessageGenerator = ({ organization, userId, onCreateProduct }: Props) => {
  const [messages, setMessages] = useState<GeneratedMessage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [keptIds, setKeptIds] = useState<Set<string>>(new Set());
  const [generatingDesignId, setGeneratingDesignId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [previewMessageId, setPreviewMessageId] = useState<string | null>(null);
  const [refiningId, setRefiningId] = useState<string | null>(null);

  useEffect(() => {
    loadMessages();
  }, [organization.id]);

  const loadMessages = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("generated_messages")
      .select("*")
      .eq("organization_id", organization.id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setMessages((data as GeneratedMessage[]) || []);
    const kept = new Set((data || []).filter((m: any) => m.is_selected).map((m: any) => m.id));
    setKeptIds(kept);
    setLoading(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-messages", {
        body: {
          organization: {
            name: organization.name,
            niche: organization.niche,
            tone: organization.tone,
            audience: organization.audience,
          },
          count: 10,
        },
      });

      if (error || data?.error) {
        handleAiError(error, data, "Failed to generate messages");
        return;
      }

      const newMessages = data.messages || [];
      if (newMessages.length === 0) {
        toast.error("No messages generated");
        return;
      }

      const rows = newMessages.map((m: { text: string }) => ({
        user_id: userId,
        organization_id: organization.id,
        message_text: m.text,
        is_selected: false,
      }));

      const { error: insertError } = await supabase
        .from("generated_messages")
        .insert(rows);

      if (insertError) throw insertError;

      toast.success(`Generated ${newMessages.length} new messages!`);
      await loadMessages();
    } catch (err: any) {
      handleAiError(err, null, "Failed to generate messages");
    } finally {
      setGenerating(false);
    }
  };

  const handleKeep = async (id: string) => {
    const newKept = new Set(keptIds);
    newKept.add(id);
    setKeptIds(newKept);
    await supabase.from("generated_messages").update({ is_selected: true }).eq("id", id);
    toast.success("Kept!", { duration: 1500 });
  };

  const handleDiscard = async (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    await supabase.from("generated_messages").delete().eq("id", id);
    toast("Discarded", { duration: 1500 });
  };

  const handleEdit = async (id: string, newText: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, message_text: newText } : m))
    );
    await supabase.from("generated_messages").update({ message_text: newText }).eq("id", id);
    toast.success("Message updated", { duration: 1500 });
  };

  const handleRefine = async (id: string, feedback: string) => {
    const msg = messages.find((m) => m.id === id);
    if (!msg) return;
    setRefiningId(id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-messages", {
        body: {
          organization: {
            id: organization.id,
            name: organization.name,
            niche: organization.niche,
            tone: organization.tone,
            audience: organization.audience,
          },
          refineOriginal: msg.message_text,
          refineFeedback: feedback,
        },
      });

      if (error || data?.error) {
        handleAiError(error, data, "Failed to refine message");
        return;
      }

      const variations = data.messages || [];
      if (variations.length === 0) {
        toast.error("No variations generated");
        return;
      }

      const rows = variations.map((m: { text: string }) => ({
        user_id: userId,
        organization_id: organization.id,
        message_text: m.text,
        is_selected: false,
      }));

      await supabase.from("generated_messages").insert(rows);
      toast.success(`Generated ${variations.length} variations!`);
      await loadMessages();
    } catch (err: any) {
      handleAiError(err, null, "Failed to refine message");
    } finally {
      setRefiningId(null);
    }
  };

  const handleGenerateDesign = async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg) return;
    setGeneratingDesignId(msg.id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-design", {
        body: {
          messageText: msg.message_text,
          brandName: organization.name,
          brandTone: organization.tone,
          brandNiche: organization.niche,
          brandAudience: organization.audience,
          brandFont: (organization as any).brand_font || "",
          brandColor: (organization as any).brand_color || "",
          brandFontSize: (organization as any).brand_font_size || "large",
          brandStyleNotes: (organization as any).brand_style_notes || "",
          messageId: msg.id,
          organizationId: organization.id,
        },
      });

      if (error || data?.error) {
        handleAiError(error, data, "Failed to generate design");
        return;
      }
      toast.success("Design generated!");
      await loadMessages();
    } catch (err: any) {
      handleAiError(err, null, "Failed to generate design");
    } finally {
      setGeneratingDesignId(null);
    }
  };

  const handlePreviewDesign = (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg) return;
    setPreviewUrl(msg.design_url);
    setPreviewMessage(msg.message_text);
    setPreviewMessageId(msg.id);
  };

  const handleGenerateKeptDesigns = async () => {
    const kept = messages.filter((m) => keptIds.has(m.id) && !m.design_url);
    if (kept.length === 0) {
      toast.error("No kept messages without designs");
      return;
    }

    for (const msg of kept) {
      setGeneratingDesignId(msg.id);
      const { data, error } = await supabase.functions.invoke("generate-design", {
        body: {
          messageText: msg.message_text,
          brandName: organization.name,
          brandTone: organization.tone,
          brandNiche: organization.niche,
          brandAudience: organization.audience,
          brandFont: (organization as any).brand_font || "",
          brandColor: (organization as any).brand_color || "",
          brandFontSize: (organization as any).brand_font_size || "large",
          brandStyleNotes: (organization as any).brand_style_notes || "",
          messageId: msg.id,
          organizationId: organization.id,
        },
      });

      if (error || data?.error) {
        handleAiError(error, data, `Design failed for "${msg.message_text.slice(0, 30)}..."`);
        const errorMsg = data?.error || error?.message || "";
        if (errorMsg.includes("credits") || errorMsg.includes("402")) break;
      }

      await new Promise((r) => setTimeout(r, 2000));
    }

    setGeneratingDesignId(null);
    toast.success(`Generated designs for ${kept.length} messages!`);
    await loadMessages();
  };

  const handleCreateProducts = () => {
    const ready = messages.filter(
      (m) => keptIds.has(m.id) && !m.product_id && m.design_url
    );
    if (ready.length === 0) {
      toast.error("No kept messages with designs ready to create products");
      return;
    }
    ready.forEach((m) => onCreateProduct?.(m.message_text, m.design_url!));
  };

  const keptCount = keptIds.size;
  const unkeptMessages = messages.filter((m) => !keptIds.has(m.id) && !m.product_id);
  const readyForProductCount = messages.filter(
    (m) => keptIds.has(m.id) && !m.product_id && m.design_url
  ).length;
  const needsDesignCount = messages.filter(
    (m) => keptIds.has(m.id) && !m.design_url
  ).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Message Ideas
          </h3>
          <p className="text-sm text-muted-foreground">
            Swipe right to keep · Swipe left to discard
          </p>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={generating}
          className="gap-2"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Generate 10
        </Button>
      </div>

      {messages.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{keptCount} kept</span>
            <span>·</span>
            <span>{unkeptMessages.length} to review</span>
            <span>·</span>
            <span>{messages.length} total</span>
          </div>

          {/* Unkept messages to review */}
          {unkeptMessages.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Swipe to triage
              </p>
              <div className="grid gap-2">
                {unkeptMessages.map((msg) => (
                  <SwipeableMessageCard
                    key={msg.id}
                    id={msg.id}
                    messageText={msg.message_text}
                    designUrl={msg.design_url}
                    hasProduct={!!msg.product_id}
                    isKept={false}
                    isGeneratingDesign={generatingDesignId === msg.id}
                    isRefining={refiningId === msg.id}
                    disableDesignActions={!!generatingDesignId}
                    onKeep={handleKeep}
                    onDiscard={handleDiscard}
                    onEdit={handleEdit}
                    onRefine={handleRefine}
                    onGenerateDesign={handleGenerateDesign}
                    onPreviewDesign={handlePreviewDesign}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Kept messages */}
          {keptCount > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Kept
              </p>
              <div className="grid gap-2">
                {messages
                  .filter((m) => keptIds.has(m.id))
                  .map((msg) => (
                    <SwipeableMessageCard
                      key={msg.id}
                      id={msg.id}
                      messageText={msg.message_text}
                      designUrl={msg.design_url}
                      hasProduct={!!msg.product_id}
                      isKept={true}
                      isGeneratingDesign={generatingDesignId === msg.id}
                      isRefining={refiningId === msg.id}
                      disableDesignActions={!!generatingDesignId}
                      onKeep={handleKeep}
                      onDiscard={handleDiscard}
                      onEdit={handleEdit}
                      onRefine={handleRefine}
                      onGenerateDesign={handleGenerateDesign}
                      onPreviewDesign={handlePreviewDesign}
                    />
                  ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {needsDesignCount > 0 && (
              <Button
                onClick={handleGenerateKeptDesigns}
                disabled={!!generatingDesignId}
                variant="secondary"
                className="gap-2"
              >
                {generatingDesignId ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Paintbrush className="h-4 w-4" />
                )}
                Generate {needsDesignCount} Design{needsDesignCount > 1 ? "s" : ""}
              </Button>
            )}
            {readyForProductCount > 0 && onCreateProduct && (
              <Button onClick={handleCreateProducts} className="gap-2">
                <ArrowRight className="h-4 w-4" />
                Create {readyForProductCount} Product{readyForProductCount > 1 ? "s" : ""}
              </Button>
            )}
          </div>
        </>
      )}

      {messages.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Sparkles className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No messages yet. Click "Generate 10" to get started.
          </p>
        </div>
      )}

      <DesignPreviewDialog
        open={!!previewUrl}
        onClose={() => { setPreviewUrl(null); setPreviewMessage(null); setPreviewMessageId(null); }}
        designUrl={previewUrl}
        messageText={previewMessage}
        messageId={previewMessageId}
        organizationId={organization.id}
        userId={userId}
        onFeedbackSaved={() => {}}
      />
    </div>
  );
};
