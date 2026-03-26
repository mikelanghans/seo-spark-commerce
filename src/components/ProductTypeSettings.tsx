import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_TYPES, type ProductTypeKey } from "@/lib/productTypes";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Package, Lock } from "lucide-react";

interface Props {
  organizationId: string;
}

export const ProductTypeSettings = ({ organizationId }: Props) => {
  const [enabled, setEnabled] = useState<ProductTypeKey[]>(["t-shirt"]);
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

  if (loading) return null;

  const isActive = (key: ProductTypeKey) => enabled.includes(key);
  const isComingSoon = (key: ProductTypeKey) => key !== "t-shirt";

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Package className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Product Types</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Available product types for this brand
      </p>
      <div className="flex flex-wrap gap-2">
        {Object.values(PRODUCT_TYPES).map((pt) => (
          <Badge
            key={pt.key}
            variant={isActive(pt.key) ? "default" : "outline"}
            className={`px-3 py-1.5 text-sm cursor-default select-none ${
              isComingSoon(pt.key)
                ? "opacity-50 border-dashed"
                : ""
            }`}
          >
            {pt.label}
            {isComingSoon(pt.key) && (
              <Lock className="h-3 w-3 ml-1.5 inline-block" />
            )}
          </Badge>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        More product types coming soon.
      </p>
    </div>
  );
};
