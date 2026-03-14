import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DesignPreviewDialog } from "@/components/DesignPreviewDialog";
import { Check, X, Eye, Loader2, Paintbrush, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Organization {
  id: string;
  name: string;
  niche: string;
  tone: string;
  audience: string;
}

interface UnprocessedDesign {
  id: string;
  message_text: string;
  design_url: string;
  dark_design_url: string | null;
  created_at: string;
}

interface Props {
  organization: Organization;
  userId: string;
  onProductCreated?: () => void;
}

export const DesignTriage = ({ organization, userId, onProductCreated }: Props) => {
  const [designs, setDesigns] = useState<UnprocessedDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(true);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const loadDesigns = async () => {
    const { data } = await supabase
      .from("generated_messages")
      .select("id, message_text, design_url, dark_design_url, created_at")
      .eq("organization_id", organization.id)
      .not("design_url", "is", null)
      .is("product_id", null)
      .order("created_at", { ascending: false });
    setDesigns((data as UnprocessedDesign[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadDesigns();
  }, [organization.id]);

  const handleApprove = async (design: UnprocessedDesign) => {
    setProcessing((p) => new Set(p).add(design.id));

    const autoDescription = `${design.message_text} — A premium print-on-demand ${organization.niche ? organization.niche + " " : ""}t-shirt featuring bold minimalist typography. Designed for ${organization.audience || "everyday wear"}. Part of the ${organization.name} collection.`;
    const autoFeatures = "Premium cotton blend\nComfortable unisex fit\nDurable print quality\nPre-shrunk fabric\nDouble-stitched hems";
    const autoKeywords = design.message_text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .join(", ") + ", t-shirt, print on demand, minimalist, typography";

    const { data: product, error } = await supabase
      .from("products")
      .insert({
        title: design.message_text,
        description: autoDescription,
        keywords: autoKeywords,
        category: "T-Shirt",
        price: "29.99",
        features: autoFeatures,
        organization_id: organization.id,
        user_id: userId,
        image_url: design.design_url,
      })
      .select("id")
      .single();

    if (error) {
      toast.error("Failed to create product");
      setProcessing((p) => { const n = new Set(p); n.delete(design.id); return n; });
      return;
    }

    await supabase.from("generated_messages").update({ product_id: product.id }).eq("id", design.id);

    const designEntries: any[] = [
      { product_id: product.id, user_id: userId, image_url: design.design_url, image_type: "design", color_name: "light-on-dark", position: 0 },
    ];
    if (design.dark_design_url) {
      designEntries.push({ product_id: product.id, user_id: userId, image_url: design.dark_design_url, image_type: "design", color_name: "dark-on-light", position: 1 });
    }
    await supabase.from("product_images").insert(designEntries);

    toast.success("Product created from design!");
    setDesigns((prev) => prev.filter((d) => d.id !== design.id));
    setProcessing((p) => { const n = new Set(p); n.delete(design.id); return n; });
    onProductCreated?.();
  };

  const handleDiscard = async (design: UnprocessedDesign) => {
    setProcessing((p) => new Set(p).add(design.id));

    // Clear design but keep the message
    await supabase
      .from("generated_messages")
      .update({ design_url: null, dark_design_url: null })
      .eq("id", design.id);

    toast.success("Design discarded — message kept in Ideas");
    setDesigns((prev) => prev.filter((d) => d.id !== design.id));
    setProcessing((p) => { const n = new Set(p); n.delete(design.id); return n; });
  };

  const previewDesign = designs.find((d) => d.id === previewId);

  if (loading) return null;
  if (designs.length === 0) return null;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Paintbrush className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Design Triage</h3>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {designs.length}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <>
          <p className="text-xs text-muted-foreground">
            Designs ready for review — approve to create a product or discard to start fresh.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {designs.map((design) => {
              const isProcessing = processing.has(design.id);
              return (
                <div
                  key={design.id}
                  className="group relative rounded-lg border border-border bg-card overflow-hidden transition-colors hover:border-primary/40"
                >
                  <button
                    type="button"
                    onClick={() => setPreviewId(design.id)}
                    className="block w-full"
                  >
                    <div className="h-36 overflow-hidden bg-secondary">
                      <img
                        src={design.design_url}
                        alt={design.message_text}
                        className="h-full w-full object-contain p-2"
                      />
                    </div>
                  </button>
                  <div className="p-3 space-y-2">
                    <p className="text-xs font-medium leading-snug line-clamp-2">
                      {design.message_text}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="default"
                        className="flex-1 gap-1 h-7 text-xs"
                        disabled={isProcessing}
                        onClick={() => handleApprove(design)}
                      >
                        {isProcessing ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => setPreviewId(design.id)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={isProcessing}
                        onClick={() => handleDiscard(design)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <DesignPreviewDialog
        open={!!previewId}
        onClose={() => setPreviewId(null)}
        designUrl={previewDesign?.design_url || null}
        darkDesignUrl={previewDesign?.dark_design_url || null}
        messageText={previewDesign?.message_text || null}
        messageId={previewId}
        organizationId={organization.id}
        userId={userId}
        hasProduct={false}
        onCreateProduct={previewDesign ? async () => {
          if (previewDesign) {
            await handleApprove(previewDesign);
            setPreviewId(null);
          }
        } : undefined}
        onDiscardDesign={previewDesign ? async () => {
          if (previewDesign) {
            await handleDiscard(previewDesign);
            setPreviewId(null);
          }
        } : undefined}
      />
    </div>
  );
};
