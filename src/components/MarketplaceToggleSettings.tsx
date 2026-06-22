import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Store } from "lucide-react";

const MARKETPLACES = [
  { value: "etsy", label: "Etsy", icon: "🧶" },
  { value: "ebay", label: "eBay", icon: "🏷️" },
  { value: "tiktok", label: "TikTok Shop", icon: "🎵" },
];

interface Props {
  organizationId: string;
}

export const MarketplaceToggleSettings = ({ organizationId }: Props) => {
  const [enabled, setEnabled] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("organizations")
        .select("enabled_marketplaces")
        .eq("id", organizationId)
        .single();
      if (data?.enabled_marketplaces) {
        setEnabled(data.enabled_marketplaces);
      }
      setLoading(false);
    };
    load();
  }, [organizationId]);

  const toggle = async (value: string) => {
    const updated = enabled.includes(value)
      ? enabled.filter((m) => m !== value)
      : [...enabled, value];

    setEnabled(updated);
    const { error } = await supabase
      .from("organizations")
      .update({ enabled_marketplaces: updated })
      .eq("id", organizationId);

    if (error) {
      toast.error("Failed to update marketplaces");
    } else {
      toast.success("Marketplaces updated");
    }
  };

  if (loading) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Store className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Enabled Marketplaces</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Toggle which marketplaces this brand sells on — only enabled ones appear in listing generation and push
      </p>
      <div className="flex flex-wrap gap-2">
        {MARKETPLACES.map((mp) => {
          const isActive = enabled.includes(mp.value);
          return (
            <Badge
              key={mp.value}
              variant={isActive ? "default" : "outline"}
              className={`px-3 py-1.5 text-sm cursor-pointer select-none transition-colors ${
                isActive ? "" : "opacity-60"
              }`}
              onClick={() => toggle(mp.value)}
            >
              <span className="mr-1.5">{mp.icon}</span>
              {mp.label}
            </Badge>
          );
        })}
      </div>
      {enabled.length === 0 && (
        <p className="text-xs text-muted-foreground mt-3">
          None selected — all marketplaces will be shown by default
        </p>
      )}
    </div>
  );
};
