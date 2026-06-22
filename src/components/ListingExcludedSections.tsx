import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ListFilter } from "lucide-react";

const SECTIONS = [
  { value: "materials", label: "Materials & Specs", icon: "🧵", description: "Fabric, fit, sizing details" },
  { value: "care", label: "Care Instructions", icon: "🧺", description: "Wash, dry, iron guidance" },
  { value: "shipping", label: "Shipping & Returns", icon: "🚀", description: "Delivery times, return policy" },
];

interface Props {
  organizationId: string;
}

export const ListingExcludedSections = ({ organizationId }: Props) => {
  const [excluded, setExcluded] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("organizations")
        .select("listing_excluded_sections")
        .eq("id", organizationId)
        .single();
      if (data?.listing_excluded_sections) {
        setExcluded(data.listing_excluded_sections);
      }
      setLoading(false);
    };
    load();
  }, [organizationId]);

  const toggle = async (value: string) => {
    const updated = excluded.includes(value)
      ? excluded.filter((s) => s !== value)
      : [...excluded, value];

    setExcluded(updated);
    const { error } = await supabase
      .from("organizations")
      .update({ listing_excluded_sections: updated })
      .eq("id", organizationId);

    if (error) {
      toast.error("Failed to update excluded sections");
    } else {
      toast.success("Listing sections updated");
    }
  };

  if (loading) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <ListFilter className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Exclude from Listings</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        If your storefront already displays these in collapsible sections (e.g. Shopify metaobjects), exclude them so the AI doesn't repeat the info in the description.
      </p>
      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => {
          const isExcluded = excluded.includes(s.value);
          return (
            <Badge
              key={s.value}
              variant={isExcluded ? "default" : "outline"}
              className={`px-3 py-1.5 text-sm cursor-pointer select-none transition-colors ${
                isExcluded ? "" : "opacity-60"
              }`}
              onClick={() => toggle(s.value)}
              title={s.description}
            >
              <span className="mr-1.5">{s.icon}</span>
              {s.label}
            </Badge>
          );
        })}
      </div>
      {excluded.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3">
          The AI will skip these topics when generating listing descriptions.
        </p>
      )}
    </div>
  );
};
