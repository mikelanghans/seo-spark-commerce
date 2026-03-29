import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { insertProductImagesDeduped } from "@/lib/productImageUtils";
import { removeBackground, recolorOpaquePixels } from "@/lib/removeBackground";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SwipeableMessageCard } from "@/components/SwipeableMessageCard";
import { DesignPreviewDialog } from "@/components/DesignPreviewDialog";
import { Loader2, Sparkles, Trash2, ArrowRight, Paintbrush, X, Plus, Type, Image } from "lucide-react";
import { toast } from "sonner";
import { handleAiError } from "@/lib/aiErrors";
import { ensureValidSession } from "@/lib/sessionRefresh";

const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s — please try again`)), ms)
    ),
  ]);

interface Organization {
  id: string;
  name: string;
  niche: string;
  tone: string;
  audience: string;
  design_styles?: string[];
}

interface GeneratedMessage {
  id: string;
  message_text: string;
  is_selected: boolean;
  product_id: string | null;
  design_url: string | null;
  dark_design_url: string | null;
  created_at: string;
}

interface AiUsage {
  checkAndLog: (fn: string, userId: string) => Promise<boolean>;
  logUsage: (fn: string, userId: string) => Promise<void>;
  canUseAi: boolean;
  usedCount: number;
  remaining: number;
  limit: number;
  loading: boolean;
  refetch: () => Promise<void>;
}

interface Props {
  organization: Organization;
  userId: string;
  onProductsCreated?: () => void;
  refreshKey?: number;
  aiUsage?: AiUsage;
}

export const MessageGenerator = ({ organization, userId, onProductsCreated, refreshKey, aiUsage }: Props) => {
  const [messages, setMessages] = useState<GeneratedMessage[]>([]);
  const [creatingProducts, setCreatingProducts] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [keptIds, setKeptIds] = useState<Set<string>>(new Set());
  const [generatingDesignId, setGeneratingDesignId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDarkUrl, setPreviewDarkUrl] = useState<string | null>(null);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [previewMessageId, setPreviewMessageId] = useState<string | null>(null);
  const [refiningId, setRefiningId] = useState<string | null>(null);
  const [generateCount, setGenerateCount] = useState(10);
  const [topic, setTopic] = useState("");
  const [styleFirst, setStyleFirst] = useState(false);
  const [customMessage, setCustomMessage] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);
  const cancelDesignsRef = useRef(false);
  const availableStyles = (organization.design_styles as string[]) || ["text-only"];
  const [designStyle, setDesignStyle] = useState<string>(
    availableStyles.includes("text-only") ? "text-only" : availableStyles[0] || "text-only"
  );

  useEffect(() => {
    loadMessages();
  }, [organization.id, refreshKey]);

  const loadMessages = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("generated_messages")
      .select("*")
      .eq("organization_id", organization.id)
      .eq("user_id", userId)
      .is("product_id", null)
      .order("created_at", { ascending: false });
    setMessages((data as GeneratedMessage[]) || []);
    const kept = new Set((data || []).filter((m: any) => m.is_selected).map((m: any) => m.id));
    setKeptIds(kept);
    setLoading(false);
  };

  const handleGenerate = async () => {
    const sessionOk = await ensureValidSession();
    if (!sessionOk) {
      toast.error("Your session has expired. Please sign in again.");
      return;
    }
    if (aiUsage) {
      const allowed = await aiUsage.checkAndLog("generate-messages", userId);
      if (!allowed) return;
    }
    setGenerating(true);
    try {
      // Collect existing messages — deduplicate by design_url so we only
      // compare against unique design concepts, not every message row
      const { data: allExisting } = await supabase
        .from("generated_messages")
        .select("message_text, design_url")
        .eq("organization_id", organization.id);
      
      // Build a set of unique message texts, keeping only one per design_url
      const seenDesigns = new Set<string>();
      const uniqueExisting: string[] = [];
      for (const m of (allExisting || []) as any[]) {
        const designKey = m.design_url || m.message_text; // fallback for messages without designs
        if (seenDesigns.has(designKey)) continue;
        seenDesigns.add(designKey);
        uniqueExisting.push(m.message_text);
      }
      const existingTexts = new Set(
        uniqueExisting.map((t: string) => t.toLowerCase().trim())
      );

      const { data, error } = await withTimeout(
        supabase.functions.invoke("generate-messages", {
          body: {
            organization: {
              id: organization.id,
              name: organization.name,
              niche: organization.niche,
              tone: organization.tone,
              audience: organization.audience,
            },
            count: generateCount,
            ...(styleFirst ? { designStyle } : {}),
            existingProducts: uniqueExisting.slice(0, 50),
            ...(topic.trim() ? { topic: topic.trim() } : {}),
          },
        }),
        120000,
        "Message generation"
      );

      if (error || data?.error) {
        handleAiError(error, data, "Failed to generate messages");
        return;
      }

      const newMessages = data.messages || [];
      if (newMessages.length === 0) {
        toast.error("No messages generated");
        return;
      }

      // Filter out duplicates client-side
      const uniqueMessages = newMessages.filter(
        (m: { text: string }) => !existingTexts.has(m.text.toLowerCase().trim())
      );

      if (uniqueMessages.length === 0) {
        toast.error("All generated messages already exist — try a different topic");
        return;
      }

      const rows = uniqueMessages.map((m: { text: string }) => ({
        user_id: userId,
        organization_id: organization.id,
        message_text: m.text,
        is_selected: false,
      }));

      const { error: insertError } = await supabase
        .from("generated_messages")
        .insert(rows);

      if (insertError) throw insertError;

      const dupeCount = newMessages.length - uniqueMessages.length;
      const dupeNote = dupeCount > 0 ? ` (${dupeCount} duplicates skipped)` : "";
      toast.success(`Generated ${uniqueMessages.length} new messages!${dupeNote}`);
      if (aiUsage) await aiUsage.logUsage("generate-messages", userId);
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
      // Check for existing duplicate
      const { data: existing } = await supabase
        .from("generated_messages")
        .select("id")
        .eq("organization_id", organization.id)
        .ilike("message_text", text)
        .limit(1);
      if (existing && existing.length > 0) {
        toast.error("This message already exists!");
        setAddingCustom(false);
        return;
      }
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

  const handleClearAll = async () => {
    const idsToRemove = messages.filter((m) => !keptIds.has(m.id)).map((m) => m.id);
    if (idsToRemove.length === 0) return;
    setMessages((prev) => prev.filter((m) => keptIds.has(m.id)));
    await supabase.from("generated_messages").delete().in("id", idsToRemove);
    toast(`Cleared ${idsToRemove.length} messages`, { duration: 1500 });
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
    const sessionOk = await ensureValidSession();
    if (!sessionOk) {
      toast.error("Your session has expired. Please sign in again.");
      return;
    }
    if (aiUsage) {
      const allowed = await aiUsage.checkAndLog("generate-messages", userId);
      if (!allowed) return;
    }
    setRefiningId(id);
    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke("generate-messages", {
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
        }),
        60000,
        "Message refinement"
      );

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
      if (aiUsage) await aiUsage.logUsage("generate-messages", userId);
      await loadMessages();
    } catch (err: any) {
      handleAiError(err, null, "Failed to refine message");
    } finally {
      setRefiningId(null);
    }
  };

  const handleGenerateDesign = async (msgId: string, style?: string) => {
    const styleToUse = style || designStyle;
    const msg = messages.find((m) => m.id === msgId);
    if (!msg) return;
    if (aiUsage) {
      const allowed = await aiUsage.checkAndLog("generate-design", userId);
      if (!allowed) return;
    }
    setGeneratingDesignId(msg.id);

    const variants: ("light-on-dark")[] = ["light-on-dark"];

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
            designStyle: styleToUse,
          },
        });

        if (error || data?.error) {
          handleAiError(error, data, `Failed to generate ${v} design`);
          return;
        }
      }
      toast.success("Design generated!");
      if (aiUsage) await aiUsage.logUsage("generate-design", userId);
      // Auto-keep the message when a design is generated
      if (!keptIds.has(msg.id)) {
        const newKept = new Set(keptIds);
        newKept.add(msg.id);
        setKeptIds(newKept);
        await supabase.from("generated_messages").update({ is_selected: true }).eq("id", msg.id);
      }
      await loadMessages();
    } catch (err: any) {
      handleAiError(err, null, "Failed to generate design");
    } finally {
      setGeneratingDesignId(null);
    }
  };

  const handleRegenerateDesign = async (msgId: string, feedback: string, referenceImageUrl?: string, baseDesignUrl?: string) => {
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
          designVariant: "light-on-dark",
          designStyle,
          regenerateFeedback: feedback,
          referenceImageUrl,
          baseDesignUrl,
        },
      });
      if (error || data?.error) {
        handleAiError(error, data, "Failed to regenerate design");
        return;
      }
      toast.success("Design regenerated!");
      await loadMessages();
      // Fetch fresh design URLs for preview
      const { data: freshMsg } = await supabase
        .from("generated_messages")
        .select("design_url, dark_design_url")
        .eq("id", msgId)
        .single();
      if (freshMsg?.design_url) {
        setPreviewUrl(freshMsg.design_url);
        setPreviewDarkUrl((freshMsg as any).dark_design_url || null);
      }
    } catch (err: any) {
      handleAiError(err, null, "Failed to regenerate design");
    } finally {
      setGeneratingDesignId(null);
    }
  };

  const handlePreviewDesign = (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg) return;
    setPreviewUrl(msg.design_url);
    setPreviewDarkUrl(msg.dark_design_url);
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
    setBatchProgress({ done: 0, total: kept.length });

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
          designStyle,
        },
      });

      if (error || data?.error) {
        handleAiError(error, data, `Design failed for "${msg.message_text.slice(0, 30)}..."`);
        const errorMsg = data?.error || error?.message || "";
        if (errorMsg.includes("credits") || errorMsg.includes("402")) break;
      } else {
        completed++;
        setBatchProgress({ done: completed, total: kept.length });
      }

      await new Promise((r) => setTimeout(r, 2000));
    }

    setGeneratingDesignId(null);
    setBatchProgress(null);
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

        // Insert both design variants into product_images (deduplicated)
        const designEntries = [];
        if (msg.design_url) {
          designEntries.push({
            product_id: product.id,
            user_id: userId,
            image_url: msg.design_url,
            image_type: "design",
            color_name: "light-on-dark",
            position: 0,
          });
        }
        if (msg.dark_design_url) {
          designEntries.push({
            product_id: product.id,
            user_id: userId,
            image_url: msg.dark_design_url,
            image_type: "design",
            color_name: "dark-on-light",
            position: 1,
          });
        }
        if (designEntries.length > 0) {
          await insertProductImagesDeduped(designEntries);
        }

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
      {/* Mode toggle + generation controls */}
      <div className="space-y-3">
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
          {availableStyles.length > 1 && (
            <div className="flex items-center rounded-full border border-input bg-muted/50 p-0.5">
              <button
                type="button"
                onClick={() => setStyleFirst(false)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  !styleFirst ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                Message First
              </button>
              <button
                type="button"
                onClick={() => setStyleFirst(true)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  styleFirst ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                Style First
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Topic (e.g. Christmas, Summer, Dogs)..."
            className="flex-1 min-w-[140px] h-9"
            disabled={generating}
          />
          {styleFirst && availableStyles.length > 1 && (
            <select
              value={designStyle}
              onChange={(e) => setDesignStyle(e.target.value)}
              disabled={generating}
              className="h-9 rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {availableStyles.map((s) => (
                  <option key={s} value={s}>
                    {getStyleLabel(s)}
                  </option>
              ))}
            </select>
          )}
          <select
            value={generateCount}
            onChange={(e) => setGenerateCount(Number(e.target.value))}
            disabled={generating}
            className="h-9 rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <Button
            onClick={handleGenerate}
            disabled={generating}
            size="sm"
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{keptCount} kept</span>
              <span>·</span>
              <span>{unkeptMessages.length} to review</span>
              <span>·</span>
              <span>{messages.length} total</span>
            </div>
            {unkeptMessages.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Clear {unkeptMessages.length} unkept
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">All messages kept ✓</span>
            )}
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
                    availableStyles={availableStyles}
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
                      availableStyles={availableStyles}
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
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => { cancelDesignsRef.current = true; setGeneratingDesignId(null); setBatchProgress(null); }}
                    variant="destructive"
                    className="gap-2"
                  >
                    <X className="h-4 w-4" /> Cancel
                  </Button>
                  {batchProgress && (
                    <span className="text-sm text-muted-foreground font-medium">
                      {batchProgress.done} of {batchProgress.total} designs complete
                    </span>
                  )}
                </div>
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
        onClose={() => { setPreviewUrl(null); setPreviewDarkUrl(null); setPreviewMessage(null); setPreviewMessageId(null); }}
        designUrl={previewUrl}
        darkDesignUrl={previewDarkUrl}
        messageText={previewMessage}
        messageId={previewMessageId}
        organizationId={organization.id}
        userId={userId}
        hasProduct={!!messages.find((m) => m.id === previewMessageId)?.product_id}
        onRegenerate={handleRegenerateDesign}
        onDiscardDesign={async (msgId) => {
          await supabase
            .from("generated_messages")
            .update({ design_url: null, dark_design_url: null })
            .eq("id", msgId);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, design_url: null, dark_design_url: null } : m
            )
          );
          toast.success("Design removed — message kept for a fresh start");
        }}
        onCreateProduct={async (msgId) => {
          const msg = messages.find((m) => m.id === msgId);
          if (!msg || !msg.design_url) return;

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
            toast.error("Failed to create product");
            return;
          }

          await supabase.from("generated_messages").update({ product_id: product.id }).eq("id", msgId);

          const designEntries: any[] = [];
          if (msg.design_url) {
            designEntries.push({ product_id: product.id, user_id: userId, image_url: msg.design_url, image_type: "design", color_name: "light-on-dark", position: 0 });
          }
          if (msg.dark_design_url) {
            designEntries.push({ product_id: product.id, user_id: userId, image_url: msg.dark_design_url, image_type: "design", color_name: "dark-on-light", position: 1 });
          }
          if (designEntries.length > 0) {
            await insertProductImagesDeduped(designEntries);
          }

          toast.success("Product created!");
          await loadMessages();
          onProductsCreated?.();
        }}
        onReplaceDesign={async (msgId, file) => {
          const msg = messages.find((m) => m.id === msgId);
          // Archive current design to history before replacing
          if (msg?.design_url) {
            await supabase.from("design_history" as any).insert({
              message_id: msgId,
              design_url: msg.design_url,
              feedback_notes: "Replaced with uploaded file",
              organization_id: organization.id,
              user_id: userId,
            });
          }

          // Upload file to storage
          const ext = file.name.split(".").pop() || "png";
          const path = `${userId}/designs/${Date.now()}.${ext}`;
          const { error: uploadErr } = await supabase.storage
            .from("product-images")
            .upload(path, file, { contentType: file.type });
          if (uploadErr) {
            toast.error("Failed to upload design file");
            return;
          }
          const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
          const newDesignUrl = urlData.publicUrl;

          // Generate dark variant client-side
          let darkUrl: string | null = null;
          try {
            const lightBase64 = await removeBackground(newDesignUrl, "black");
            const darkBase64 = await recolorOpaquePixels(lightBase64);
            const darkBlob = await fetch(`data:image/png;base64,${darkBase64}`).then(r => r.blob());
            const darkPath = `${userId}/designs/${Date.now()}-dark.png`;
            const { error: darkUploadErr } = await supabase.storage
              .from("product-images")
              .upload(darkPath, darkBlob, { contentType: "image/png" });
            if (!darkUploadErr) {
              const { data: darkUrlData } = supabase.storage.from("product-images").getPublicUrl(darkPath);
              darkUrl = darkUrlData.publicUrl;
            }
          } catch {
            // Dark variant generation is optional, continue without it
          }

          // Update the message record
          await supabase
            .from("generated_messages")
            .update({ design_url: newDesignUrl, dark_design_url: darkUrl })
            .eq("id", msgId);

          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, design_url: newDesignUrl, dark_design_url: darkUrl } : m
            )
          );
          setPreviewUrl(newDesignUrl);
          setPreviewDarkUrl(darkUrl);
          toast.success("Design replaced!");
        }}
      />
    </div>
  );
};
