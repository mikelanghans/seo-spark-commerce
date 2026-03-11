import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListingOutput, ListingData } from "@/components/ListingOutput";
import { BulkUpload } from "@/components/BulkUpload";
import { AutopilotPipeline } from "@/components/AutopilotPipeline";
import { ShopifyEnrich } from "@/components/ShopifyEnrich";
import { ProductMockups } from "@/components/ProductMockups";
import { ShopifySettings } from "@/components/ShopifySettings";
import { MarketplaceSettings } from "@/components/MarketplaceSettings";
import { PushToShopify } from "@/components/PushToShopify";
import { PushToPrintify } from "@/components/PushToPrintify";
import { PushToMarketplace } from "@/components/PushToMarketplace";
import { MessageGenerator } from "@/components/MessageGenerator";
import { TeamManager } from "@/components/TeamManager";
import { SocialPostGenerator } from "@/components/SocialPostGenerator";
import { ContentCalendar } from "@/components/ContentCalendar";
import { SyncDashboard } from "@/components/SyncDashboard";
import { FullAutopilot } from "@/components/FullAutopilot";
import {
  Sparkles, Plus, Building2, Package, ArrowLeft, LogOut, Loader2, Trash2, Eye, ImageIcon, Upload, Search, Edit2, Check, Settings, RefreshCw, Store, Download, X, Users, Share2, CalendarDays, GitCompare, ChevronDown, Zap, Rocket,
} from "lucide-react";
import { toast } from "sonner";

interface Organization {
  id: string;
  name: string;
  niche: string;
  tone: string;
  audience: string;
  template_image_url?: string | null;
  logo_url?: string | null;
  brand_font?: string;
  brand_color?: string;
  brand_font_size?: string;
  brand_style_notes?: string;
  design_styles?: string[];
  printify_shop_id?: number | null;
}

interface Product {
  id: string;
  organization_id: string;
  title: string;
  description: string;
  keywords: string;
  category: string;
  price: string;
  features: string;
  image_url: string | null;
  shopify_product_id: number | null;
}

interface Listing {
  id: string;
  product_id: string;
  marketplace: string;
  title: string;
  description: string;
  bullet_points: string[];
  tags: string[];
  seo_title: string;
  seo_description: string;
  url_handle: string;
  alt_text: string;
}

const MARKETPLACES = ["amazon", "etsy", "ebay", "shopify"] as const;

type View = "orgs" | "org-form" | "products" | "product-form" | "product-detail" | "bulk-upload" | "autopilot" | "shopify-enrich" | "settings";

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [view, _setView] = useState<View>(() => {
    return (sessionStorage.getItem("dash_view") as View) || "orgs";
  });
  const setView = (v: View) => {
    sessionStorage.setItem("dash_view", v);
    _setView(v);
  };
  const [orgs, setOrgs] = useState<Organization[]>([]);
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

  // Form states
  const [orgForm, setOrgForm] = useState({ name: "", niche: "", tone: "", audience: "", brand_font: "", brand_color: "", brand_font_size: "large", brand_style_notes: "", design_styles: ["text-only"] as string[], printify_shop_id: null as number | null });
  const [printifyShops, setPrintifyShops] = useState<{ id: number; title: string }[]>([]);
  const [loadingPrintifyShops, setLoadingPrintifyShops] = useState(false);
  const [orgTemplateFile, setOrgTemplateFile] = useState<File | null>(null);
  const [orgTemplatePreview, setOrgTemplatePreview] = useState<string | null>(null);
  const [orgLogoFile, setOrgLogoFile] = useState<File | null>(null);
  const [orgLogoPreview, setOrgLogoPreview] = useState<string | null>(null);
  const [selectedMarketplaces, setSelectedMarketplaces] = useState<string[]>([]);
  const [productForm, setProductForm] = useState({
    title: "", description: "", keywords: "", category: "", price: "", features: "",
  });
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAutoFill, setAiAutoFill] = useState(true);
  const [msgRefreshKey, setMsgRefreshKey] = useState(0);

  useEffect(() => {
    if (user) {
      loadOrgs();
      
      // Check for Shopify OAuth code in URL params or localStorage
      const params = new URLSearchParams(window.location.search);
      let code = params.get("code");
      
      console.log("[Shopify OAuth] URL search:", window.location.search);
      console.log("[Shopify OAuth] code from URL:", code);
      console.log("[Shopify OAuth] code from localStorage:", localStorage.getItem("shopify_oauth_code"));
      
      if (!code) {
        code = localStorage.getItem("shopify_oauth_code");
        if (code) {
          localStorage.removeItem("shopify_oauth_code");
          localStorage.removeItem("shopify_oauth_shop");
        }
      } else {
        // Clean URL
        window.history.replaceState({}, "", window.location.pathname);
      }
      
      if (code) {
        console.log("[Shopify OAuth] Exchanging code:", code.substring(0, 10) + "...");
        toast.info("Exchanging Shopify authorization code...");
        supabase.functions.invoke("shopify-exchange-token", {
          body: { code },
        }).then(({ data, error }) => {
          console.log("[Shopify OAuth] Exchange result:", { data, error });
          if (error) {
            toast.error("Failed to connect Shopify: " + error.message);
          } else if (data?.error) {
            toast.error(data.error);
          } else {
            toast.success("Shopify connected successfully!");
            setView("settings");
          }
        });
      }
    }
  }, [user]);

  // Persist selected org/product IDs for state restoration
  useEffect(() => {
    if (selectedOrg) sessionStorage.setItem("dash_org_id", selectedOrg.id);
    else sessionStorage.removeItem("dash_org_id");
  }, [selectedOrg]);

  useEffect(() => {
    if (selectedProduct) sessionStorage.setItem("dash_product_id", selectedProduct.id);
    else sessionStorage.removeItem("dash_product_id");
  }, [selectedProduct]);

  // Restore navigation state after orgs load
  useEffect(() => {
    if (_restoredNav || orgs.length === 0) return;
    setRestoredNav(true);
    const savedOrgId = sessionStorage.getItem("dash_org_id");
    const savedProductId = sessionStorage.getItem("dash_product_id");
    if (!savedOrgId) return;
    const org = orgs.find(o => o.id === savedOrgId);
    if (!org) { setView("orgs"); return; }
    setSelectedOrg(org);
    loadProducts(org.id).then((prods) => {
      if (savedProductId && (view === "product-detail")) {
        const prod = (prods || []).find((p: Product) => p.id === savedProductId);
        if (prod) {
          setSelectedProduct(prod);
          loadListings(prod.id);
        } else {
          setView("products");
        }
      }
    });
  }, [orgs]);

  const loadOrgs = async () => {
    setLoading(true);
    const { data } = await supabase.from("organizations").select("*").order("created_at", { ascending: false });
    setOrgs((data as Organization[]) || []);
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

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let templateUrl: string | null | undefined = undefined;
    if (orgTemplateFile) {
      templateUrl = await uploadImageToStorage(orgTemplateFile);
    }
    let logoUrl: string | null | undefined = undefined;
    if (orgLogoFile) {
      logoUrl = await uploadImageToStorage(orgLogoFile);
    }

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
    setOrgForm({ name: "", niche: "", tone: "", audience: "", brand_font: "", brand_color: "", brand_font_size: "large", brand_style_notes: "", design_styles: ["text-only"], printify_shop_id: null });
    setOrgTemplateFile(null);
    setOrgTemplatePreview(null);
    setOrgLogoFile(null);
    setOrgLogoPreview(null);
    setView("orgs");
    loadOrgs();
  };

  const handleEditOrg = (org: Organization) => {
    setEditingOrg(org);
    setOrgForm({ name: org.name, niche: org.niche, tone: org.tone, audience: org.audience, brand_font: org.brand_font || "", brand_color: org.brand_color || "", brand_font_size: org.brand_font_size || "large", brand_style_notes: org.brand_style_notes || "", design_styles: (org.design_styles as string[]) || ["text-only"], printify_shop_id: org.printify_shop_id || null });
    setOrgTemplatePreview(org.template_image_url || null);
    setOrgTemplateFile(null);
    setOrgLogoPreview(org.logo_url || null);
    setOrgLogoFile(null);
    setView("org-form");
  };

  const handleOrgTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setOrgTemplateFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setOrgTemplatePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
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
    setSelectedMarketplaces((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );
  };

  const handleSelectOrg = (org: Organization) => {
    setSelectedOrg(org);
    setView("products");
    loadProducts(org.id);
  };

  const handleDeleteOrg = async (id: string) => {
    await supabase.from("organizations").delete().eq("id", id);
    toast.success("Organization deleted");
    loadOrgs();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setImagePreview(base64);

      if (!aiAutoFill) return;

      setIsAnalyzing(true);
      try {
        const { data, error } = await supabase.functions.invoke("analyze-product", {
          body: { imageBase64: base64 },
        });
        if (error) throw error;
        if (data.error) throw new Error(data.error);
        setProductForm({
          title: data.title || "",
          description: data.description || "",
          features: (data.features || []).join("\n"),
          category: data.category || "",
          keywords: (data.keywords || []).join(", "),
          price: data.suggestedPrice || "",
        });
        toast.success("Product analyzed!");
      } catch (err: any) {
        toast.error(err.message || "Failed to analyze image");
      } finally {
        setIsAnalyzing(false);
      }
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

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;

    let imageUrl: string | null = pendingDesignUrl || null;
    if (imageFile) {
      imageUrl = await uploadImageToStorage(imageFile);
    }

    const { data: product, error } = await supabase
      .from("products")
      .insert({ ...productForm, organization_id: selectedOrg.id, user_id: user!.id, image_url: imageUrl })
      .select()
      .single();

    if (error) { toast.error(error.message); return; }

    toast.success("Product saved! Generating listings…");
    setProductForm({ title: "", description: "", keywords: "", category: "", price: "", features: "" });
    setImagePreview(null);
    setImageFile(null);
    setPendingDesignUrl(null);

    setSelectedProduct(product as Product);
    setView("product-detail");
    await loadListings(product.id);
    loadProducts(selectedOrg.id);
  };

  const generateListingsForProduct = async (product: Product, marketplaces?: string[]) => {
    if (!selectedOrg) return;
    const targets = marketplaces || selectedMarketplaces;
    if (targets.length === 0) {
      toast.error("Select at least one marketplace");
      return;
    }
    setGenerating(true);

    try {
      const { data: result, error } = await supabase.functions.invoke("generate-listings", {
        body: {
          business: { name: selectedOrg.name, niche: selectedOrg.niche, tone: selectedOrg.tone, audience: selectedOrg.audience },
          product: { title: product.title, description: product.description, keywords: product.keywords, category: product.category, price: product.price, features: product.features },
          marketplaces: targets,
        },
      });
      if (error) throw error;
      if (result.error) throw new Error(result.error);

      // Delete old listings for selected marketplaces only
      for (const m of targets) {
        await supabase.from("listings").delete().eq("product_id", product.id).eq("marketplace", m);
      }

      const listingRows = targets.filter((m) => result[m]).map((m) => ({
        product_id: product.id,
        user_id: user!.id,
        marketplace: m,
        title: result[m].title,
        description: result[m].description,
        bullet_points: result[m].bulletPoints,
        tags: result[m].tags,
        seo_title: result[m].seoTitle || "",
        seo_description: result[m].seoDescription || "",
        url_handle: result[m].urlHandle || "",
        alt_text: result[m].altText || "",
      }));

      const { error: insertError } = await supabase.from("listings").insert(listingRows);
      if (insertError) throw insertError;

      await loadListings(product.id);
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
    await loadListings(product.id);
  };

  const handleDeleteProduct = async (id: string) => {
    await supabase.from("products").delete().eq("id", id);
    toast.success("Product deleted");
    if (selectedOrg) loadProducts(selectedOrg.id);
  };

  const [importingShopify, setImportingShopify] = useState(false);
  const importAbortRef = useRef<AbortController | null>(null);

  const handleImportFromShopify = async () => {
    if (!selectedOrg) return;

    // Validate Shopify connection exists
    const { data: shopifyConn } = await supabase
      .from("shopify_connections")
      .select("id")
      .eq("user_id", user!.id)
      .maybeSingle();

    if (!shopifyConn) {
      toast.error("No Shopify store connected. Go to Settings to connect your store first.");
      return;
    }

    const controller = new AbortController();
    importAbortRef.current = controller;
    setImportingShopify(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-shopify-catalog", {
        body: { organizationId: selectedOrg.id },
      });
      if (controller.signal.aborted) return;
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      const { imported, updated, total } = data;
      toast.success(`Imported ${imported} new, updated ${updated} existing — ${total} total from Shopify`);
      await loadProducts(selectedOrg.id);
    } catch (err: any) {
      if (controller.signal.aborted) {
        toast.info("Import cancelled");
        return;
      }
      toast.error(err.message || "Failed to import from Shopify");
    } finally {
      setImportingShopify(false);
      importAbortRef.current = null;
    }
  };

  const handleCancelImport = () => {
    importAbortRef.current?.abort();
    setImportingShopify(false);
  };

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
      if (cancelGenAllRef.current) {
        toast.info(`Cancelled after ${successCount} products`);
        break;
      }
      const product = products[i];
      setGenAllProgress({ done: i, total: products.length });
      try {
        const { data: result, error } = await supabase.functions.invoke("generate-listings", {
          body: {
            business: { name: selectedOrg.name, niche: selectedOrg.niche, tone: selectedOrg.tone, audience: selectedOrg.audience },
            product: { title: product.title, description: product.description, keywords: product.keywords, category: product.category, price: product.price, features: product.features },
          },
        });
        if (error) throw error;
        if (result?.error) throw new Error(result.error);

        await supabase.from("listings").delete().eq("product_id", product.id);

        const listingRows = (["amazon", "etsy", "ebay", "shopify"] as const).map((m) => ({
          product_id: product.id,
          user_id: user!.id,
          marketplace: m,
          title: result[m].title,
          description: result[m].description,
          bullet_points: result[m].bulletPoints,
          tags: result[m].tags,
          seo_title: result[m].seoTitle || "",
          seo_description: result[m].seoDescription || "",
          url_handle: result[m].urlHandle || "",
          alt_text: result[m].altText || "",
        }));

        await supabase.from("listings").insert(listingRows);
        successCount++;
      } catch (err: any) {
        console.error(`Failed to generate listings for ${product.title}:`, err);
        toast.error(`Failed: ${product.title}`);
      }

      if (i < products.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    setGenAllProgress({ done: products.length, total: products.length });
    setGeneratingAll(false);
    if (!cancelGenAllRef.current) {
      toast.success(`Generated listings for ${successCount}/${products.length} products!`);
    }
  };

  const [pushingAllShopify, setPushingAllShopify] = useState(false);
  const [pushAllProgress, setPushAllProgress] = useState({ done: 0, total: 0 });
  const cancelPushAllRef = useRef(false);

  const handlePushAllToShopify = async () => {
    if (!selectedOrg || products.length === 0) return;

    const { data: shopifyConn } = await supabase
      .from("shopify_connections")
      .select("id")
      .eq("user_id", user!.id)
      .maybeSingle();

    if (!shopifyConn) {
      toast.error("No Shopify store connected. Go to Settings to connect first.");
      return;
    }

    cancelPushAllRef.current = false;
    setPushingAllShopify(true);
    setPushAllProgress({ done: 0, total: products.length });

    let successCount = 0;
    for (let i = 0; i < products.length; i++) {
      if (cancelPushAllRef.current) {
        toast.info(`Cancelled after ${successCount} products`);
        break;
      }
      const product = products[i];
      setPushAllProgress({ done: i, total: products.length });

      try {
        const { data: productListings } = await supabase
          .from("listings")
          .select("*")
          .eq("product_id", product.id);

        if (!productListings || productListings.length === 0) continue;

        const shopifyListing = productListings.find((l) => l.marketplace === "shopify") || productListings[0];

        const { data, error } = await supabase.functions.invoke("push-to-shopify", {
          body: {
            userId: user!.id,
            productId: product.id,
            listing: {
              title: shopifyListing.title,
              description: shopifyListing.description,
              tags: shopifyListing.tags,
              seo_title: shopifyListing.seo_title,
              seo_description: shopifyListing.seo_description,
              url_handle: shopifyListing.url_handle,
              alt_text: shopifyListing.alt_text,
              price: product.price,
            },
            images: product.image_url ? [{ image_url: product.image_url }] : [],
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        successCount++;
      } catch (err: any) {
        console.error(`Failed to push ${product.title} to Shopify:`, err);
      }

      if (i < products.length - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    setPushAllProgress({ done: products.length, total: products.length });
    setPushingAllShopify(false);
    if (!cancelPushAllRef.current) {
      toast.success(`Pushed ${successCount}/${products.length} products to Shopify!`);
      if (selectedOrg) loadProducts(selectedOrg.id);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Brand Aura</h1>
              <p className="text-xs text-muted-foreground">AI-powered product listings & SEO</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setView("settings")} title="Shopify & Integrations">
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={signOut} className="gap-2">
              <LogOut className="h-4 w-4" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {/* Organizations List */}
        {view === "orgs" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Your Brands</h2>
                <p className="text-sm text-muted-foreground">Each brand has its own products, tone, and audience context for AI-generated content</p>
              </div>
              <Button onClick={() => setView("org-form")} className="gap-2">
                <Plus className="h-4 w-4" /> New Brand
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : orgs.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
                <Building2 className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No brands yet — create one to get started</p>
                <Button variant="link" onClick={() => setView("org-form")} className="mt-2">
                  Create your first brand
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {orgs.map((org) => (
                  <div
                    key={org.id}
                    className="group relative cursor-pointer rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
                    onClick={() => handleSelectOrg(org)}
                  >
                    <div className="absolute top-3 right-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditOrg(org); }}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteOrg(org.id); }}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex gap-4">
                      {org.logo_url ? (
                        <img src={org.logo_url} alt={org.name} className="h-20 w-20 rounded-xl object-cover border border-border shrink-0" />
                      ) : (
                        <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-2xl shrink-0">
                          {org.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-lg leading-tight">{org.name}</h3>
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{org.niche}</p>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{org.tone}</span>
                          <span>•</span>
                          <span className="truncate">{org.audience}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Org Form */}
        {view === "org-form" && (
          <form onSubmit={handleCreateOrg} className="space-y-8">
            <div className="flex items-center gap-3">
              <Button type="button" variant="ghost" size="icon" onClick={() => { setView("orgs"); setEditingOrg(null); setOrgForm({ name: "", niche: "", tone: "", audience: "", brand_font: "", brand_color: "", brand_font_size: "large", brand_style_notes: "", design_styles: ["text-only"], printify_shop_id: null }); setOrgLogoFile(null); setOrgLogoPreview(null); }}>
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
                <div className="flex items-center gap-4">
                  <img src={orgLogoPreview} alt="Logo" className="h-16 w-16 rounded-lg object-cover border border-border" />
                  <label htmlFor="org-logo-image" className="cursor-pointer text-xs text-muted-foreground underline hover:text-foreground">
                    Change logo
                  </label>
                </div>
              ) : (
                <label
                  htmlFor="org-logo-image"
                  className="flex w-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-card/50 py-4 transition-colors hover:border-primary/50"
                >
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  <p className="text-xs font-medium">Upload logo</p>
                </label>
              )}
            </div>

            {/* Brand Design Styling */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Design Styling</h3>
                <p className="text-xs text-muted-foreground">These settings influence how AI generates your product designs</p>
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Preferred Font Style</Label>
                  <Input value={orgForm.brand_font} onChange={(e) => setOrgForm({ ...orgForm, brand_font: e.target.value })} placeholder="e.g. Bold sans-serif, Handwritten script, Condensed uppercase" />
                  <p className="text-xs text-muted-foreground">The typeface style for your designs</p>
                </div>
                <div className="space-y-2">
                  <Label>Brand Color</Label>
                  <div className="flex gap-2">
                    <Input value={orgForm.brand_color} onChange={(e) => setOrgForm({ ...orgForm, brand_color: e.target.value })} placeholder="e.g. Black, #FF5733, Navy blue" className="flex-1" />
                    {orgForm.brand_color && /^#[0-9A-Fa-f]{6}$/.test(orgForm.brand_color) && (
                      <div className="h-10 w-10 rounded-md border border-border" style={{ backgroundColor: orgForm.brand_color }} />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Primary ink/text color for designs</p>
                </div>
                <div className="space-y-2">
                  <Label>Text Size Preference</Label>
                  <select
                    value={orgForm.brand_font_size}
                    onChange={(e) => setOrgForm({ ...orgForm, brand_font_size: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="small">Small — subtle, understated</option>
                    <option value="medium">Medium — balanced</option>
                    <option value="large">Large — bold, dominant</option>
                    <option value="extra-large">Extra Large — maximum impact</option>
                  </select>
                  <p className="text-xs text-muted-foreground">How large text appears on designs</p>
                </div>
                <div className="space-y-2">
                  <Label>Additional Style Notes</Label>
                  <Input value={orgForm.brand_style_notes} onChange={(e) => setOrgForm({ ...orgForm, brand_style_notes: e.target.value })} placeholder="e.g. Vintage aesthetic, no cursive, distressed texture" />
                  <p className="text-xs text-muted-foreground">Any other design preferences the AI should follow</p>
                </div>
                <div className="space-y-2">
                  <Label>Design Styles</Label>
                  <p className="text-xs text-muted-foreground">Which design styles are available for this brand</p>
                  <div className="flex gap-3">
                    {[
                      { value: "text-only", label: "Text Only", desc: "Pure typography designs" },
                      { value: "minimalist", label: "Minimalist Art", desc: "Illustration + text" },
                    ].map((style) => {
                      const isChecked = orgForm.design_styles.includes(style.value);
                      return (
                        <label
                          key={style.value}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                            isChecked ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const newStyles = isChecked
                                ? orgForm.design_styles.filter((s) => s !== style.value)
                                : [...orgForm.design_styles, style.value];
                              if (newStyles.length === 0) return; // must have at least one
                              setOrgForm({ ...orgForm, design_styles: newStyles });
                            }}
                            className="rounded"
                          />
                          <div>
                            <span className="text-sm font-medium">{style.label}</span>
                            <p className="text-xs text-muted-foreground">{style.desc}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Template Mockup Image */}
            <div className="space-y-2">
              <Label>Default Mockup Template (optional)</Label>
              <p className="text-xs text-muted-foreground">Fallback image used for AI color variants when a product has no image</p>
              <input type="file" accept="image/*" onChange={handleOrgTemplateUpload} className="hidden" id="org-template-image" />
              {orgTemplatePreview ? (
                <div className="relative overflow-hidden rounded-xl border border-border bg-card">
                  <img src={orgTemplatePreview} alt="Template" className="mx-auto max-h-48 object-contain p-4" />
                  <label htmlFor="org-template-image" className="mt-2 block cursor-pointer text-center text-xs text-muted-foreground underline hover:text-foreground pb-2">
                    Change template
                  </label>
                </div>
              ) : (
                <label
                  htmlFor="org-template-image"
                  className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card/50 py-8 transition-colors hover:border-primary/50"
                >
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium">Upload template image</p>
                  <p className="text-xs text-muted-foreground">Used as fallback for products without images</p>
                </label>
              )}
            </div>
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
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => { setView("orgs"); setSelectedOrg(null); }}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1">
                <h2 className="text-2xl font-bold">{selectedOrg.name}</h2>
                <p className="text-sm text-muted-foreground">{products.length} products</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {importingShopify ? (
                  <Button variant="destructive" size="sm" onClick={handleCancelImport} className="gap-2">
                    <X className="h-4 w-4" /> Cancel Import
                  </Button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="gap-2">
                        <Plus className="h-4 w-4" /> Add Products <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => setView("product-form")} className="gap-2">
                        <Plus className="h-4 w-4" /> Add Manually
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setView("bulk-upload")} className="gap-2">
                        <Upload className="h-4 w-4" /> AI from Images / CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleImportFromShopify} className="gap-2">
                        <Store className="h-4 w-4" /> Import from Shopify
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            <Tabs defaultValue="messages" className="w-full" onValueChange={(v) => { if (v === "messages") setMsgRefreshKey(k => k + 1); if (v === "products" && selectedOrg) loadProducts(selectedOrg.id); }}>
              <TabsList className="w-full justify-start">
                <TabsTrigger value="messages" className="gap-2">
                  <Sparkles className="h-4 w-4" /> Message Ideas
                </TabsTrigger>
                <TabsTrigger value="products" className="gap-2">
                  <Package className="h-4 w-4" /> Products {products.length > 0 && `(${products.length})`}
                </TabsTrigger>
                <TabsTrigger value="autopilot" className="gap-2">
                  <Rocket className="h-4 w-4" /> Autopilot
                </TabsTrigger>
                <TabsTrigger value="social" className="gap-2">
                  <Share2 className="h-4 w-4" /> Social Posts
                </TabsTrigger>
                <TabsTrigger value="calendar" className="gap-2">
                  <CalendarDays className="h-4 w-4" /> Calendar
                </TabsTrigger>
                <TabsTrigger value="sync" className="gap-2">
                  <GitCompare className="h-4 w-4" /> Sync
                </TabsTrigger>
                <TabsTrigger value="team" className="gap-2">
                  <Users className="h-4 w-4" /> Team
                </TabsTrigger>
              </TabsList>

              <TabsContent value="messages" forceMount className="mt-4 data-[state=inactive]:hidden">
                <div className="rounded-xl border border-border bg-card p-5">
                  <MessageGenerator
                    organization={selectedOrg}
                    userId={user!.id}
                    refreshKey={msgRefreshKey}
                    onProductsCreated={() => {
                      if (selectedOrg) loadProducts(selectedOrg.id);
                    }}
                  />
                </div>
              </TabsContent>

              <TabsContent value="autopilot" forceMount className="mt-4 data-[state=inactive]:hidden">
                <FullAutopilot
                  organization={selectedOrg}
                  userId={user!.id}
                  onProductsCreated={() => {
                    if (selectedOrg) loadProducts(selectedOrg.id);
                  }}
                />
              </TabsContent>

              <TabsContent value="social" className="mt-4">
                <div className="rounded-xl border border-border bg-card p-5">
                  <SocialPostGenerator
                    organization={selectedOrg}
                    products={products}
                    userId={user!.id}
                  />
                </div>
              </TabsContent>

              <TabsContent value="calendar" className="mt-4">
                <div className="rounded-xl border border-border bg-card p-5">
                  <ContentCalendar
                    organizationId={selectedOrg.id}
                    products={products}
                  />
                </div>
              </TabsContent>

              <TabsContent value="sync" className="mt-4">
                <div className="rounded-xl border border-border bg-card p-5">
                  <SyncDashboard
                    products={products as any}
                    onSelectProduct={(productId) => {
                      const p = products.find((pr) => pr.id === productId);
                      if (p) { setSelectedProduct(p); setView("product-detail"); }
                    }}
                  />
                </div>
              </TabsContent>

              <TabsContent value="products" forceMount className="mt-4 space-y-4 data-[state=inactive]:hidden">
                {products.length > 0 && (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search products…"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                      {generatingAll ? (
                        <Button onClick={() => { cancelGenAllRef.current = true; }} size="sm" variant="destructive" className="gap-2">
                          <X className="h-4 w-4" /> Cancel ({genAllProgress.done}/{genAllProgress.total})
                        </Button>
                      ) : (
                        <Button onClick={handleGenerateAllListings} disabled={products.length === 0} size="sm" className="gap-2">
                          <Sparkles className="h-4 w-4" /> Generate SEO Listings
                        </Button>
                      )}
                      {pushingAllShopify ? (
                        <Button onClick={() => { cancelPushAllRef.current = true; }} size="sm" variant="destructive" className="gap-2">
                          <X className="h-4 w-4" /> Cancel ({pushAllProgress.done}/{pushAllProgress.total})
                        </Button>
                      ) : (
                        <Button onClick={handlePushAllToShopify} disabled={products.length === 0 || generatingAll} size="sm" variant="outline" className="gap-2">
                          <Store className="h-4 w-4" /> Push All to Shopify
                        </Button>
                      )}
                    </div>

                    {/* Category Filters */}
                    <div className="flex flex-wrap gap-1.5">
                      {["T-Shirt", "Long Sleeve", "Sweatshirt", "Mug", "Tote", "Canvas", "Journal", "Notebook"].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setActiveFilter(activeFilter === cat ? null : cat)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            activeFilter === cat
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {loading ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : products.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
                    <Package className="mb-3 h-10 w-10 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No products yet</p>
                    <Button variant="link" onClick={() => setView("product-form")} className="mt-2">
                      Add your first product
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {products
                      .filter((p) => {
                        const matchesSearch = !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase());
                        const matchesFilter = !activeFilter || 
                          p.title.toLowerCase().includes(activeFilter.toLowerCase()) ||
                          p.category.toLowerCase().includes(activeFilter.toLowerCase());
                        return matchesSearch && matchesFilter;
                      })
                      .map((product) => (
                      <div
                        key={product.id}
                        className="group relative cursor-pointer rounded-xl border border-border bg-card overflow-hidden transition-colors hover:border-primary/40"
                        onClick={() => handleViewProduct(product)}
                      >
                        {product.image_url && (
                          <div className="h-48 overflow-hidden bg-secondary">
                            <img src={product.image_url} alt={product.title} className="h-full w-full object-contain p-2" />
                          </div>
                        )}
                        {!product.image_url && (
                          <div className="flex h-48 items-center justify-center bg-secondary">
                            <Package className="h-8 w-8 text-muted-foreground/40" />
                          </div>
                        )}
                        <div className="p-4">
                          <div className="flex items-start justify-between">
                            <h3 className="font-semibold text-sm leading-tight">{product.title}</h3>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteProduct(product.id); }}
                              className="ml-2 shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{product.description}</p>
                          {product.price && <p className="mt-2 text-sm font-semibold text-primary">{product.price}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="team" className="mt-4">
                <div className="rounded-xl border border-border bg-card p-5">
                  <TeamManager
                    organizationId={selectedOrg.id}
                    organizationName={selectedOrg.name}
                    userId={user!.id}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Product Form */}
        {view === "product-form" && selectedOrg && (
          <form onSubmit={handleCreateProduct} className="space-y-8">
            <div className="flex items-center gap-3">
              <Button type="button" variant="ghost" size="icon" onClick={() => setView("products")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h2 className="text-2xl font-bold">Add New Product</h2>
                <p className="text-sm text-muted-foreground">Upload a product image for AI analysis, or fill in details manually</p>
              </div>
            </div>

            {/* AI toggle */}
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
              <input
                type="checkbox"
                id="ai-auto-fill"
                checked={aiAutoFill}
                onChange={(e) => setAiAutoFill(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary"
              />
              <Sparkles className="h-4 w-4 text-primary" />
              <label htmlFor="ai-auto-fill" className="text-sm">
                AI auto-fill — analyze uploaded image and fill in product details automatically
              </label>
            </div>

            {/* Image Upload */}
            <div>
              <Label className="mb-2 block">Product Image</Label>
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="product-image" />
              {imagePreview ? (
                <div className="relative overflow-hidden rounded-xl border border-border bg-card">
                  <img src={imagePreview} alt="Preview" className="mx-auto max-h-64 object-contain p-4" />
                  {isAnalyzing && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                      <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm font-medium">Analyzing product…</p>
                    </div>
                  )}
                  <label htmlFor="product-image" className="mt-2 block cursor-pointer text-center text-xs text-muted-foreground underline hover:text-foreground">
                    Change image
                  </label>
                </div>
              ) : (
                <label
                  htmlFor="product-image"
                  className="flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-card/50 py-12 transition-colors hover:border-primary/50"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">Upload product image</p>
                  <p className="text-xs text-muted-foreground">
                    {aiAutoFill ? "AI will auto-fill all fields" : "Image only — fill in details below"}
                  </p>
                </label>
              )}
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Product Title</Label>
                <Input value={productForm.title} onChange={(e) => setProductForm({ ...productForm, title: e.target.value })} required disabled={isAnalyzing} placeholder="e.g. Lavender Soy Candle" />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })} required disabled={isAnalyzing} placeholder="e.g. Home & Garden > Candles" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Description</Label>
                <Textarea value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} rows={4} required disabled={isAnalyzing} placeholder="Describe your product…" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Key Features (one per line)</Label>
                <Textarea value={productForm.features} onChange={(e) => setProductForm({ ...productForm, features: e.target.value })} rows={3} disabled={isAnalyzing} placeholder="Hand-poured with 100% soy wax" />
              </div>
              <div className="space-y-2">
                <Label>Keywords (comma separated)</Label>
                <Input value={productForm.keywords} onChange={(e) => setProductForm({ ...productForm, keywords: e.target.value })} disabled={isAnalyzing} placeholder="soy candle, lavender" />
              </div>
              <div className="space-y-2">
                <Label>Price</Label>
                <Input value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} disabled={isAnalyzing} placeholder="$24.99" />
              </div>
            </div>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setView("products")} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button type="submit" className="gap-2" disabled={isAnalyzing}>
                <Sparkles className="h-4 w-4" /> Save & Generate Listings
              </Button>
            </div>
          </form>
        )}

        {/* Product Detail with Listings */}
        {view === "product-detail" && selectedProduct && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start gap-3">
              <Button variant="ghost" size="icon" className="mt-1" onClick={() => { setView("products"); setSelectedProduct(null); }}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold truncate">{selectedProduct.title}</h2>
                <p className="text-sm text-muted-foreground">{selectedProduct.category} {selectedProduct.price && `• ${selectedProduct.price}`}</p>
              </div>
            </div>

            {/* Design File Download */}
            {selectedProduct.image_url && (
              <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 rounded-lg border border-border overflow-hidden bg-muted flex items-center justify-center">
                    <img src={selectedProduct.image_url} alt="Design file" className="h-full w-full object-contain" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Design File</p>
                    <p className="text-xs text-muted-foreground">Transparent PNG — print-ready</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={async () => {
                    try {
                      const res = await fetch(selectedProduct.image_url!);
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${selectedProduct.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_design.png`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch {
                      toast.error("Failed to download design");
                    }
                  }}
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </div>
            )}

            {/* Tabbed sections: Mockups | Listings | Push */}
            <Tabs defaultValue="mockups" className="space-y-4">
              <TabsList className="w-full justify-start gap-1 bg-secondary/50 p-1">
                <TabsTrigger value="mockups" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Mockups
                </TabsTrigger>
                <TabsTrigger value="listings" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Package className="h-3.5 w-3.5" />
                  Listings
                </TabsTrigger>
                <TabsTrigger value="push" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Store className="h-3.5 w-3.5" />
                  Push
                </TabsTrigger>
              </TabsList>

              {/* Mockups Tab */}
              <TabsContent value="mockups">
                <div className="rounded-xl border border-border bg-card p-5">
                  <ProductMockups productId={selectedProduct.id} userId={user!.id} productTitle={selectedProduct.title} sourceImageUrl={selectedOrg?.template_image_url || selectedProduct.image_url || null} designImageUrl={selectedProduct.image_url || null} brandName={selectedOrg?.name} brandNiche={selectedOrg?.niche} brandAudience={selectedOrg?.audience} brandTone={selectedOrg?.tone} productCategory={selectedProduct.category} />
                </div>
              </TabsContent>

              {/* Listings Tab */}
              <TabsContent value="listings" className="space-y-4">
                {/* Marketplace Selection */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-medium">Generate listings for:</Label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedMarketplaces(selectedMarketplaces.length === MARKETPLACES.length ? [] : [...MARKETPLACES])}
                        className="text-xs text-primary hover:underline"
                      >
                        {selectedMarketplaces.length === MARKETPLACES.length ? "Deselect all" : "Select all"}
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => generateListingsForProduct(selectedProduct)}
                        disabled={generating}
                        className="gap-2"
                      >
                        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        {listings.length > 0 ? "Regenerate" : "Generate"}
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {MARKETPLACES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleMarketplace(m)}
                        className={`rounded-full px-4 py-1.5 text-xs font-medium capitalize transition-colors ${
                          selectedMarketplaces.includes(m)
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {generating ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-20">
                    <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <p className="text-sm text-muted-foreground">AI is crafting your optimized listings…</p>
                  </div>
                ) : listings.length > 0 ? (
                  <Tabs defaultValue="amazon">
                    <TabsList className="w-full justify-start gap-1 bg-secondary/50 p-1">
                      {MARKETPLACES.map((m) => (
                        <TabsTrigger key={m} value={m} className="capitalize data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                          {m}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {MARKETPLACES.map((m) => {
                      const listing = listings.find((l) => l.marketplace === m);
                      if (!listing) return null;
                      return (
                        <TabsContent key={m} value={m}>
                          <ListingOutput
                            marketplace={m}
                            listing={{
                              title: listing.title,
                              description: listing.description,
                              bulletPoints: listing.bullet_points as string[],
                              tags: listing.tags as string[],
                              seoTitle: listing.seo_title,
                              seoDescription: listing.seo_description,
                              urlHandle: listing.url_handle,
                              altText: listing.alt_text,
                            }}
                          />
                        </TabsContent>
                      );
                    })}
                  </Tabs>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
                    <p className="text-sm text-muted-foreground">No listings generated yet</p>
                    <Button variant="link" onClick={() => generateListingsForProduct(selectedProduct)} className="mt-2">
                      Generate now
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* Push Tab */}
              <TabsContent value="push" className="space-y-3">
                {listings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
                    <p className="text-sm text-muted-foreground">Generate listings first before pushing to marketplaces</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <PushToShopify
                      product={selectedProduct}
                      listings={listings.map((l) => ({
                        marketplace: l.marketplace,
                        title: l.title,
                        description: l.description,
                        bullet_points: l.bullet_points as string[],
                        tags: l.tags as string[],
                        seo_title: l.seo_title,
                        seo_description: l.seo_description,
                        url_handle: l.url_handle,
                        alt_text: l.alt_text,
                      }))}
                      userId={user!.id}
                    />
                    <PushToPrintify
                      product={selectedProduct}
                      listings={listings.map((l) => ({
                        marketplace: l.marketplace,
                        title: l.title,
                        description: l.description,
                        tags: l.tags as string[],
                      }))}
                      userId={user!.id}
                      onProductUpdate={(updates) => {
                        setSelectedProduct((prev) => prev ? { ...prev, ...updates } : prev);
                        setProducts((prev) => prev.map((p) => p.id === selectedProduct.id ? { ...p, ...updates } : p));
                      }}
                    />
                    <PushToMarketplace
                      product={selectedProduct}
                      listings={listings.map((l) => ({
                        marketplace: l.marketplace,
                        title: l.title,
                        description: l.description,
                        tags: l.tags as string[],
                        seo_title: l.seo_title,
                        seo_description: l.seo_description,
                        url_handle: l.url_handle,
                        alt_text: l.alt_text,
                      }))}
                      images={selectedProduct.image_url ? [{ id: "main", image_url: selectedProduct.image_url, color_name: "", position: 0 }] : []}
                      userId={user!.id}
                    />
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
        {/* Bulk Upload */}
        {view === "bulk-upload" && selectedOrg && (
          <BulkUpload
            organizationId={selectedOrg.id}
            userId={user!.id}
            onComplete={() => {
              setView("products");
              loadProducts(selectedOrg.id);
            }}
            onBack={() => setView("products")}
          />
        )}
        {/* Settings */}
        {view === "settings" && user && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setView("orgs")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h2 className="text-2xl font-bold">Settings</h2>
                <p className="text-sm text-muted-foreground">Manage your Shopify connection and integrations</p>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <ShopifySettings userId={user.id} />
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <MarketplaceSettings userId={user.id} />
            </div>
          </div>
        )}
        {view === "autopilot" && selectedOrg && (
          <AutopilotPipeline
            organization={selectedOrg}
            userId={user!.id}
            onComplete={() => {
              setView("products");
              loadProducts(selectedOrg.id);
            }}
            onBack={() => setView("products")}
          />
        )}
        {view === "shopify-enrich" && selectedOrg && (
          <ShopifyEnrich
            organization={selectedOrg}
            userId={user!.id}
            onComplete={() => {
              setView("products");
              loadProducts(selectedOrg.id);
            }}
            onBack={() => setView("products")}
          />
        )}
      </main>
    </div>
  );
};

export default Dashboard;
