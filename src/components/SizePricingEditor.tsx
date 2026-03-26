import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRODUCT_TYPES, type ProductTypeKey } from "@/lib/productTypes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
  /** Which product types to show (filters to only types with sizes) */
  enabledTypes: ProductTypeKey[];
  /** Current pricing map: { "t-shirt": { "S": "29.99", ... }, ... } */
  value: Record<string, Record<string, string>>;
  /** Called when any price changes */
  onChange: (updated: Record<string, Record<string, string>>) => void;
  /** If true, shows "Using defaults" hint and only renders overrides */
  isProductLevel?: boolean;
}

export const SizePricingEditor = ({ enabledTypes, value, onChange, isProductLevel }: Props) => {
  const typesWithSizes = enabledTypes
    .filter((key) => PRODUCT_TYPES[key]?.sizes?.length > 0)
    .map((key) => PRODUCT_TYPES[key]);

  const [activeTab, setActiveTab] = useState(typesWithSizes[0]?.key || "");

  if (typesWithSizes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        None of your enabled product types have size variants.
      </p>
    );
  }

  const handlePriceChange = (typeKey: string, size: string, price: string) => {
    const sanitized = price.replace(/[^0-9.]/g, "");
    const updated = {
      ...value,
      [typeKey]: {
        ...(value[typeKey] || {}),
        [size]: sanitized,
      },
    };
    onChange(updated);
  };

  const getPrice = (typeKey: string, size: string): string => {
    return value[typeKey]?.[size] ?? "";
  };

  const getPlaceholder = (typeKey: string, size: string): string => {
    return PRODUCT_TYPES[typeKey as ProductTypeKey]?.defaultSizePricing[size] || "";
  };

  const [activeTab, setActiveTab] = useState(typesWithSizes[0]?.key || "");

  return (
    <div className="space-y-3">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          {typesWithSizes.map((pt) => (
            <TabsTrigger key={pt.key} value={pt.key} className="text-xs">
              {pt.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {typesWithSizes.map((pt) => (
          <TabsContent key={pt.key} value={pt.key} className="mt-3">
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
                      value={getPrice(pt.key, size)}
                      placeholder={getPlaceholder(pt.key, size)}
                      onChange={(e) => handlePriceChange(pt.key, size, e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
            {isProductLevel && (
              <p className="text-xs text-muted-foreground mt-2">
                Leave blank to use brand defaults.
              </p>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};
