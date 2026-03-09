import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sparkles, Check, Trash2, ArrowRight } from "lucide-react";
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
  created_at: string;
}

interface Props {
  organization: Organization;
  userId: string;
  onCreateProduct?: (messageText: string) => void;
}

export const MessageGenerator = ({ organization, userId, onCreateProduct }: Props) => {
  const [messages, setMessages] = useState<GeneratedMessage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    // Pre-select already selected ones
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

      // Save to database
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
    const selected = messages.filter((m) => selectedIds.has(m.id) && !m.product_id);
    if (selected.length === 0) {
      toast.error("No new selected messages to create products for");
      return;
    }
    selected.forEach((m) => onCreateProduct?.(m.message_text));
  };

  const selectedCount = selectedIds.size;
  const unlinkedSelectedCount = messages.filter(
    (m) => selectedIds.has(m.id) && !m.product_id
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
            AI-generated messages for {organization.name}. Select the ones you want to turn into products.
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
          </div>

          <div className="grid gap-2">
            {messages.map((msg) => {
              const isSelected = selectedIds.has(msg.id);
              const hasProduct = !!msg.product_id;

              return (
                <div
                  key={msg.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors cursor-pointer ${
                    isSelected
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-card hover:bg-muted/50"
                  } ${hasProduct ? "opacity-60" : ""}`}
                  onClick={() => !hasProduct && toggleSelect(msg.id)}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => !hasProduct && toggleSelect(msg.id)}
                    disabled={hasProduct}
                  />
                  <span className="flex-1 text-sm font-medium">
                    {msg.message_text}
                  </span>
                  {hasProduct && (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      Has product
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 flex-wrap">
            {unlinkedSelectedCount > 0 && onCreateProduct && (
              <Button onClick={handleCreateProducts} className="gap-2">
                <ArrowRight className="h-4 w-4" />
                Create {unlinkedSelectedCount} Product{unlinkedSelectedCount > 1 ? "s" : ""}
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
    </div>
  );
};
