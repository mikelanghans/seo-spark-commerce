import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_TYPES, type ProductTypeKey } from "@/lib/productTypes";
import { DollarSign, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Props {
  organizationId: string;
}

const ACTIVE_TYPE: ProductTypeKey = "t-shirt";

export const SizePricingSettings = ({ organizationId }: Props) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pricing, setPricing] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const pt = PRODUCT_TYPES[ACTIVE_TYPE];

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("organizations")
        .select("default_size_pricing")
        .eq("id", organizationId)
        .single();

      const saved = (data as any)?.default_size_pricing as Record<string, Record<string, string>> | null;
      const merged: Record<string, string> = {};
      for (const size of pt.sizes) {
        merged[size] = saved?.[ACTIVE_TYPE]?.[size] || pt.defaultSizePricing[size] || "";
      }
      setPricing(merged);
      setLoading(false);
    };
    load();
  }, [organizationId]);

  const handlePriceChange = (size: string, price: string) => {
    const sanitized = price.replace(/[^0-9.]/g, "");
    setPricing((prev) => ({ ...prev, [size]: sanitized }));
    setHasChanges(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ default_size_pricing: { [ACTIVE_TYPE]: pricing } as any })
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

  const typesWithSizes = Object.values(PRODUCT_TYPES).filter((t) => t.sizes.length > 0);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <DollarSign className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Size Pricing</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Set default prices per size. These apply to all new products unless overridden.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {typesWithSizes.map((t) => (
          <Badge
            key={t.key}
            variant={t.key === ACTIVE_TYPE ? "default" : "outline"}
            className={`px-3 py-1.5 text-sm cursor-default select-none ${
              t.key !== ACTIVE_TYPE ? "opacity-50 border-dashed" : ""
            }`}
          >
            {t.label}
            {t.key !== ACTIVE_TYPE && <Lock className="h-3 w-3 ml-1.5 inline-block" />}
          </Badge>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {pt.sizes.map((size) => (
          <div key={size}>
            <Label className="text-xs text-muted-foreground">{size}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input
                type="text"
                inputMode="decimal"
                className="pl-7"
                value={pricing[size] || ""}
                placeholder={pt.defaultSizePricing[size] || ""}
                onChange={(e) => handlePriceChange(size, e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>

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
