import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRODUCT_TYPES, type ProductTypeKey } from "@/lib/productTypes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
  /** Which product types to show (filters to only types with sizes) */
  enabledTypes: ProductTypeKey[];
  /** Current pricing map: { "t-shirt": { "S": "29.99", ... }, ... } */
  value: Record<string, Record<string, string>>;
  /** Called (debounced) when any price changes */
  onChange: (updated: Record<string, Record<string, string>>) => void;
  /** If true, shows "Using defaults" hint and only renders overrides */
  isProductLevel?: boolean;
}

export const SizePricingEditor = ({ enabledTypes, value, onChange, isProductLevel }: Props) => {
  const typesWithSizes = enabledTypes
    .filter((key) => PRODUCT_TYPES[key]?.sizes?.length > 0)
    .map((key) => PRODUCT_TYPES[key]);

  const [activeTab, setActiveTab] = useState(typesWithSizes[0]?.key || "");
  // Local mirror so typing is instant; we only call onChange after the user pauses.
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync from parent when the underlying value changes from outside (e.g. switching products),
  // but ignore parent updates while the user is mid-edit (debounce pending).
  useEffect(() => {
    if (debounceRef.current) return;
    setLocalValue(value);
  }, [value]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

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
      ...localValue,
      [typeKey]: {
        ...(localValue[typeKey] || {}),
        [size]: sanitized,
      },
    };
    setLocalValue(updated);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      onChange(updated);
    }, 800);
  };

  const getPrice = (typeKey: string, size: string): string => {
    return localValue[typeKey]?.[size] ?? "";
  };

  const getPlaceholder = (typeKey: string, size: string): string => {
    return PRODUCT_TYPES[typeKey as ProductTypeKey]?.defaultSizePricing[size] || "";
  };


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
