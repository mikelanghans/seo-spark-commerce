import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DesignPreviewDialog } from "@/components/DesignPreviewDialog";
import { Loader2, Sparkles, Trash2, ArrowRight, Paintbrush, RefreshCw, Eye, Download } from "lucide-react";
import { toast } from "sonner";

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generatingDesignId, setGeneratingDesignId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);

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
    const selected = new Set((data || []).filter((m: any) => m.is_selected).map((m: any) => m.id));
    setSelectedIds(selected);
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

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

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
      toast.error(err.message || "Failed to generate messages");
    } finally {
      setGenerating(false);
    }
  };

  const toggleSelect = async (id: string) => {
    const newSelected = new Set(selectedIds);
    const isNowSelected = !newSelected.has(id);
    if (isNowSelected) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);

    await supabase
      .from("generated_messages")
      .update({ is_selected: isNowSelected })
      .eq("id", id);
  };

  const handleGenerateDesign = async (msg: GeneratedMessage) => {
    setGeneratingDesignId(msg.id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-design", {
        body: {
          messageText: msg.message_text,
          brandName: organization.name,
          brandTone: organization.tone,
          messageId: msg.id,
          organizationId: organization.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Design generated!");
      await loadMessages();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate design");
    } finally {
      setGeneratingDesignId(null);
    }
  };

  const handleGenerateSelectedDesigns = async () => {
    const selected = messages.filter((m) => selectedIds.has(m.id) && !m.design_url);
    if (selected.length === 0) {
      toast.error("No selected messages without designs");
      return;
    }

    for (const msg of selected) {
      setGeneratingDesignId(msg.id);
      try {
        const { data, error } = await supabase.functions.invoke("generate-design", {
          body: {
            messageText: msg.message_text,
            brandName: organization.name,
            brandTone: organization.tone,
            messageId: msg.id,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      } catch (err: any) {
        toast.error(`Design failed for "${msg.message_text.slice(0, 30)}...": ${err.message}`);
      }

      // Delay between requests to avoid rate limits
      await new Promise((r) => setTimeout(r, 2000));
    }

    setGeneratingDesignId(null);
    toast.success(`Generated designs for ${selected.length} messages!`);
    await loadMessages();
  };

  const handleDeleteUnselected = async () => {
    const unselectedIds = messages
      .filter((m) => !selectedIds.has(m.id))
      .map((m) => m.id);

    if (unselectedIds.length === 0) return;

    const { error } = await supabase
      .from("generated_messages")
      .delete()
      .in("id", unselectedIds);

    if (error) {
      toast.error("Failed to delete messages");
      return;
    }
    toast.success(`Removed ${unselectedIds.length} unselected messages`);
    await loadMessages();
  };

  const handleCreateProducts = () => {
    const selected = messages.filter(
      (m) => selectedIds.has(m.id) && !m.product_id && m.design_url
    );
    if (selected.length === 0) {
      toast.error("No selected messages with designs ready to create products");
      return;
    }
    selected.forEach((m) => onCreateProduct?.(m.message_text, m.design_url!));
  };

  const selectedCount = selectedIds.size;
  const readyForProductCount = messages.filter(
    (m) => selectedIds.has(m.id) && !m.product_id && m.design_url
  ).length;
  const needsDesignCount = messages.filter(
    (m) => selectedIds.has(m.id) && !m.design_url
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
            Generate → Select → Design → Create Products
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
            <span>{selectedCount} selected</span>
            <span>·</span>
            <span>{messages.length} total</span>
            {needsDesignCount > 0 && (
              <>
                <span>·</span>
                <span>{needsDesignCount} need designs</span>
              </>
            )}
          </div>

          <div className="grid gap-2">
            {messages.map((msg) => {
              const isSelected = selectedIds.has(msg.id);
              const hasProduct = !!msg.product_id;
              const hasDesign = !!msg.design_url;
              const isGeneratingThis = generatingDesignId === msg.id;

              return (
                <div
                  key={msg.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                    isSelected
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-card hover:bg-muted/50"
                  } ${hasProduct ? "opacity-60" : ""}`}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => !hasProduct && toggleSelect(msg.id)}
                    disabled={hasProduct}
                  />

                  {/* Design thumbnail */}
                  {hasDesign ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewUrl(msg.design_url);
                        setPreviewMessage(msg.message_text);
                      }}
                      className="shrink-0 rounded-md border border-border overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all"
                    >
                      <img
                        src={msg.design_url!}
                        alt={msg.message_text}
                        className="h-12 w-12 object-cover"
                      />
                    </button>
                  ) : (
                    <div className="shrink-0 h-12 w-12 rounded-md border border-dashed border-border flex items-center justify-center">
                      <Paintbrush className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}

                  <span
                    className="flex-1 text-sm font-medium cursor-pointer"
                    onClick={() => !hasProduct && toggleSelect(msg.id)}
                  >
                    {msg.message_text}
                  </span>

                  <div className="flex items-center gap-1 shrink-0">
                    {hasProduct && (
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        Has product
                      </span>
                    )}
                    {hasDesign && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setPreviewUrl(msg.design_url);
                          setPreviewMessage(msg.message_text);
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {!hasProduct && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={isGeneratingThis || !!generatingDesignId}
                        onClick={() => handleGenerateDesign(msg)}
                        title={hasDesign ? "Regenerate design" : "Generate design"}
                      >
                        {isGeneratingThis ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : hasDesign ? (
                          <RefreshCw className="h-3.5 w-3.5" />
                        ) : (
                          <Paintbrush className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 flex-wrap">
            {needsDesignCount > 0 && (
              <Button
                onClick={handleGenerateSelectedDesigns}
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
            {messages.length - selectedCount > 0 && (
              <Button
                variant="outline"
                onClick={handleDeleteUnselected}
                className="gap-2 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Clear Unselected ({messages.length - selectedCount})
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

      {/* Design Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => { setPreviewUrl(null); setPreviewMessage(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">{previewMessage}</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <img
              src={previewUrl}
              alt={previewMessage || "Design preview"}
              className="w-full rounded-lg border border-border"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
