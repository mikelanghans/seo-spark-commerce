import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Share2 } from "lucide-react";

const SOCIAL_PLATFORMS = [
  { value: "instagram", label: "Instagram", icon: "📸" },
  { value: "facebook", label: "Facebook", icon: "📘" },
  { value: "twitter", label: "Twitter / X", icon: "🐦" },
  { value: "tiktok", label: "TikTok", icon: "🎵" },
  { value: "pinterest", label: "Pinterest", icon: "📌" },
];

interface Props {
  organizationId: string;
}

export const SocialPlatformSettings = ({ organizationId }: Props) => {
  const [enabled, setEnabled] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("organizations")
        .select("enabled_social_platforms")
        .eq("id", organizationId)
        .single();
      if ((data as any)?.enabled_social_platforms) {
        setEnabled((data as any).enabled_social_platforms);
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
      .update({ enabled_social_platforms: updated } as any)
      .eq("id", organizationId);

    if (error) {
      toast.error("Failed to update social platforms");
    } else {
      toast.success("Social platforms updated");
    }
  };

  if (loading) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Share2 className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Social Media Platforms</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Choose which social platforms are available for post generation and scheduling
      </p>
      <div className="flex flex-wrap gap-2">
        {SOCIAL_PLATFORMS.map((sp) => {
          const isActive = enabled.includes(sp.value);
          return (
            <Badge
              key={sp.value}
              variant={isActive ? "default" : "outline"}
              className={`px-3 py-1.5 text-sm cursor-pointer select-none transition-colors ${
                isActive ? "" : "opacity-60"
              }`}
              onClick={() => toggle(sp.value)}
            >
              <span className="mr-1.5">{sp.icon}</span>
              {sp.label}
            </Badge>
          );
        })}
      </div>
      {enabled.length === 0 && (
        <p className="text-xs text-muted-foreground mt-3">
          None selected — all platforms will be available by default
        </p>
      )}
    </div>
  );
};
