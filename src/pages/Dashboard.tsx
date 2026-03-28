import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { insertProductImagesDeduped } from "@/lib/productImageUtils";
import { PRODUCT_TYPES, type ProductTypeKey } from "@/lib/productTypes";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ListingOutput, ListingData } from "@/components/ListingOutput";
import { BulkUpload } from "@/components/BulkUpload";
import { AutopilotPipeline } from "@/components/AutopilotPipeline";
import { ShopifyEnrich } from "@/components/ShopifyEnrich";
import { ProductMockups } from "@/components/ProductMockups";
import { ShopifySettings } from "@/components/ShopifySettings";
import { MarketplaceSettings } from "@/components/MarketplaceSettings";
import { ProductTypeSettings } from "@/components/ProductTypeSettings";
import { MarketplaceToggleSettings } from "@/components/MarketplaceToggleSettings";
import { SocialPlatformSettings } from "@/components/SocialPlatformSettings";
import { PrintifySettings } from "@/components/PrintifySettings";
import { SizePricingSettings } from "@/components/SizePricingSettings";
import { PushToShopify } from "@/components/PushToShopify";
import { PushToPrintify } from "@/components/PushToPrintify";
import { PushToMarketplace } from "@/components/PushToMarketplace";
import { MessageGenerator } from "@/components/MessageGenerator";
import { CollaborationHub } from "@/components/CollaborationHub";
import { SocialPostGenerator } from "@/components/SocialPostGenerator";
import { ContentCalendar } from "@/components/ContentCalendar";
import { SyncDashboard } from "@/components/SyncDashboard";
import { FullAutopilot } from "@/components/FullAutopilot";
import { DesignTriage } from "@/components/DesignTriage";
import { ProductGrid } from "@/components/ProductGrid";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { RegenerateAllMockups } from "@/components/RegenerateAllMockups";
import { canAccess, type AppFeature } from "@/lib/featureGates";
import {
  Sparkles, Plus, Building2, Package, ArrowLeft, LogOut, Loader2, Trash2, Eye, ImageIcon, Upload, Search, Edit2, Check, Settings, RefreshCw, Store, Download, X, Users, Share2, CalendarDays, GitCompare, ChevronDown, Zap, Rocket, Sun, Moon, Lock, Shield, BarChart3, BookOpen, DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import brandAuraIcon from "@/assets/brand-aura-icon-new.png";
import { useAiUsage } from "@/hooks/useAiUsage";
import { AiUsageMeter } from "@/components/AiUsageMeter";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationBell } from "@/components/NotificationBell";
import { notifyLowCredits, notifySyncFailure } from "@/lib/notificationHelpers";
import { useSubscription } from "@/hooks/useSubscription";
import { OnboardingTour, OnboardingTrigger } from "@/components/OnboardingTour";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { ListingRefreshQueue } from "@/components/ListingRefreshQueue";
import { ABTestDashboard } from "@/components/ABTestDashboard";
import { SmartPricing } from "@/components/SmartPricing";
import { removeBackground, smartRemoveBackground, recolorOpaquePixels, upscaleBase64Png, isMultiColorDesign } from "@/lib/removeBackground";

// Extracted components
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { SettingsView } from "@/components/dashboard/SettingsView";
import { DeleteOrgDialog } from "@/components/dashboard/DeleteOrgDialog";
import { OrgListView } from "@/components/dashboard/OrgListView";

// Shared types
import type { Organization, Product, Listing, View } from "@/types/dashboard";
import { ALL_MARKETPLACES, ALL_PUSH_CHANNELS, EMPTY_ORG_FORM, EMPTY_PRODUCT_FORM } from "@/types/dashboard";
import type { OrgFormState, ProductFormState } from "@/types/dashboard";

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [view, _setView] = useState<View>(() => {
    return (sessionStorage.getItem("dash_view") as View) || "orgs";
  });
  const setView = (v: View) => {
    sessionStorage.setItem("dash_view", v);
    _setView(v);
  };
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgsLoaded, setOrgsLoaded] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [_restoredNav, setRestoredNav] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pendingDesignUrl, setPendingDesignUrl] = useState<string | null>(null);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [designPreviewOpen, setDesignPreviewOpen] = useState(false);

  // Form states
  const [orgForm, setOrgForm] = useState<OrgFormState>({ ...EMPTY_ORG_FORM });
  const [printifyShops, setPrintifyShops] = useState<{ id: number; title: string }[]>([]);
  const [loadingPrintifyShops, setLoadingPrintifyShops] = useState(false);
  const [orgTemplateFile, setOrgTemplateFile] = useState<File | null>(null);
  const [orgTemplatePreview, setOrgTemplatePreview] = useState<string | null>(null);
  const [orgLogoFile, setOrgLogoFile] = useState<File | null>(null);
  const [orgLogoPreview, setOrgLogoPreview] = useState<string | null>(null);
  const [selectedMarketplaces, setSelectedMarketplaces] = useState<string[]>([]);
  const [productForm, setProductForm] = useState<ProductFormState>({ ...EMPTY_PRODUCT_FORM });
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAutoFill, setAiAutoFill] = useState(true);
  const [isProcessingDesign, setIsProcessingDesign] = useState(false);
  const [designProcessingStep, setDesignProcessingStep] = useState("");
  const [pendingLightDesignUrl, setPendingLightDesignUrl] = useState<string | null>(null);
  const [pendingDarkDesignUrl, setPendingDarkDesignUrl] = useState<string | null>(null);
  const [msgRefreshKey, setMsgRefreshKey] = useState(0);
  const subscription = useSubscription(user?.id ?? null);
  const effectiveTier = subscription.loading ? "pro" as const : subscription.tier;
  const aiUsage = useAiUsage(user?.id ?? null, selectedOrg?.id ?? null, subscription.creditsLimit);
  const [showTour, setShowTour] = useState(() => !localStorage.getItem("brand_aura_tour_seen"));
  const [isAdmin, setIsAdmin] = useState(false);
  const notifs = useNotifications(user?.id ?? null);
  const [lowCreditNotified, setLowCreditNotified] = useState(false);

  useEffect(() => {
    if (user) {
      loadOrgs();
      supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
        .then(({ data }) => setIsAdmin(!!data));
      
      const params = new URLSearchParams(window.location.search);
      if (params.get("subscription_activated")) {
        window.history.replaceState({}, "", window.location.pathname);
        toast.success("Subscription activated! Your plan has been upgraded.");
        subscription.refresh();
      }

      const creditsPurchased = params.get("credits_purchased");
      if (creditsPurchased) {
        window.history.replaceState({}, "", window.location.pathname);
        const credits = parseInt(creditsPurchased, 10);
        if (credits > 0) {
          toast.success(`Payment received! ${credits} AI credits are being added to your account.`);
          const pollCredits = (attempts = 0) => {
            setTimeout(() => {
              aiUsage.refetch();
              if (attempts < 5) pollCredits(attempts + 1);
            }, 2000);
          };
          pollCredits();
        }
      }

      let code = params.get("code");
      if (!code) {
        code = localStorage.getItem("shopify_oauth_code");
        if (code) {
          localStorage.removeItem("shopify_oauth_code");
          localStorage.removeItem("shopify_oauth_shop");
        }
      } else {
        window.history.replaceState({}, "", window.location.pathname);
      }
      
      if (code) {
        toast.info("Exchanging Shopify authorization code...");
        const orgId = selectedOrg?.id || sessionStorage.getItem("dash_org_id") || undefined;
        supabase.functions.invoke("shopify-exchange-token", {
          body: { code, organizationId: orgId },
        }).then(({ data, error }) => {
          if (error) toast.error("Failed to connect Shopify: " + error.message);
          else if (data?.error) toast.error(data.error);
          else { toast.success("Shopify connected successfully!"); setView("settings"); }
        });
      }
    }
  }, [user]);

  useEffect(() => {
    if (!user || aiUsage.loading || lowCreditNotified) return;
    const remaining = aiUsage.limit - aiUsage.usedCount;
    const threshold = Math.max(1, Math.floor(aiUsage.limit * 0.2));
    if (remaining > 0 && remaining <= threshold) {
      setLowCreditNotified(true);
      notifyLowCredits(user.id, remaining);
    }
  }, [user, aiUsage.loading, aiUsage.usedCount, aiUsage.limit, lowCreditNotified]);

  useEffect(() => {
    if (selectedOrg) sessionStorage.setItem("dash_org_id", selectedOrg.id);
    else sessionStorage.removeItem("dash_org_id");
  }, [selectedOrg]);

  useEffect(() => {
    if (selectedProduct) sessionStorage.setItem("dash_product_id", selectedProduct.id);
    else sessionStorage.removeItem("dash_product_id");
  }, [selectedProduct]);

  useEffect(() => {
    if (_restoredNav || !orgsLoaded) return;
    if (orgs.length === 0) { setRestoredNav(true); setView("orgs"); return; }
    setRestoredNav(true);
    const savedOrgId = sessionStorage.getItem("dash_org_id");
    const savedProductId = sessionStorage.getItem("dash_product_id");
    if (!savedOrgId) { setView("orgs"); return; }
    const org = orgs.find(o => o.id === savedOrgId);
    if (!org) { setView("orgs"); return; }
    setSelectedOrg(org);
    loadProducts(org.id).then((prods) => {
      if (savedProductId && (view === "product-detail")) {
        const prod = (prods || []).find((p: Product) => p.id === savedProductId);
        if (prod) { setSelectedProduct(prod); loadListings(prod.id); }
        else setView("products");
      } else if (!["orgs", "org-form", "products", "product-detail", "settings", "autopilot", "bulk-upload", "shopify-enrich"].includes(view)) {
        setView("products");
      }
    });
  }, [orgs, orgsLoaded]);

  // ─── Data loaders ───
  const loadOrgs = async () => {
    setLoading(true);
    const { data } = await supabase.from("organizations").select("*").is("deleted_at", null).order("created_at", { ascending: false });
    setOrgs((data as Organization[]) || []);
    setOrgsLoaded(true);
    setLoading(false);
  };

  const loadProducts = async (orgId: string): Promise<Product[]> => {
    setLoading(true);
    const { data } = await supabase.from("products").select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
    const prods = (data as Product[]) || [];
    setProducts(prods);
    setLoading(false);
    return prods;
  };

  const loadListings = async (productId: string) => {
    const { data } = await supabase.from("listings").select("*").eq("product_id", productId);
    setListings((data as Listing[]) || []);
  };

  // ─── Org handlers ───
  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    let templateUrl: string | null | undefined = undefined;
    if (orgTemplateFile) templateUrl = await uploadImageToStorage(orgTemplateFile);
    let logoUrl: string | null | undefined = undefined;
    if (orgLogoFile) logoUrl = await uploadImageToStorage(orgLogoFile);

    const payload: any = { ...orgForm };
    if (templateUrl !== undefined) payload.template_image_url = templateUrl;
    if (logoUrl !== undefined) payload.logo_url = logoUrl;

    if (editingOrg) {
      const { error } = await supabase.from("organizations").update(payload).eq("id", editingOrg.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Organization updated!");
      setEditingOrg(null);
    } else {
      const { error } = await supabase.from("organizations").insert({ ...payload, user_id: user!.id });
      if (error) { toast.error(error.message); return; }
      toast.success("Organization created!");
    }
    resetOrgForm();
    setView("orgs");
    loadOrgs();
  };

  const resetOrgForm = () => {
    setOrgForm({ ...EMPTY_ORG_FORM });
    setOrgTemplateFile(null);
    setOrgTemplatePreview(null);
    setOrgLogoFile(null);
    setOrgLogoPreview(null);
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
      default_size_pricing: (org.default_size_pricing as Record<string, Record<string, string>>) || {},
    });
    setOrgTemplatePreview(org.template_image_url || null);
    setOrgTemplateFile(null);
    setOrgLogoPreview(org.logo_url || null);
    setOrgLogoFile(null);
    setView("org-form");
    loadPrintifyShops(org.id);
  };

  const handleOrgTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setOrgTemplateFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setOrgTemplatePreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    if (selectedOrg && view !== "org-form") {
      try {
        const filePath = `${user!.id}/templates/${selectedOrg.id}-${Date.now()}.${file.name.split(".").pop()}`;
        const { error: uploadError } = await supabase.storage.from("product-images").upload(filePath, file, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(filePath);
        const templateUrl = urlData.publicUrl;
        const { error: updateError } = await supabase.from("organizations").update({ template_image_url: templateUrl } as any).eq("id", selectedOrg.id);
        if (updateError) throw updateError;
        setSelectedOrg({ ...selectedOrg, template_image_url: templateUrl });
        toast.success("Template image updated");
      } catch (err: any) {
        toast.error(err.message || "Failed to upload template");
      }
    }
  };

  const handleOrgLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setOrgLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setOrgLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const toggleMarketplace = (m: string) => {
    setSelectedMarketplaces((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  };

  const handleSelectOrg = (org: Organization) => {
    setSelectedOrg(org);
    setView("products");
    loadProducts(org.id);
    const mp = org.enabled_marketplaces?.length ? [...org.enabled_marketplaces] : [...ALL_MARKETPLACES] as string[];
    setSelectedMarketplaces(mp);
  };

  const [deleteConfirmOrg, setDeleteConfirmOrg] = useState<Organization | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [archivedOrgs, setArchivedOrgs] = useState<Organization[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  const loadArchivedOrgs = async () => {
    const { data } = await supabase.from("organizations").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
    setArchivedOrgs((data as Organization[]) || []);
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

  // ─── Design processing ───
  const processDesignVariants = async (base64: string) => {
    if (!user) return;
    setIsProcessingDesign(true);
    try {
      setDesignProcessingStep("Removing background…");
      const transparentBase64 = await smartRemoveBackground(base64);
      setDesignProcessingStep("Analyzing design colors…");
      const multiColor = await isMultiColorDesign(transparentBase64);
      let darkBase64: string;
      if (multiColor) {
        darkBase64 = transparentBase64;
      } else {
        setDesignProcessingStep("Creating dark variant…");
        darkBase64 = await recolorOpaquePixels(transparentBase64, { r: 24, g: 24, b: 24 }, { preserveAll: true });
      }
      setDesignProcessingStep("Upscaling to print quality…");
      const [lightUpscaled, darkUpscaled] = await Promise.all([
        upscaleBase64Png(transparentBase64, 4500),
        upscaleBase64Png(darkBase64, 4500),
      ]);
      setDesignProcessingStep("Uploading variants…");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) await supabase.auth.refreshSession();
      const lightPath = `${user.id}/design-variants/${crypto.randomUUID()}-light.png`;
      const darkPath = `${user.id}/design-variants/${crypto.randomUUID()}-dark.png`;
      const lightBlob = await fetch(`data:image/png;base64,${lightUpscaled}`).then(r => r.blob());
      const darkBlob = await fetch(`data:image/png;base64,${darkUpscaled}`).then(r => r.blob());
      const [lightUpload, darkUpload] = await Promise.all([
        supabase.storage.from("product-images").upload(lightPath, lightBlob, { contentType: "image/png", upsert: true }),
        supabase.storage.from("product-images").upload(darkPath, darkBlob, { contentType: "image/png", upsert: true }),
      ]);
      if (lightUpload.error) throw lightUpload.error;
      if (darkUpload.error) throw darkUpload.error;
      const lightUrl = supabase.storage.from("product-images").getPublicUrl(lightPath).data.publicUrl;
      const darkUrl = supabase.storage.from("product-images").getPublicUrl(darkPath).data.publicUrl;
      setPendingLightDesignUrl(lightUrl);
      setPendingDarkDesignUrl(darkUrl);
      toast.success("Light & dark design variants ready!");
    } catch (err: any) {
      console.error("Design processing error:", err);
      toast.error("Design variant processing failed: " + (err.message || "Unknown error"));
    } finally {
      setIsProcessingDesign(false);
      setDesignProcessingStep("");
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setImageFile(file);
    setPendingLightDesignUrl(null);
    setPendingDarkDesignUrl(null);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setImagePreview(base64);
      if (!aiAutoFill) { processDesignVariants(base64); return; }
      setIsAnalyzing(true);
      try {
        if (aiUsage) {
          const allowed = await aiUsage.checkAndLog("analyze-product", user!.id);
          if (!allowed) { setIsAnalyzing(false); return; }
        }
        const { data, error } = await supabase.functions.invoke("analyze-product", { body: { imageBase64: base64 } });
        if (error) throw error;
        if (data.error) throw new Error(data.error);
        setProductForm({
          title: data.title || "", description: data.description || "",
          features: (data.features || []).join("\n"), category: data.category || "",
          keywords: (data.keywords || []).join(", "), price: data.suggestedPrice || "",
        });
        if (aiUsage) await aiUsage.logUsage("analyze-product", user!.id);
        toast.success("Product analyzed!");
      } catch (err: any) {
        toast.error(err.message || "Failed to analyze image");
      } finally {
        setIsAnalyzing(false);
      }
      processDesignVariants(base64);
    };
    reader.readAsDataURL(file);
  };

  const uploadImageToStorage = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user!.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file);
    if (error) { toast.error("Image upload failed: " + error.message); return null; }
    const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
    return urlData.publicUrl;
  };

  // ─── Product handlers ───
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    let imageUrl: string | null = pendingDesignUrl || pendingLightDesignUrl || null;
    if (imageFile && !pendingLightDesignUrl) imageUrl = await uploadImageToStorage(imageFile);
    const { data: product, error } = await supabase.from("products").insert({ ...productForm, organization_id: selectedOrg.id, user_id: user!.id, image_url: imageUrl }).select().single();
    if (error) { toast.error(error.message); return; }

    if (pendingLightDesignUrl || pendingDarkDesignUrl) {
      const variantRows = [];
      if (pendingLightDesignUrl) variantRows.push({ product_id: product.id, user_id: user!.id, image_url: pendingLightDesignUrl, image_type: "design", color_name: "light-on-dark", position: 0 });
      if (pendingDarkDesignUrl) variantRows.push({ product_id: product.id, user_id: user!.id, image_url: pendingDarkDesignUrl, image_type: "design", color_name: "dark-on-light", position: 1 });
      await insertProductImagesDeduped(variantRows);
    }

    toast.success("Product saved! Generating listings…");
    setProductForm({ ...EMPTY_PRODUCT_FORM });
    setImagePreview(null); setImageFile(null); setPendingDesignUrl(null); setPendingLightDesignUrl(null); setPendingDarkDesignUrl(null);
    setSelectedProduct(product as Product);
    setView("product-detail");
    await loadListings(product.id);
    loadProducts(selectedOrg.id);
  };

  const generateListingsForProduct = async (product: Product, marketplaces?: string[]) => {
    if (!selectedOrg) return;
    const targets = marketplaces || selectedMarketplaces;
    if (targets.length === 0) { toast.error("Select at least one marketplace"); return; }
    setGenerating(true);
    try {
      if (aiUsage) {
        const allowed = await aiUsage.checkAndLog("generate-listings", user!.id);
        if (!allowed) { setGenerating(false); return; }
      }
      const { data: result, error } = await supabase.functions.invoke("generate-listings", {
        body: {
          business: { name: selectedOrg.name, niche: selectedOrg.niche, tone: selectedOrg.tone, audience: selectedOrg.audience },
          product: { title: product.title, description: product.description, keywords: product.keywords, category: product.category, price: product.price, features: product.features },
          marketplaces: targets,
        },
      });
      if (error) throw error;
      if (result.error) throw new Error(result.error);
      for (const m of targets) await supabase.from("listings").delete().eq("product_id", product.id).eq("marketplace", m);
      const listingRows = targets.filter((m) => result[m]).map((m) => ({
        product_id: product.id, user_id: user!.id, marketplace: m, title: result[m].title,
        description: result[m].description, bullet_points: result[m].bulletPoints, tags: result[m].tags,
        seo_title: result[m].seoTitle || "", seo_description: result[m].seoDescription || "",
        url_handle: result[m].urlHandle || "", alt_text: result[m].altText || "",
      }));
      const { error: insertError } = await supabase.from("listings").insert(listingRows);
      if (insertError) throw insertError;
      await loadListings(product.id);
      if (aiUsage) await aiUsage.logUsage("generate-listings", user!.id);
      toast.success(`Listings generated for ${targets.join(", ")}!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate listings");
    } finally {
      setGenerating(false);
    }
  };

  const handleViewProduct = async (product: Product) => {
    setSelectedProduct(product);
    setView("product-detail");
    if (selectedMarketplaces.length === 0 && selectedOrg) {
      const mp = selectedOrg.enabled_marketplaces?.length ? [...selectedOrg.enabled_marketplaces] : [...ALL_MARKETPLACES] as string[];
      setSelectedMarketplaces(mp);
    }
    await loadListings(product.id);
  };

  const handleDeleteProduct = async (id: string) => {
    await supabase.from("products").delete().eq("id", id);
    toast.success("Product deleted");
    if (selectedOrg) loadProducts(selectedOrg.id);
  };


  const getFilteredProducts = () =>
    products.filter((p) => {
      const matchesSearch = !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase());
      if (activeFilter === "__not_on_shopify") return matchesSearch && !p.shopify_product_id;
      if (activeFilter?.startsWith("tag:")) return matchesSearch && (p.tags || []).includes(activeFilter.slice(4));
      const matchesFilter = !activeFilter || p.title.toLowerCase().includes(activeFilter.toLowerCase()) || p.category.toLowerCase().includes(activeFilter.toLowerCase());
      return matchesSearch && matchesFilter;
    });

  const allTags = [...new Set(products.flatMap((p) => p.tags || []))].sort();

  const handleAddTag = async (productId: string, tag: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const current = product.tags || [];
    if (current.includes(tag)) return;
    const updated = [...current, tag];
    await supabase.from("products").update({ tags: updated }).eq("id", productId);
    setProducts((prev) => prev.map((p) => p.id === productId ? { ...p, tags: updated } : p));
  };

  const handleRemoveTag = async (productId: string, tag: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const updated = (product.tags || []).filter((t) => t !== tag);
    await supabase.from("products").update({ tags: updated }).eq("id", productId);
    setProducts((prev) => prev.map((p) => p.id === productId ? { ...p, tags: updated } : p));
  };


  // ─── Shopify import ───
  const [importingShopify, setImportingShopify] = useState(false);
  const importAbortRef = useRef<AbortController | null>(null);

  const handleImportFromShopify = async () => {
    if (!selectedOrg) return;
    const { data: shopifyConn } = await supabase.from("shopify_connections").select("id").eq("user_id", user!.id).eq("organization_id", selectedOrg.id).maybeSingle();
    if (!shopifyConn) { toast.error("No Shopify store connected. Go to Settings to connect your store first."); return; }
    const controller = new AbortController();
    importAbortRef.current = controller;
    setImportingShopify(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-shopify-catalog", { body: { organizationId: selectedOrg.id } });
      if (controller.signal.aborted) return;
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const { imported, updated, failed = 0, total } = data;
      toast.success(`Imported ${imported} new, updated ${updated} existing${failed ? `, failed ${failed}` : ""} — ${total} total from Shopify`);
      await loadProducts(selectedOrg.id);
    } catch (err: any) {
      if (controller.signal.aborted) { toast.info("Import cancelled"); return; }
      toast.error(err.message || "Failed to import from Shopify");
    } finally {
      setImportingShopify(false);
      importAbortRef.current = null;
    }
  };

  const handleCancelImport = () => { importAbortRef.current?.abort(); setImportingShopify(false); };

  // ─── Generate/push all ───
  const [generatingAll, setGeneratingAll] = useState(false);
  const [genAllProgress, setGenAllProgress] = useState({ done: 0, total: 0 });
  const cancelGenAllRef = useRef(false);

  const handleGenerateAllListings = async () => {
    if (!selectedOrg || products.length === 0) return;
    cancelGenAllRef.current = false;
    setGeneratingAll(true);
    setGenAllProgress({ done: 0, total: products.length });
    let successCount = 0;
    for (let i = 0; i < products.length; i++) {
      if (cancelGenAllRef.current) { toast.info(`Cancelled after ${successCount} products`); break; }
      const product = products[i];
      setGenAllProgress({ done: i, total: products.length });
      try {
        if (aiUsage) { const allowed = await aiUsage.checkAndLog("generate-listings", user!.id); if (!allowed) { toast.error("AI generation limit reached"); break; } }
        const { data: result, error } = await supabase.functions.invoke("generate-listings", {
          body: { business: { name: selectedOrg.name, niche: selectedOrg.niche, tone: selectedOrg.tone, audience: selectedOrg.audience }, product: { title: product.title, description: product.description, keywords: product.keywords, category: product.category, price: product.price, features: product.features } },
        });
        if (error) throw error;
        if (result?.error) throw new Error(result.error);
        await supabase.from("listings").delete().eq("product_id", product.id);
        const bulkMarketplaces = selectedOrg?.enabled_marketplaces?.length ? selectedOrg.enabled_marketplaces : ["etsy", "ebay", "shopify"];
        const listingRows = bulkMarketplaces.map((m) => ({ product_id: product.id, user_id: user!.id, marketplace: m, title: result[m].title, description: result[m].description, bullet_points: result[m].bulletPoints, tags: result[m].tags, seo_title: result[m].seoTitle || "", seo_description: result[m].seoDescription || "", url_handle: result[m].urlHandle || "", alt_text: result[m].altText || "" }));
        await supabase.from("listings").insert(listingRows);
        if (aiUsage) await aiUsage.logUsage("generate-listings", user!.id);
        successCount++;
      } catch (err: any) { console.error(`Failed to generate listings for ${product.title}:`, err); toast.error(`Failed: ${product.title}`); }
      if (i < products.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }
    setGenAllProgress({ done: products.length, total: products.length });
    setGeneratingAll(false);
    if (!cancelGenAllRef.current) toast.success(`Generated listings for ${successCount}/${products.length} products!`);
  };

  const [pushingAllShopify, setPushingAllShopify] = useState(false);
  const [pushAllProgress, setPushAllProgress] = useState({ done: 0, total: 0 });
  const cancelPushAllRef = useRef(false);

  const handlePushAllToShopify = async () => {
    if (!selectedOrg || products.length === 0) return;
    const { data: shopifyConn } = await supabase.from("shopify_connections").select("id").eq("user_id", user!.id).eq("organization_id", selectedOrg.id).maybeSingle();
    if (!shopifyConn) { toast.error("No Shopify store connected. Go to Settings to connect first."); return; }
    cancelPushAllRef.current = false;
    setPushingAllShopify(true);
    setPushAllProgress({ done: 0, total: products.length });
    let successCount = 0;
    for (let i = 0; i < products.length; i++) {
      if (cancelPushAllRef.current) { toast.info(`Cancelled after ${successCount} products`); break; }
      const product = products[i];
      setPushAllProgress({ done: i, total: products.length });
      try {
        const { data: productListings } = await supabase.from("listings").select("*").eq("product_id", product.id);
        if (!productListings || productListings.length === 0) continue;
        const shopifyListing = productListings.find((l) => l.marketplace === "shopify") || productListings[0];
        const { data, error } = await supabase.functions.invoke("push-to-shopify", {
          body: { organizationId: selectedOrg!.id, userId: user!.id, productId: product.id, listing: { title: shopifyListing.title, description: shopifyListing.description, tags: shopifyListing.tags, seo_title: shopifyListing.seo_title, seo_description: shopifyListing.seo_description, url_handle: shopifyListing.url_handle, alt_text: shopifyListing.alt_text, price: product.price }, images: product.image_url ? [{ image_url: product.image_url }] : [] },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        successCount++;
      } catch (err: any) {
        console.error(`Failed to push ${product.title} to Shopify:`, err);
        if (user && selectedOrg) notifySyncFailure(user.id, selectedOrg.id, "Shopify", `Failed to push "${product.title}": ${err.message || "Unknown error"}`);
      }
      if (i < products.length - 1) await new Promise((r) => setTimeout(r, 1000));
    }
    setPushAllProgress({ done: products.length, total: products.length });
    setPushingAllShopify(false);
    if (!cancelPushAllRef.current) { toast.success(`Pushed ${successCount}/${products.length} products to Shopify!`); if (selectedOrg) loadProducts(selectedOrg.id); }
  };

  // ─── Render ───
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        selectedOrg={selectedOrg}
        aiUsage={aiUsage}
        notifications={notifs}
        theme={theme}
        toggleTheme={toggleTheme}
        isAdmin={isAdmin}
        onSettings={() => setView("settings")}
        onShowTour={() => setShowTour(true)}
        signOut={signOut}
      />

      <main className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-10">
        {/* Organizations List */}
        {view === "orgs" && user && (
          <OrgListView
            userId={user.id}
            orgs={orgs}
            loading={loading}
            archivedOrgs={archivedOrgs}
            showArchived={showArchived}
            onToggleArchived={() => { setShowArchived(!showArchived); if (!showArchived) loadArchivedOrgs(); }}
            onSelectOrg={handleSelectOrg}
            onEditOrg={handleEditOrg}
            onDeleteOrg={handleDeleteOrg}
            onRestoreOrg={handleRestoreOrg}
            setView={setView}
            selectedOrg={selectedOrg}
          />
        )}

        {/* Org Form */}
        {view === "org-form" && (
          <form onSubmit={handleCreateOrg} className="space-y-8">
            <div className="flex items-center gap-3">
              <Button type="button" variant="ghost" size="icon" onClick={() => { setView("orgs"); setEditingOrg(null); resetOrgForm(); }}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h2 className="text-2xl font-bold">{editingOrg ? "Edit Brand" : "New Brand"}</h2>
                <p className="text-sm text-muted-foreground">{editingOrg ? "Update your brand context — this affects how AI writes your content" : "Define your brand voice — AI uses this to tailor all generated content"}</p>
              </div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Brand Name</Label>
                <Input value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} required placeholder="e.g. Wildberry Crafts" />
                <p className="text-xs text-muted-foreground">Your business or brand name</p>
              </div>
              <div className="space-y-2">
                <Label>Niche / Industry</Label>
                <Input value={orgForm.niche} onChange={(e) => setOrgForm({ ...orgForm, niche: e.target.value })} required placeholder="e.g. Custom t-shirts, handmade candles" />
                <p className="text-xs text-muted-foreground">What type of products you sell</p>
              </div>
              <div className="space-y-2">
                <Label>Brand Voice & Tone</Label>
                <Input value={orgForm.tone} onChange={(e) => setOrgForm({ ...orgForm, tone: e.target.value })} required placeholder="e.g. Warm & friendly, Bold & edgy" />
                <p className="text-xs text-muted-foreground">How AI should write — e.g. casual, professional, playful</p>
              </div>
              <div className="space-y-2">
                <Label>Target Audience</Label>
                <Input value={orgForm.audience} onChange={(e) => setOrgForm({ ...orgForm, audience: e.target.value })} required placeholder="e.g. Young professionals, gift shoppers" />
                <p className="text-xs text-muted-foreground">Who your ideal customers are</p>
              </div>
            </div>

            {/* Brand Logo */}
            <div className="space-y-2">
              <Label>Brand Logo (optional)</Label>
              <p className="text-xs text-muted-foreground">Displayed on your brand tile for quick identification</p>
              <input type="file" accept="image/*" onChange={handleOrgLogoUpload} className="hidden" id="org-logo-image" />
              {orgLogoPreview ? (
                <div className="relative overflow-hidden rounded-xl border border-border bg-card">
                  <img src={orgLogoPreview} alt="Logo" className="mx-auto max-h-32 object-contain p-4" />
                  <label htmlFor="org-logo-image" className="mt-2 block cursor-pointer text-center text-xs text-muted-foreground underline hover:text-foreground pb-2">Change logo</label>
                </div>
              ) : (
                <label htmlFor="org-logo-image" className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card/50 py-8 transition-colors hover:border-primary/50">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium">Upload brand logo</p>
                </label>
              )}
            </div>

            {/* Brand Font & Color */}
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Brand Font (optional)</Label>
                <Input value={orgForm.brand_font} onChange={(e) => setOrgForm({ ...orgForm, brand_font: e.target.value })} placeholder="e.g. Poppins, Montserrat" />
                <p className="text-xs text-muted-foreground">Font name used on your designs</p>
              </div>
              <div className="space-y-2">
                <Label>Brand Color (optional)</Label>
                <Input value={orgForm.brand_color} onChange={(e) => setOrgForm({ ...orgForm, brand_color: e.target.value })} placeholder="e.g. #FF5733" />
                <p className="text-xs text-muted-foreground">Primary brand color for designs</p>
              </div>
              <div className="space-y-2">
                <Label>Design Font Size</Label>
                <select value={orgForm.brand_font_size} onChange={(e) => setOrgForm({ ...orgForm, brand_font_size: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large (default)</option><option value="x-large">Extra Large</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Design Style Notes</Label>
                <Input value={orgForm.brand_style_notes} onChange={(e) => setOrgForm({ ...orgForm, brand_style_notes: e.target.value })} placeholder="e.g. Minimalist, bold typography" />
                <p className="text-xs text-muted-foreground">Style hints for AI-generated designs</p>
              </div>
            </div>

            {/* Design Styles */}
            <div className="space-y-3">
              <div><h3 className="text-lg font-semibold">Design Styles</h3><p className="text-xs text-muted-foreground">Select which styles AI should use when generating designs</p></div>
              <div className="flex flex-wrap gap-2">
                {[{ value: "text-only", label: "Text Only" }, { value: "text-with-graphics", label: "Text + Graphics" }, { value: "illustration", label: "Illustration" }, { value: "photo-based", label: "Photo-Based" }].map((style) => {
                  const isEnabled = orgForm.design_styles.includes(style.value);
                  return (
                    <label key={style.value} className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 cursor-pointer transition-colors ${isEnabled ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"}`}>
                      <input type="checkbox" checked={isEnabled} onChange={() => { const newStyles = isEnabled ? orgForm.design_styles.filter((s) => s !== style.value) : [...orgForm.design_styles, style.value]; if (newStyles.length === 0) return; setOrgForm({ ...orgForm, design_styles: newStyles }); }} className="rounded" />
                      <span className="text-sm font-medium">{style.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Printify Shop */}
            <div className="space-y-2">
              <Label>Printify Shop (optional)</Label>
              <p className="text-xs text-muted-foreground">Link to a specific Printify shop for print-on-demand products</p>
              {!loadingPrintifyShops && printifyShops.length === 0 && (
                <Button type="button" variant="outline" size="sm" onClick={() => loadPrintifyShops()} className="gap-2"><RefreshCw className="h-3.5 w-3.5" /> Load Printify Shops</Button>
              )}
              {loadingPrintifyShops && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading shops…</div>}
              {printifyShops.length > 0 && (
                <select value={orgForm.printify_shop_id || ""} onChange={(e) => setOrgForm({ ...orgForm, printify_shop_id: e.target.value ? Number(e.target.value) : null })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  <option value="">Auto (first shop)</option>
                  {printifyShops.map((shop) => <option key={shop.id} value={shop.id}>{shop.title}</option>)}
                </select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Default Mockup Template (optional)</Label>
              <p className="text-xs text-muted-foreground">Fallback image used for AI color variants when a product has no image</p>
              <input type="file" accept="image/*" onChange={handleOrgTemplateUpload} className="hidden" id="org-template-image" />
              {orgTemplatePreview ? (
                <div className="relative overflow-hidden rounded-xl border border-border bg-card">
                  <img src={orgTemplatePreview} alt="Template" className="mx-auto max-h-48 object-contain p-4" />
                  <label htmlFor="org-template-image" className="mt-2 block cursor-pointer text-center text-xs text-muted-foreground underline hover:text-foreground pb-2">Change template</label>
                </div>
              ) : (
                <label htmlFor="org-template-image" className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card/50 py-8 transition-colors hover:border-primary/50">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" /><p className="text-sm font-medium">Upload template image</p><p className="text-xs text-muted-foreground">Used as fallback for products without images</p>
                </label>
              )}
              {editingOrg?.template_image_url && <RegenerateAllMockups organizationId={editingOrg.id} userId={user!.id} templateImageUrl={editingOrg.template_image_url} />}
            </div>

            {/* Enabled Marketplaces */}
            <div className="space-y-3">
              <div><h3 className="text-lg font-semibold">Enabled Marketplaces</h3><p className="text-xs text-muted-foreground">Select which marketplaces this brand sells on</p></div>
              <div className="flex flex-wrap gap-2">
                {[{ value: "shopify", label: "Shopify", icon: "🛍️" }, { value: "printify", label: "Printify", icon: "🖨️" }, { value: "etsy", label: "Etsy", icon: "🧶" }, { value: "ebay", label: "eBay", icon: "🏷️" }].map((mp) => {
                  const isEnabled = orgForm.enabled_marketplaces.includes(mp.value);
                  return (
                    <label key={mp.value} className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 cursor-pointer transition-colors ${isEnabled ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"}`}>
                      <input type="checkbox" checked={isEnabled} onChange={() => { const newMp = isEnabled ? orgForm.enabled_marketplaces.filter((m) => m !== mp.value) : [...orgForm.enabled_marketplaces, mp.value]; setOrgForm({ ...orgForm, enabled_marketplaces: newMp }); }} className="rounded" />
                      <span className="text-base">{mp.icon}</span><span className="text-sm font-medium">{mp.label}</span>
                    </label>
                  );
                })}
              </div>
              {orgForm.enabled_marketplaces.length === 0 && <p className="text-xs text-muted-foreground">None selected — all marketplaces will be shown by default</p>}
            </div>

            {/* Product Types */}
            <div className="space-y-3">
              <div><h3 className="text-lg font-semibold flex items-center gap-2"><Package className="h-5 w-5 text-primary" /> Product Types</h3><p className="text-xs text-muted-foreground">Select which product types this brand offers</p></div>
              <div className="flex flex-wrap gap-2">
                {Object.values(PRODUCT_TYPES).map((pt) => {
                  const isEnabled = orgForm.enabled_product_types.includes(pt.key);
                  return (
                    <label key={pt.key} className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 cursor-pointer transition-colors ${isEnabled ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"}`}>
                      <input type="checkbox" checked={isEnabled} onChange={() => { const newTypes = isEnabled ? orgForm.enabled_product_types.filter((t) => t !== pt.key) : [...orgForm.enabled_product_types, pt.key]; if (newTypes.length === 0) return; setOrgForm({ ...orgForm, enabled_product_types: newTypes }); }} className="rounded" />
                      <span className="text-sm font-medium">{pt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Size Pricing Defaults */}
            {orgForm.enabled_product_types.some((t) => PRODUCT_TYPES[t as ProductTypeKey]?.sizes?.length > 0) && (
              <div className="space-y-4">
                <div><h3 className="text-lg font-semibold flex items-center gap-2"><DollarSign className="h-5 w-5 text-primary" /> Default Size Pricing</h3><p className="text-xs text-muted-foreground">Set default prices per size for each product type</p></div>
                {orgForm.enabled_product_types.filter((t) => PRODUCT_TYPES[t as ProductTypeKey]?.sizes?.length > 0).map((typeKey) => {
                  const pt = PRODUCT_TYPES[typeKey as ProductTypeKey];
                  const currentPricing = orgForm.default_size_pricing[typeKey] || pt.defaultSizePricing;
                  return (
                    <div key={typeKey} className="rounded-lg border border-border p-4 space-y-3">
                      <Label className="font-semibold">{pt.label}</Label>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {pt.sizes.map((size) => (
                          <div key={size} className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{size}</Label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                              <Input value={currentPricing[size] || pt.defaultSizePricing[size] || ""} onChange={(e) => { const newPricing = { ...orgForm.default_size_pricing }; if (!newPricing[typeKey]) newPricing[typeKey] = { ...pt.defaultSizePricing }; newPricing[typeKey][size] = e.target.value; setOrgForm({ ...orgForm, default_size_pricing: newPricing }); }} className="pl-6 h-9 text-sm" placeholder={pt.defaultSizePricing[size]} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end">
              <Button type="submit" className="gap-2">
                {editingOrg ? <><Check className="h-4 w-4" /> Save Changes</> : <><Plus className="h-4 w-4" /> Create</>}
              </Button>
            </div>
          </form>
        )}

        {/* Products List */}
        {view === "products" && selectedOrg && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <Button variant="ghost" size="icon" className="self-start" onClick={() => { setView("orgs"); setSelectedOrg(null); }}><ArrowLeft className="h-4 w-4" /></Button>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold truncate">{selectedOrg.name}</h2>
                <p className="text-sm text-muted-foreground">{products.length} products</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {importingShopify ? (
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" /><span className="text-sm text-muted-foreground">Importing from Shopify…</span>
                    <Button variant="destructive" size="sm" onClick={handleCancelImport} className="gap-2"><X className="h-4 w-4" /> Cancel</Button>
                  </div>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="outline" className="gap-2"><Plus className="h-4 w-4" /> Add Products <ChevronDown className="h-3 w-3 ml-1" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => setView("product-form")} className="gap-2"><Plus className="h-4 w-4" /> Add Manually</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { if (canAccess(effectiveTier, "bulk-upload")) setView("bulk-upload"); else toast.error("Bulk Upload requires Starter plan or above", { action: { label: "Upgrade", onClick: () => setView("settings") } }); }} className="gap-2">
                        <Upload className="h-4 w-4" /> AI from Images / CSV
                        {!canAccess(effectiveTier, "bulk-upload") && <Lock className="h-3 w-3 text-muted-foreground ml-auto" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleImportFromShopify} className="gap-2">
                        <Store className="h-4 w-4" /> Import from Shopify
                        {!canAccess(effectiveTier, "shopify-sync") && <Lock className="h-3 w-3 text-muted-foreground ml-auto" />}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            <Tabs defaultValue="messages" className="w-full" onValueChange={(v) => { if (v === "messages") setMsgRefreshKey(k => k + 1); if (v === "products" && selectedOrg) loadProducts(selectedOrg.id); }}>
              <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden scrollbar-none">
                <TabsTrigger value="messages" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Message</span> Ideas</TabsTrigger>
                <TabsTrigger value="products" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><Package className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Products {products.length > 0 && `(${products.length})`}</TabsTrigger>
                <TabsTrigger value="autopilot" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><Rocket className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Autopilot{!canAccess(effectiveTier, "autopilot") && <Lock className="h-3 w-3 text-muted-foreground" />}</TabsTrigger>
                <TabsTrigger value="social" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><Share2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Social{!canAccess(effectiveTier, "social-posts") && <Lock className="h-3 w-3 text-muted-foreground" />}</TabsTrigger>
                <TabsTrigger value="calendar" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Calendar{!canAccess(effectiveTier, "content-calendar") && <Lock className="h-3 w-3 text-muted-foreground" />}</TabsTrigger>
                <TabsTrigger value="sync" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><GitCompare className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Sync</TabsTrigger>
                <TabsTrigger value="analytics" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Analytics</TabsTrigger>
                <TabsTrigger value="brand-settings" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><Settings className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Settings</TabsTrigger>
              </TabsList>

              <TabsContent value="messages" forceMount className="mt-4 data-[state=inactive]:hidden">
                <div className="rounded-xl border border-border bg-card p-5">
                  <MessageGenerator organization={selectedOrg} userId={user!.id} refreshKey={msgRefreshKey} onProductsCreated={() => { if (selectedOrg) loadProducts(selectedOrg.id); }} aiUsage={aiUsage} />
                </div>
              </TabsContent>

              <TabsContent value="autopilot" forceMount className="mt-4 data-[state=inactive]:hidden">
                {canAccess(effectiveTier, "autopilot") ? (
                  <FullAutopilot organization={selectedOrg} userId={user!.id} onProductsCreated={() => { if (selectedOrg) loadProducts(selectedOrg.id); }} />
                ) : (
                  <div className="rounded-xl border border-border bg-card"><UpgradePrompt feature="autopilot" onUpgrade={() => setView("settings")} /></div>
                )}
              </TabsContent>

              <TabsContent value="social" className="mt-4">
                {canAccess(effectiveTier, "social-posts") ? (
                  <div className="rounded-xl border border-border bg-card p-5"><SocialPostGenerator organization={selectedOrg} products={products} userId={user!.id} aiUsage={aiUsage} /></div>
                ) : (
                  <div className="rounded-xl border border-border bg-card"><UpgradePrompt feature="social-posts" onUpgrade={() => setView("settings")} /></div>
                )}
              </TabsContent>

              <TabsContent value="calendar" className="mt-4">
                {canAccess(effectiveTier, "content-calendar") ? (
                  <div className="rounded-xl border border-border bg-card p-5"><ContentCalendar organizationId={selectedOrg.id} products={products} /></div>
                ) : (
                  <div className="rounded-xl border border-border bg-card"><UpgradePrompt feature="content-calendar" onUpgrade={() => setView("settings")} /></div>
                )}
              </TabsContent>

              <TabsContent value="sync" className="mt-4">
                <div className="rounded-xl border border-border bg-card p-5">
                  <SyncDashboard products={products as any} onSelectProduct={(productId) => { const p = products.find((pr) => pr.id === productId); if (p) { setSelectedProduct(p); setView("product-detail"); } }} />
                </div>
              </TabsContent>

              <TabsContent value="analytics" className="mt-4 space-y-4">
                <div className="rounded-xl border border-border bg-card p-5"><ListingRefreshQueue organizationId={selectedOrg!.id} userId={user!.id} /></div>
                <div className="rounded-xl border border-border bg-card p-5"><ABTestDashboard organizationId={selectedOrg!.id} userId={user!.id} products={products as any} /></div>
                <div className="rounded-xl border border-border bg-card p-5"><AnalyticsDashboard organization={selectedOrg} userId={user!.id} /></div>
              </TabsContent>

              <TabsContent value="brand-settings" className="mt-4 space-y-4">
                <div className="rounded-xl border border-border bg-card p-5"><ShopifySettings userId={user!.id} organizationId={selectedOrg?.id} /></div>
                <div className="rounded-xl border border-border bg-card p-5"><PrintifySettings userId={user!.id} organizationId={selectedOrg?.id} /></div>
                <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2"><ImageIcon className="h-5 w-5 text-primary" /> Default Mockup Template</h3>
                    <p className="text-xs text-muted-foreground mt-1">Fallback image used for AI color variants when a product has no image</p>
                  </div>
                  <input type="file" accept="image/*" onChange={handleOrgTemplateUpload} className="hidden" id="org-template-image-settings" />
                  {(orgTemplatePreview || selectedOrg?.template_image_url) ? (
                    <div className="relative overflow-hidden rounded-xl border border-border bg-background">
                      <img src={orgTemplatePreview || selectedOrg?.template_image_url || ""} alt="Template" className="mx-auto max-h-48 object-contain p-4" />
                      <div className="flex items-center justify-center gap-3 pb-3"><label htmlFor="org-template-image-settings" className="cursor-pointer text-xs text-muted-foreground underline hover:text-foreground">Change template</label></div>
                    </div>
                  ) : (
                    <label htmlFor="org-template-image-settings" className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card/50 py-8 transition-colors hover:border-primary/50">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" /><p className="text-sm font-medium">Upload template image</p><p className="text-xs text-muted-foreground">Used as fallback for products without images</p>
                    </label>
                  )}
                  {selectedOrg?.template_image_url && <RegenerateAllMockups organizationId={selectedOrg.id} userId={user!.id} templateImageUrl={selectedOrg.template_image_url} />}
                </div>
                <div className="rounded-xl border border-border bg-card p-5"><MarketplaceToggleSettings organizationId={selectedOrg!.id} /></div>
                <div className="rounded-xl border border-border bg-card p-5"><SocialPlatformSettings organizationId={selectedOrg!.id} /></div>
                <div className="rounded-xl border border-border bg-card p-5"><ProductTypeSettings organizationId={selectedOrg!.id} /></div>
                <div className="rounded-xl border border-border bg-card p-5"><SizePricingSettings organizationId={selectedOrg!.id} /></div>
                <div className="rounded-xl border border-border bg-card p-5">
                  {canAccess(effectiveTier, "team-collaboration") ? (
                    <CollaborationHub userId={user!.id} organizations={selectedOrg ? [{ id: selectedOrg.id, name: selectedOrg.name }] : []} />
                  ) : (
                    <UpgradePrompt feature="team-collaboration" onUpgrade={() => setView("settings")} />
                  )}
                </div>
              </TabsContent>

              <TabsContent value="products" forceMount className="mt-4 space-y-4 data-[state=inactive]:hidden">
                <ProductGrid
                  products={products}
                  loading={loading}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  activeFilter={activeFilter}
                  onFilterChange={setActiveFilter}
                  allTags={allTags}
                  onViewProduct={handleViewProduct}
                  onDeleteProduct={handleDeleteProduct}
                  onAddTag={handleAddTag}
                  onRemoveTag={handleRemoveTag}
                  onUploadDesign={async (productId, file) => {
                    const url = await uploadImageToStorage(file);
                    if (url) {
                      await supabase.from("products").update({ image_url: url }).eq("id", productId);
                      toast.success("Design uploaded!");
                      if (selectedOrg) loadProducts(selectedOrg.id);
                    }
                  }}
                   onAddProduct={() => setView("product-form")}
                   enabledProductTypes={selectedOrg?.enabled_product_types || []}
                   onCreateProductFromDesign={async (designUrl, typeKey) => {
                     if (!selectedOrg || !user) return;
                     const typeConfig = (await import("@/lib/productTypes")).PRODUCT_TYPES[typeKey];
                     const baseName = products.find(p => p.image_url === designUrl)?.title?.replace(/\s*(T-Shirt|Long Sleeve|Sweatshirt|Hoodie|Mug|Tote|Canvas|Journal|Notebook)\s*/gi, "").trim() || "New Product";
                     const title = `${baseName} ${typeConfig.label}`;
                     const { data: newProduct, error } = await supabase.from("products").insert({
                       title,
                       category: typeConfig.category,
                       price: typeConfig.defaultPrice,
                       organization_id: selectedOrg.id,
                       user_id: user.id,
                       image_url: designUrl,
                     }).select().single();
                     if (error) { toast.error(error.message); return; }
                     toast.success(`Created ${title}`);
                     loadProducts(selectedOrg.id);
                   }}
                   onReassignDesign={async (productId, newDesignUrl) => {
                     const { error } = await supabase.from("products").update({ image_url: newDesignUrl }).eq("id", productId);
                     if (error) { toast.error(error.message); return; }
                     toast.success("Product moved to design group");
                     if (selectedOrg) loadProducts(selectedOrg.id);
                   }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {generatingAll ? (
                      <Button onClick={() => { cancelGenAllRef.current = true; }} size="sm" variant="destructive" className="gap-1.5 text-xs sm:text-sm"><X className="h-3.5 w-3.5" /> Cancel ({genAllProgress.done}/{genAllProgress.total})</Button>
                    ) : (
                      <Button onClick={handleGenerateAllListings} disabled={products.length === 0} size="sm" className="gap-1.5 text-xs sm:text-sm"><Sparkles className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Generate SEO</span><span className="sm:hidden">SEO</span></Button>
                    )}
                    {pushingAllShopify ? (
                      <Button onClick={() => { cancelPushAllRef.current = true; }} size="sm" variant="destructive" className="gap-1.5 text-xs sm:text-sm"><X className="h-3.5 w-3.5" /> Cancel ({pushAllProgress.done}/{pushAllProgress.total})</Button>
                    ) : (
                      <Button onClick={handlePushAllToShopify} disabled={products.length === 0 || generatingAll} size="sm" variant="outline" className="gap-1.5 text-xs sm:text-sm"><Store className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Push All</span><span className="sm:hidden">Push</span></Button>
                    )}
                  </div>
                </ProductGrid>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Product Form */}
        {view === "product-form" && selectedOrg && (
          <form onSubmit={handleCreateProduct} className="space-y-8">
            <div className="flex items-center gap-3">
              <Button type="button" variant="ghost" size="icon" onClick={() => setView("products")}><ArrowLeft className="h-4 w-4" /></Button>
              <div><h2 className="text-2xl font-bold">Add New Product</h2><p className="text-sm text-muted-foreground">Upload a product image for AI analysis, or fill in details manually</p></div>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
              <input type="checkbox" id="ai-auto-fill" checked={aiAutoFill} onChange={(e) => setAiAutoFill(e.target.checked)} className="h-4 w-4 rounded border-border text-primary" />
              <Sparkles className="h-4 w-4 text-primary" />
              <label htmlFor="ai-auto-fill" className="text-sm">AI auto-fill — analyze uploaded image and fill in product details automatically</label>
            </div>

            <div>
              <Label className="mb-2 block">Product Image</Label>
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="product-image" />
              {imagePreview ? (
                <div className="space-y-3">
                  <div className="relative overflow-hidden rounded-xl border border-border bg-card">
                    <img src={imagePreview} alt="Preview" className="mx-auto max-h-64 object-contain p-4" />
                    {isAnalyzing && <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm"><Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" /><p className="text-sm font-medium">Analyzing product…</p></div>}
                    {isProcessingDesign && !isAnalyzing && <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm"><Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" /><p className="text-sm font-medium">{designProcessingStep}</p><p className="text-xs text-muted-foreground">Creating print-ready variants</p></div>}
                    <label htmlFor="product-image" className="mt-2 block cursor-pointer text-center text-xs text-muted-foreground underline hover:text-foreground">Change image</label>
                  </div>
                  {(pendingLightDesignUrl || pendingDarkDesignUrl) && (
                    <div className="rounded-lg border border-border bg-card/50 p-4">
                      <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Design Variants (4500px print-ready)</p>
                      <div className="grid grid-cols-2 gap-3">
                        {pendingLightDesignUrl && <div className="space-y-1"><div className="overflow-hidden rounded-lg border border-border bg-[hsl(var(--foreground))]"><img src={pendingLightDesignUrl} alt="Light variant" className="mx-auto h-32 object-contain p-2" /></div><p className="text-center text-xs text-muted-foreground">Light (for dark garments)</p></div>}
                        {pendingDarkDesignUrl && <div className="space-y-1"><div className="overflow-hidden rounded-lg border border-border bg-background"><img src={pendingDarkDesignUrl} alt="Dark variant" className="mx-auto h-32 object-contain p-2" /></div><p className="text-center text-xs text-muted-foreground">Dark (for light garments)</p></div>}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <label htmlFor="product-image" className="flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-card/50 py-12 transition-colors hover:border-primary/50">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary"><ImageIcon className="h-6 w-6 text-muted-foreground" /></div>
                  <p className="text-sm font-medium">Upload product image</p>
                  <p className="text-xs text-muted-foreground">{aiAutoFill ? "AI will auto-fill all fields + generate light/dark variants" : "Image only — generates light/dark design variants"}</p>
                </label>
              )}
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2"><Label>Product Title</Label><Input value={productForm.title} onChange={(e) => setProductForm({ ...productForm, title: e.target.value })} required disabled={isAnalyzing} placeholder="e.g. Lavender Soy Candle" /></div>
              <div className="space-y-2"><Label>Category</Label><Input value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })} required disabled={isAnalyzing} placeholder="e.g. Home & Garden > Candles" /></div>
              <div className="space-y-2 sm:col-span-2"><Label>Description</Label><Textarea value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} rows={4} required disabled={isAnalyzing} placeholder="Describe your product…" /></div>
              <div className="space-y-2 sm:col-span-2"><Label>Key Features (one per line)</Label><Textarea value={productForm.features} onChange={(e) => setProductForm({ ...productForm, features: e.target.value })} rows={3} disabled={isAnalyzing} placeholder="Hand-poured with 100% soy wax" /></div>
              <div className="space-y-2"><Label>Keywords (comma separated)</Label><Input value={productForm.keywords} onChange={(e) => setProductForm({ ...productForm, keywords: e.target.value })} disabled={isAnalyzing} placeholder="soy candle, lavender" /></div>
              <div className="space-y-2"><Label>Price</Label><Input value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} disabled={isAnalyzing} placeholder="$24.99" /></div>
            </div>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setView("products")} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button type="submit" className="gap-2" disabled={isAnalyzing || isProcessingDesign}><Sparkles className="h-4 w-4" /> Save & Generate Listings</Button>
            </div>
          </form>
        )}

        {/* Product Detail */}
        {view === "product-detail" && selectedProduct && (
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <Button variant="ghost" size="icon" className="mt-1" onClick={() => { setView("products"); setSelectedProduct(null); }}><ArrowLeft className="h-4 w-4" /></Button>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold truncate">{selectedProduct.title}</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">{selectedProduct.category} {selectedProduct.price && `• ${selectedProduct.price}`}</p>
              </div>
            </div>

            {selectedProduct.image_url && (
              <div className="rounded-xl border border-border bg-card p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-lg border border-border overflow-hidden bg-muted flex items-center justify-center shrink-0">
                    <img src={selectedProduct.image_url} alt="Design file" className="h-full w-full object-contain" />
                  </div>
                  <div><p className="text-sm font-medium">Design File</p><p className="text-xs text-muted-foreground">Transparent PNG — print-ready</p></div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => setDesignPreviewOpen(true)}><Eye className="h-4 w-4" /> Preview</Button>
                  <input type="file" accept="image/*" className="hidden" id="replace-design-input" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !file.type.startsWith("image/")) return;
                    const newUrl = await uploadImageToStorage(file);
                    if (!newUrl) return;
                    const { error } = await supabase.from("products").update({ image_url: newUrl }).eq("id", selectedProduct.id);
                    if (error) { toast.error("Failed to update design file"); return; }
                    await supabase.from("product_images").update({ image_url: newUrl }).eq("product_id", selectedProduct.id).eq("image_type", "design").eq("color_name", "light-on-dark");
                    setSelectedProduct({ ...selectedProduct, image_url: newUrl });
                    toast.success("Design file replaced!");
                    e.target.value = "";
                  }} />
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => document.getElementById("replace-design-input")?.click()}><Upload className="h-4 w-4" /> Replace</Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-2"><Download className="h-4 w-4" /> Download</Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={async () => {
                        try { const res = await fetch(selectedProduct.image_url!); const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${selectedProduct.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_light.png`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); } catch { toast.error("Failed to download"); }
                      }}>Light variant</DropdownMenuItem>
                      <DropdownMenuItem onClick={async () => {
                        try { const { data: imgs } = await supabase.from("product_images").select("image_url").eq("product_id", selectedProduct.id).eq("image_type", "design").eq("color_name", "dark-on-light").limit(1); const darkUrl = imgs?.[0]?.image_url; if (!darkUrl) { toast.error("No dark variant found"); return; } const res = await fetch(darkUrl); const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${selectedProduct.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_dark.png`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); } catch { toast.error("Failed to download dark variant"); }
                      }}>Dark variant</DropdownMenuItem>
                      <DropdownMenuItem onClick={async () => {
                        const slug = selectedProduct.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
                        try { const lightRes = await fetch(selectedProduct.image_url!); const lightBlob = await lightRes.blob(); const lightUrl = URL.createObjectURL(lightBlob); const a1 = document.createElement("a"); a1.href = lightUrl; a1.download = `${slug}_light.png`; document.body.appendChild(a1); a1.click(); document.body.removeChild(a1); URL.revokeObjectURL(lightUrl); const { data: imgs } = await supabase.from("product_images").select("image_url").eq("product_id", selectedProduct.id).eq("image_type", "design").eq("color_name", "dark-on-light").limit(1); const darkUrl = imgs?.[0]?.image_url; if (darkUrl) { const darkRes = await fetch(darkUrl); const darkBlob = await darkRes.blob(); const dUrl = URL.createObjectURL(darkBlob); const a2 = document.createElement("a"); a2.href = dUrl; a2.download = `${slug}_dark.png`; document.body.appendChild(a2); setTimeout(() => { a2.click(); document.body.removeChild(a2); URL.revokeObjectURL(dUrl); }, 300); } else { toast("Only light variant available — dark not found"); } toast.success("Downloads started!"); } catch { toast.error("Failed to download"); }
                      }}>Both variants</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )}

            {selectedProduct.image_url && (
              <Dialog open={designPreviewOpen} onOpenChange={setDesignPreviewOpen}>
                <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Design Preview</DialogTitle></DialogHeader>
                  <div className="flex items-center justify-center bg-muted/30 rounded-lg p-4"><img src={selectedProduct.image_url} alt={selectedProduct.title} className="max-h-[70vh] object-contain" /></div>
                </DialogContent>
              </Dialog>
            )}

            <Tabs defaultValue="mockups" className="space-y-4">
              <TabsList className="w-full justify-start gap-1 bg-secondary/50 p-1">
                <TabsTrigger value="mockups" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><ImageIcon className="h-3.5 w-3.5" /> Mockups</TabsTrigger>
                <TabsTrigger value="listings" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Package className="h-3.5 w-3.5" /> Listings{!canAccess(effectiveTier, "ai-listings") && <Lock className="h-3 w-3 text-muted-foreground" />}</TabsTrigger>
                <TabsTrigger value="push" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Store className="h-3.5 w-3.5" /> Push{!canAccess(effectiveTier, "marketplace-push") && <Lock className="h-3 w-3 text-muted-foreground" />}</TabsTrigger>
              </TabsList>

              <TabsContent value="mockups">
                <div className="rounded-xl border border-border bg-card p-5">
                  <ProductMockups productId={selectedProduct.id} userId={user!.id} productTitle={selectedProduct.title} organizationId={selectedOrg?.id} sourceImageUrl={selectedOrg?.template_image_url || selectedProduct.image_url || null} designImageUrl={selectedProduct.image_url || null} brandName={selectedOrg?.name} brandNiche={selectedOrg?.niche} brandAudience={selectedOrg?.audience} brandTone={selectedOrg?.tone} productCategory={selectedProduct.category} aiUsage={aiUsage} />
                </div>
              </TabsContent>

              <div className="rounded-xl border border-border bg-card p-5">
                <SmartPricing
                  product={{ title: selectedProduct.title, description: selectedProduct.description, category: selectedProduct.category, keywords: selectedProduct.keywords, price: selectedProduct.price, features: selectedProduct.features || "" }}
                  business={{ name: selectedOrg?.name || "", niche: selectedOrg?.niche || "", audience: selectedOrg?.audience || "", tone: selectedOrg?.tone || "" }}
                  onApplyPrice={async (price) => {
                    await supabase.from("products").update({ price }).eq("id", selectedProduct.id);
                    setSelectedProduct({ ...selectedProduct, price });
                    if (selectedOrg) loadProducts(selectedOrg.id);
                    if (selectedProduct.shopify_product_id) {
                      try { await supabase.functions.invoke("update-shopify-product", { body: { shopifyProductId: selectedProduct.shopify_product_id, organizationId: selectedOrg?.id, updates: { price, size_pricing: selectedProduct.size_pricing || undefined } } }); toast.success("Price synced to Shopify"); } catch (err) { console.error("Shopify price sync failed:", err); toast.error("Price saved locally but Shopify sync failed"); }
                    }
                    if (selectedProduct.printify_product_id && selectedOrg) {
                      try { await supabase.functions.invoke("printify-create-product", { body: { action: "update-price", printifyProductId: selectedProduct.printify_product_id, organizationId: selectedOrg.id, price, sizePricing: selectedProduct.size_pricing || undefined } }); toast.success("Price synced to Printify"); } catch (err) { console.error("Printify price sync failed:", err); toast.error("Price saved locally but Printify sync failed"); }
                    }
                  }}
                />
              </div>

              <TabsContent value="listings" className="space-y-4">
                {!canAccess(effectiveTier, "ai-listings") ? (
                  <UpgradePrompt feature="ai-listings" onUpgrade={() => setView("settings")} />
                ) : (() => {
                  const orgMarketplaces = (selectedOrg?.enabled_marketplaces?.length ? selectedOrg.enabled_marketplaces : [...ALL_MARKETPLACES]) as string[];
                  return (
                    <>
                      <div className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-center justify-between mb-3">
                          <Label className="text-sm font-medium">Generate listings for:</Label>
                          <div className="flex items-center gap-3">
                            <button type="button" onClick={() => setSelectedMarketplaces(selectedMarketplaces.length === orgMarketplaces.length ? [] : [...orgMarketplaces])} className="text-xs text-primary hover:underline">{selectedMarketplaces.length === orgMarketplaces.length ? "Deselect all" : "Select all"}</button>
                            <Button variant="outline" size="sm" onClick={() => generateListingsForProduct(selectedProduct)} disabled={generating} className="gap-2">{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{listings.length > 0 ? "Regenerate" : "Generate"}</Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {orgMarketplaces.map((m) => <button key={m} type="button" onClick={() => toggleMarketplace(m)} className={`rounded-full px-4 py-1.5 text-xs font-medium capitalize transition-colors ${selectedMarketplaces.includes(m) ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}>{m}</button>)}
                        </div>
                        {orgMarketplaces.length === 0 && <p className="text-xs text-muted-foreground mt-2">No marketplaces enabled. Edit your brand to enable marketplaces.</p>}
                      </div>
                      {generating ? (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-20"><div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /><p className="text-sm text-muted-foreground">AI is crafting your optimized listings…</p></div>
                      ) : listings.length > 0 ? (
                        <Tabs defaultValue={orgMarketplaces[0] || "shopify"}>
                          <TabsList className="w-full justify-start gap-1 bg-secondary/50 p-1">{orgMarketplaces.map((m) => <TabsTrigger key={m} value={m} className="capitalize data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{m}</TabsTrigger>)}</TabsList>
                          {orgMarketplaces.map((m) => { const listing = listings.find((l) => l.marketplace === m); if (!listing) return null; return <TabsContent key={m} value={m}><ListingOutput marketplace={m} listing={{ title: listing.title, description: listing.description, bulletPoints: listing.bullet_points as string[], tags: listing.tags as string[], seoTitle: listing.seo_title, seoDescription: listing.seo_description, urlHandle: listing.url_handle, altText: listing.alt_text }} /></TabsContent>; })}
                        </Tabs>
                      ) : (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20"><p className="text-sm text-muted-foreground">No listings generated yet</p><Button variant="link" onClick={() => generateListingsForProduct(selectedProduct)} className="mt-2">Generate now</Button></div>
                      )}
                    </>
                  );
                })()}
              </TabsContent>

              <TabsContent value="push" className="space-y-3">
                {!canAccess(effectiveTier, "marketplace-push") ? (
                  <UpgradePrompt feature="marketplace-push" onUpgrade={() => setView("settings")} />
                ) : listings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20"><p className="text-sm text-muted-foreground">Generate listings first before pushing to marketplaces</p></div>
                ) : (() => {
                  const channels = selectedOrg?.enabled_marketplaces?.length ? selectedOrg.enabled_marketplaces : [...ALL_PUSH_CHANNELS];
                  const listingsMapped = listings.map((l) => ({ marketplace: l.marketplace, title: l.title, description: l.description, bullet_points: l.bullet_points as string[], tags: l.tags as string[], seo_title: l.seo_title, seo_description: l.seo_description, url_handle: l.url_handle, alt_text: l.alt_text }));
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      {channels.includes("shopify") && <PushToShopify product={selectedProduct} listings={listingsMapped} userId={user!.id} organizationId={selectedOrg?.id} />}
                      {channels.includes("printify") && <PushToPrintify product={selectedProduct} listings={listingsMapped} userId={user!.id} organizationId={selectedOrg?.id} onProductUpdate={(updates) => { setSelectedProduct((prev) => prev ? { ...prev, ...updates } : prev); setProducts((prev) => prev.map((p) => p.id === selectedProduct.id ? { ...p, ...updates } : p)); }} printifyShopId={selectedOrg?.printify_shop_id} />}
                      {(channels.includes("etsy") || channels.includes("ebay")) && <PushToMarketplace product={selectedProduct} listings={listingsMapped} images={selectedProduct.image_url ? [{ id: "main", image_url: selectedProduct.image_url, color_name: "", position: 0 }] : []} userId={user!.id} enabledChannels={channels} />}
                    </div>
                  );
                })()}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Bulk Upload */}
        {view === "bulk-upload" && selectedOrg && <BulkUpload organizationId={selectedOrg.id} userId={user!.id} onComplete={() => { setView("products"); loadProducts(selectedOrg.id); }} onBack={() => setView("products")} aiUsage={aiUsage} />}

        {/* Account Settings */}
        {view === "settings" && user && (
          <SettingsView userId={user.id} userEmail={user.email || ""} selectedOrg={selectedOrg} effectiveTier={effectiveTier} isFf={subscription.isFf} onRefresh={subscription.refresh} setView={setView} />
        )}

        {view === "autopilot" && selectedOrg && <AutopilotPipeline organization={selectedOrg} userId={user!.id} onComplete={() => { setView("products"); loadProducts(selectedOrg.id); }} onBack={() => setView("products")} />}
        {view === "shopify-enrich" && selectedOrg && <ShopifyEnrich organization={selectedOrg} userId={user!.id} onComplete={() => { setView("products"); loadProducts(selectedOrg.id); }} onBack={() => setView("products")} aiUsage={aiUsage} />}
      </main>

      {deleteConfirmOrg && <DeleteOrgDialog org={deleteConfirmOrg} confirmText={deleteConfirmText} onConfirmTextChange={setDeleteConfirmText} onConfirm={confirmDeleteOrg} onCancel={() => setDeleteConfirmOrg(null)} />}
      {showTour && <OnboardingTour onClose={() => setShowTour(false)} />}
    </div>
  );
};

export default Dashboard;
