import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SwipeableMessageCard } from "@/components/SwipeableMessageCard";
import { DesignPreviewDialog } from "@/components/DesignPreviewDialog";
import { Loader2, Sparkles, Trash2, ArrowRight, Paintbrush, X, Plus, Type, Image } from "lucide-react";
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
  onProductsCreated?: () => void;
}

export const MessageGenerator = ({ organization, userId, onProductsCreated }: Props) => {
  const [messages, setMessages] = useState<GeneratedMessage[]>([]);
  const [creatingProducts, setCreatingProducts] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [keptIds, setKeptIds] = useState<Set<string>>(new Set());
  const [generatingDesignId, setGeneratingDesignId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [previewMessageId, setPreviewMessageId] = useState<string | null>(null);
  const [refiningId, setRefiningId] = useState<string | null>(null);
  const [generateCount, setGenerateCount] = useState(10);
  const [topic, setTopic] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);
  const cancelDesignsRef = useRef(false);
  const [designStyle, setDesignStyle] = useState<"text-only" | "minimalist">("text-only");

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
          count: generateCount,
          ...(topic.trim() ? { topic: topic.trim() } : {}),
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

  const handleAddCustomMessage = async () => {
    const text = customMessage.trim();
    if (!text) return;
    setAddingCustom(true);
    try {
      const { error } = await supabase.from("generated_messages").insert({
        user_id: userId,
        organization_id: organization.id,
        message_text: text,
        is_selected: false,
      });
      if (error) throw error;
      setCustomMessage("");
      toast.success("Message added!");
      await loadMessages();
    } catch (err: any) {
      toast.error("Failed to add message");
    } finally {
      setAddingCustom(false);
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

  const handleGenerateDesign = async (msgId: string, variant: "dark-on-light" | "light-on-dark" | "both" = "light-on-dark") => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg) return;
    setGeneratingDesignId(msg.id);

    const variants: ("dark-on-light" | "light-on-dark")[] = 
      variant === "both" ? ["light-on-dark", "dark-on-light"] : [variant];

    try {
      for (const v of variants) {
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
            designVariant: v,
          },
        });

        if (error || data?.error) {
          handleAiError(error, data, `Failed to generate ${v} design`);
          return;
        }
      }
      toast.success(variant === "both" ? "Both designs generated!" : "Design generated!");
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

    cancelDesignsRef.current = false;
    let completed = 0;

    for (const msg of kept) {
      if (cancelDesignsRef.current) {
        toast.info(`Cancelled after ${completed} designs`);
        break;
      }
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
          designVariant: "light-on-dark",
        },
      });

      if (error || data?.error) {
        handleAiError(error, data, `Design failed for "${msg.message_text.slice(0, 30)}..."`);
        const errorMsg = data?.error || error?.message || "";
        if (errorMsg.includes("credits") || errorMsg.includes("402")) break;
      } else {
        completed++;
      }

      await new Promise((r) => setTimeout(r, 2000));
    }

    setGeneratingDesignId(null);
    if (!cancelDesignsRef.current) {
      toast.success(`Generated designs for ${completed} messages!`);
    }
    await loadMessages();
  };

  const handleCreateProducts = async () => {
    const ready = messages.filter(
      (m) => keptIds.has(m.id) && !m.product_id && m.design_url
    );
    if (ready.length === 0) {
      toast.error("No kept messages with designs ready to create products");
      return;
    }

    setCreatingProducts(true);
    let created = 0;

    try {
      for (const msg of ready) {
        const autoDescription = `${msg.message_text} — A premium print-on-demand ${organization.niche ? organization.niche + " " : ""}t-shirt featuring bold minimalist typography. Designed for ${organization.audience || "everyday wear"}. Part of the ${organization.name} collection.`;
        const autoFeatures = "Premium cotton blend\nComfortable unisex fit\nDurable print quality\nPre-shrunk fabric\nDouble-stitched hems";
        const autoKeywords = msg.message_text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2).join(", ") + ", t-shirt, print on demand, minimalist, typography";

        const { data: product, error } = await supabase
          .from("products")
          .insert({
            title: msg.message_text,
            description: autoDescription,
            keywords: autoKeywords,
            category: "T-Shirt",
            price: "29.99",
            features: autoFeatures,
            organization_id: organization.id,
            user_id: userId,
            image_url: msg.design_url,
          })
          .select("id")
          .single();

        if (error) {
          console.error("Failed to create product:", error);
          continue;
        }

        // Link message to product
        await supabase
          .from("generated_messages")
          .update({ product_id: product.id })
          .eq("id", msg.id);

        created++;
      }

      if (created > 0) {
        toast.success(`Created ${created} product${created > 1 ? "s" : ""}!`);
        await loadMessages();
        onProductsCreated?.();
      } else {
        toast.error("Failed to create products");
      }
    } catch (err: any) {
      toast.error("Failed to create products");
    } finally {
      setCreatingProducts(false);
    }
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
        <div className="flex items-center gap-2">
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Topic (e.g. Christmas, Summer, Dogs)..."
            className="flex-1 h-10"
            disabled={generating}
          />
          <select
            value={generateCount}
            onChange={(e) => setGenerateCount(Number(e.target.value))}
            disabled={generating}
            className="h-10 rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
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
            Generate
          </Button>
        </div>
      </div>

      {/* Custom message input */}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          handleAddCustomMessage();
        }}
      >
        <Input
          value={customMessage}
          onChange={(e) => setCustomMessage(e.target.value)}
          placeholder="Type your own message..."
          className="flex-1"
          disabled={addingCustom}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={!customMessage.trim() || addingCustom}
          className="gap-1.5 shrink-0"
        >
          {addingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </Button>
      </form>

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

          <div className="flex gap-2 flex-wrap items-center">
            
            {needsDesignCount > 0 && (
              generatingDesignId ? (
                <Button
                  onClick={() => { cancelDesignsRef.current = true; setGeneratingDesignId(null); }}
                  variant="destructive"
                  className="gap-2"
                >
                  <X className="h-4 w-4" /> Cancel Designs
                </Button>
              ) : (
                <Button
                  onClick={handleGenerateKeptDesigns}
                  variant="secondary"
                  className="gap-2"
                >
                  <Paintbrush className="h-4 w-4" />
                  Generate {needsDesignCount} Design{needsDesignCount > 1 ? "s" : ""}
                </Button>
              )
            )}
            {readyForProductCount > 0 && (
              <Button onClick={handleCreateProducts} disabled={creatingProducts} className="gap-2">
                {creatingProducts ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {creatingProducts ? "Creating…" : `Create ${readyForProductCount} Product${readyForProductCount > 1 ? "s" : ""}`}
              </Button>
            )}
          </div>
        </>
      )}

      {messages.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Sparkles className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No messages yet. Click "Generate" to get started.
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
