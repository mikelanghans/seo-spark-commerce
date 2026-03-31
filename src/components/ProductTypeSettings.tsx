import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_TYPES, type ProductTypeKey } from "@/lib/productTypes";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Package, Lock, Upload, X, ImageIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  organizationId: string;
}

export const ProductTypeSettings = ({ organizationId }: Props) => {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState<ProductTypeKey[]>(["t-shirt"]);
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("organizations")
        .select("enabled_product_types, mockup_templates")
        .eq("id", organizationId)
        .single();
      if (data?.enabled_product_types) {
        setEnabled(data.enabled_product_types as ProductTypeKey[]);
      }
      if (data?.mockup_templates) {
        setTemplates((data.mockup_templates as Record<string, string>) || {});
      }
      setLoading(false);
    };
    load();
  }, [organizationId]);

  const handleUpload = async (key: ProductTypeKey, file: File) => {
    if (!user) return;
    setUploading(key);
    try {
      const ext = file.name.split(".").pop() || "png";
      const filePath = `${user.id}/mockup-templates/${organizationId}/${key}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(filePath, file, { contentType: file.type, upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(filePath);
      const url = urlData.publicUrl;

      const updated = { ...templates, [key]: url };
      const { error: updateError } = await supabase
        .from("organizations")
        .update({ mockup_templates: updated } as any)
        .eq("id", organizationId);
      if (updateError) throw updateError;

      setTemplates(updated);
      toast.success(`${PRODUCT_TYPES[key].label} template uploaded`);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const handleRemove = async (key: ProductTypeKey) => {
    const updated = { ...templates };
    delete updated[key];
    const { error } = await supabase
      .from("organizations")
      .update({ mockup_templates: updated } as any)
      .eq("id", organizationId);
    if (error) { toast.error("Failed to remove template"); return; }
    setTemplates(updated);
    toast.success(`${PRODUCT_TYPES[key].label} template removed`);
  };

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
      <div className="flex flex-wrap gap-2 mb-6">
        {Object.values(PRODUCT_TYPES).map((pt) => (
          <Badge
            key={pt.key}
            variant={isActive(pt.key) ? "default" : "outline"}
            className={`px-3 py-1.5 text-sm cursor-default select-none ${
              isComingSoon(pt.key) ? "opacity-50 border-dashed" : ""
            }`}
          >
            {pt.label}
            {isComingSoon(pt.key) && (
              <Lock className="h-3 w-3 ml-1.5 inline-block" />
            )}
          </Badge>
        ))}
      </div>

      {/* Mockup template uploads for enabled types */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">Mockup Templates</h4>
        </div>
        <p className="text-xs text-muted-foreground">
          Upload a base garment photo for each product type. These are used as AI mockup generation templates.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {enabled.map((key) => {
            const pt = PRODUCT_TYPES[key];
            if (!pt) return null;
            const templateUrl = templates[key];
            const isCurrentlyUploading = uploading === key;

            return (
              <div
                key={key}
                className="relative flex items-center gap-3 rounded-lg border border-border bg-background p-3"
              >
                {templateUrl ? (
                  <>
                    <img
                      src={templateUrl}
                      alt={`${pt.label} template`}
                      className="h-14 w-14 rounded-md object-cover border border-border"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{pt.label}</p>
                      <label
                        htmlFor={`template-${key}`}
                        className="cursor-pointer text-xs text-muted-foreground underline hover:text-foreground"
                      >
                        Replace
                      </label>
                    </div>
                    <button
                      onClick={() => handleRemove(key)}
                      className="absolute top-2 right-2 rounded-full p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <label
                    htmlFor={`template-${key}`}
                    className="flex flex-1 items-center gap-3 cursor-pointer"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-border bg-muted/50">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{pt.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {isCurrentlyUploading ? "Uploading…" : "Upload template"}
                      </p>
                    </div>
                  </label>
                )}
                <input
                  id={`template-${key}`}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={isCurrentlyUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(key, file);
                    e.target.value = "";
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        More product types coming soon.
      </p>
    </div>
  );
};
