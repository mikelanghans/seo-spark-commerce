import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SizePricingEditor } from "./SizePricingEditor";
import { PRODUCT_TYPES, type ProductTypeKey } from "@/lib/productTypes";
import { DollarSign, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  organizationId: string;
}

export const SizePricingSettings = ({ organizationId }: Props) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabledTypes, setEnabledTypes] = useState<ProductTypeKey[]>([]);
  const [pricing, setPricing] = useState<Record<string, Record<string, string>>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("organizations")
        .select("enabled_product_types, default_size_pricing")
        .eq("id", organizationId)
        .single();

      if (data) {
        setEnabledTypes((data.enabled_product_types || []) as ProductTypeKey[]);
        const saved = (data as any).default_size_pricing as Record<string, Record<string, string>> | null;
        // Merge saved pricing with defaults so all sizes have values
        const merged: Record<string, Record<string, string>> = {};
        for (const key of (data.enabled_product_types || []) as ProductTypeKey[]) {
          const pt = PRODUCT_TYPES[key];
          if (pt?.sizes?.length) {
            merged[key] = {};
            for (const size of pt.sizes) {
              merged[key][size] = saved?.[key]?.[size] || pt.defaultSizePricing[size] || "";
            }
          }
        }
        setPricing(merged);
      }
      setLoading(false);
    };
    load();
  }, [organizationId]);

  const handleChange = useCallback((updated: Record<string, Record<string, string>>) => {
    setPricing(updated);
    setHasChanges(true);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ default_size_pricing: pricing as any })
        .eq("id", organizationId);
      if (error) throw error;
      setHasChanges(false);
      toast.success("Size pricing saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <DollarSign className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Size Pricing</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Set default prices per size for each product type. These apply to all new products unless overridden.
      </p>
      <SizePricingEditor
        enabledTypes={enabledTypes}
        value={pricing}
        onChange={handleChange}
      />
      {hasChanges && (
        <div className="mt-4">
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Pricing
          </Button>
        </div>
      )}
    </div>
  );
};
