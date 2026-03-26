import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_TYPES, type ProductTypeKey } from "@/lib/productTypes";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Package } from "lucide-react";

interface Props {
  organizationId: string;
}

export const ProductTypeSettings = ({ organizationId }: Props) => {
  const [enabled, setEnabled] = useState<ProductTypeKey[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("organizations")
        .select("enabled_product_types")
        .eq("id", organizationId)
        .single();
      if (data?.enabled_product_types) {
        setEnabled(data.enabled_product_types as ProductTypeKey[]);
      }
      setLoading(false);
    };
    load();
  }, [organizationId]);

  const toggle = async (key: ProductTypeKey) => {
    const updated = enabled.includes(key)
      ? enabled.filter((k) => k !== key)
      : [...enabled, key];

    if (updated.length === 0) {
      toast.error("You must have at least one product type enabled");
      return;
    }

    setEnabled(updated);
    const { error } = await supabase
      .from("organizations")
      .update({ enabled_product_types: updated })
      .eq("id", organizationId);

    if (error) {
      toast.error("Failed to update product types");
    } else {
      toast.success("Product types updated");
    }
  };

  if (loading) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Package className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Product Types</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Choose which product types are available for this brand
      </p>
      <div className="space-y-3">
        {Object.values(PRODUCT_TYPES).map((pt) => (
          <label
            key={pt.key}
            className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/30 transition-colors"
          >
            <Checkbox
              checked={enabled.includes(pt.key)}
              onCheckedChange={() => toggle(pt.key)}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{pt.label}</p>
              <p className="text-xs text-muted-foreground">
                {pt.colors.length} colors · Default {pt.defaultPrice}
              </p>
            </div>
            <div className="flex gap-0.5">
              {pt.colors.slice(0, 6).map((c) => (
                <div
                  key={c.name}
                  className="h-4 w-4 rounded-full border border-border"
                  style={{ backgroundColor: c.hex }}
                  title={c.name}
                />
              ))}
              {pt.colors.length > 6 && (
                <span className="text-[10px] text-muted-foreground ml-1">+{pt.colors.length - 6}</span>
              )}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
};
