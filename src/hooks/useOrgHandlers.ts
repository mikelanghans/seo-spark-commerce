import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Organization, View } from "@/types/dashboard";
import { EMPTY_ORG_FORM } from "@/types/dashboard";
import type { OrgFormState } from "@/types/dashboard";

export function useOrgHandlers(userId: string | undefined, setView: (v: View) => void) {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgsLoaded, setOrgsLoaded] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [orgForm, setOrgForm] = useState<OrgFormState>({ ...EMPTY_ORG_FORM });
  const [orgLogoFile, setOrgLogoFile] = useState<File | null>(null);
  const [orgLogoPreview, setOrgLogoPreview] = useState<string | null>(null);
  const [printifyShops, setPrintifyShops] = useState<{ id: number; title: string }[]>([]);
  const [loadingPrintifyShops, setLoadingPrintifyShops] = useState(false);
  const [deleteConfirmOrg, setDeleteConfirmOrg] = useState<Organization | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [archivedOrgs, setArchivedOrgs] = useState<Organization[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  const loadOrgs = async () => {
    setLoading(true);
    const { data } = await supabase.from("organizations").select("*").is("deleted_at", null).order("created_at", { ascending: false });
    setOrgs((data as Organization[]) || []);
    setOrgsLoaded(true);
    setLoading(false);
  };

  const loadArchivedOrgs = async () => {
    const { data } = await supabase.from("organizations").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
    setArchivedOrgs((data as Organization[]) || []);
  };

  const resetOrgForm = () => {
    setOrgForm({ ...EMPTY_ORG_FORM });
    setOrgLogoFile(null);
    setOrgLogoPreview(null);
  };

  const uploadImageToStorage = async (file: File): Promise<string | null> => {
    if (!userId) return null;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file);
    if (error) { toast.error("Image upload failed: " + error.message); return null; }
    const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
    return urlData.publicUrl;
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    let logoUrl: string | null | undefined = undefined;
    if (orgLogoFile) logoUrl = await uploadImageToStorage(orgLogoFile);

    const payload: any = { ...orgForm };
    if (logoUrl !== undefined) payload.logo_url = logoUrl;

    if (editingOrg) {
      const { error } = await supabase.from("organizations").update(payload).eq("id", editingOrg.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Organization updated!");
      setEditingOrg(null);
    } else {
      const { data: newOrg, error } = await supabase.from("organizations").insert({ ...payload, user_id: userId! }).select().single();
      if (error) { toast.error(error.message); return; }
      toast.success("Brand created! You can now upload mockup templates.");
      await loadOrgs();
      handleEditOrg(newOrg as Organization);
      return;
    }
    resetOrgForm();
    setView("orgs");
    loadOrgs();
  };

  const loadPrintifyShops = async (orgId?: string) => {
    setPrintifyShops([]);
    setLoadingPrintifyShops(true);
    try {
      const { data } = await supabase.functions.invoke("printify-get-shops", {
        body: { organizationId: orgId || editingOrg?.id || selectedOrg?.id },
      });
      setPrintifyShops(data?.shops || []);
    } catch { /* silent */ }
    setLoadingPrintifyShops(false);
  };

  const handleEditOrg = (org: Organization) => {
    setEditingOrg(org);
    setOrgForm({
      name: org.name, niche: org.niche, tone: org.tone, audience: org.audience,
      brand_font: org.brand_font || "", brand_color: org.brand_color || "",
      brand_font_size: org.brand_font_size || "large", brand_style_notes: org.brand_style_notes || "",
      design_styles: (org.design_styles as string[]) || ["text-only"],
      printify_shop_id: org.printify_shop_id || null,
      enabled_marketplaces: (org.enabled_marketplaces as string[]) || [],
      enabled_product_types: (org.enabled_product_types as string[]) || ["t-shirt"],
      enabled_social_platforms: (org.enabled_social_platforms as string[]) || [],
      default_size_pricing: (org.default_size_pricing as Record<string, Record<string, string>>) || {},
      design_variant_mode: (org.design_variant_mode as "both" | "light-only" | "dark-only") || "both",
    });
    setOrgLogoPreview(org.logo_url || null);
    setOrgLogoFile(null);
    setView("org-form");
    loadPrintifyShops(org.id);
  };

  const handleOrgLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setOrgLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setOrgLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDeleteOrg = (org: Organization) => { setDeleteConfirmOrg(org); setDeleteConfirmText(""); };

  const confirmDeleteOrg = async () => {
    if (!deleteConfirmOrg) return;
    await supabase.from("organizations").update({ deleted_at: new Date().toISOString() }).eq("id", deleteConfirmOrg.id);
    toast.success("Brand archived — it can be restored within 30 days");
    setDeleteConfirmOrg(null);
    setDeleteConfirmText("");
    loadOrgs();
  };

  const handleRestoreOrg = async (id: string) => {
    await supabase.from("organizations").update({ deleted_at: null }).eq("id", id);
    toast.success("Brand restored!");
    loadOrgs();
    loadArchivedOrgs();
  };

  return {
    orgs, orgsLoaded, selectedOrg, setSelectedOrg, loading,
    editingOrg, setEditingOrg, orgForm, setOrgForm,
    orgLogoPreview,
    printifyShops, loadingPrintifyShops,
    deleteConfirmOrg, setDeleteConfirmOrg, deleteConfirmText, setDeleteConfirmText,
    archivedOrgs, showArchived, setShowArchived,
    loadOrgs, loadArchivedOrgs, resetOrgForm,
    handleCreateOrg, handleEditOrg, handleDeleteOrg, confirmDeleteOrg, handleRestoreOrg,
    loadPrintifyShops, handleOrgLogoUpload,
    uploadImageToStorage,
  };
}
