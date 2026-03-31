import { useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_TYPES } from "@/lib/productTypes";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BulkUpload } from "@/components/BulkUpload";
import { AutopilotPipeline } from "@/components/AutopilotPipeline";
import { ShopifyEnrich } from "@/components/ShopifyEnrich";
import { ShopifySettings } from "@/components/ShopifySettings";
import { PrintifySettings } from "@/components/PrintifySettings";
import { MarketplaceToggleSettings } from "@/components/MarketplaceToggleSettings";
import { SocialPlatformSettings } from "@/components/SocialPlatformSettings";
import { ProductTypeSettings } from "@/components/ProductTypeSettings";
import { SizePricingSettings } from "@/components/SizePricingSettings";
import { MessageGenerator } from "@/components/MessageGenerator";
import { CollaborationHub } from "@/components/CollaborationHub";
import { SocialPostGenerator } from "@/components/SocialPostGenerator";
import { ContentCalendar } from "@/components/ContentCalendar";
import { SyncDashboard } from "@/components/SyncDashboard";
import { FullAutopilot } from "@/components/FullAutopilot";
import { ProductGrid } from "@/components/ProductGrid";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { RegenerateAllMockups } from "@/components/RegenerateAllMockups";
import { canAccess } from "@/lib/featureGates";
import {
  Sparkles, Plus, Package, ArrowLeft, Loader2, Upload, X, Store, Share2, CalendarDays, GitCompare, ChevronDown, Rocket, Lock, BarChart3, Settings, ImageIcon, FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import { useAiUsage } from "@/hooks/useAiUsage";
import { AiUsageMeter } from "@/components/AiUsageMeter";
import { useNotifications } from "@/hooks/useNotifications";
import { notifyLowCredits } from "@/lib/notificationHelpers";
import { useSubscription } from "@/hooks/useSubscription";
import { OnboardingTour } from "@/components/OnboardingTour";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { ListingRefreshQueue } from "@/components/ListingRefreshQueue";
import { ABTestDashboard } from "@/components/ABTestDashboard";
import { ShopifyCollections } from "@/components/ShopifyCollections";
import { useCollectionMemberships } from "@/hooks/useCollectionMemberships";

// Extracted components & hooks
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { SettingsView } from "@/components/dashboard/SettingsView";
import { DeleteOrgDialog } from "@/components/dashboard/DeleteOrgDialog";
import { OrgListView } from "@/components/dashboard/OrgListView";
import { OrgFormView } from "@/components/dashboard/OrgFormView";
import { ProductFormView } from "@/components/dashboard/ProductFormView";
import { ProductDetailView } from "@/components/dashboard/ProductDetailView";
import { useOrgHandlers } from "@/hooks/useOrgHandlers";
import { useProductHandlers } from "@/hooks/useProductHandlers";
import { useDesignProcessing } from "@/hooks/useDesignProcessing";

import type { Product, View } from "@/types/dashboard";
import { ALL_MARKETPLACES } from "@/types/dashboard";

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

  const [_restoredNav, setRestoredNav] = useState(false);
  const [msgRefreshKey, setMsgRefreshKey] = useState(0);
  const [productsTab, setProductsTab] = useState("messages");
  const [isAdmin, setIsAdmin] = useState(false);
  const [lowCreditNotified, setLowCreditNotified] = useState(false);
  const [showTour, setShowTour] = useState(() => !localStorage.getItem("brand_aura_tour_seen"));

  const subscription = useSubscription(user?.id ?? null);
  const effectiveTier = subscription.loading ? "pro" as const : subscription.tier;
  const notifs = useNotifications(user?.id ?? null);

  // Extracted hooks
  const orgHandlers = useOrgHandlers(user?.id, setView);
  const {
    orgs, orgsLoaded, selectedOrg, setSelectedOrg, loading: orgLoading,
    editingOrg, setEditingOrg, orgForm, setOrgForm,
    orgTemplatePreview, orgLogoPreview,
    printifyShops, loadingPrintifyShops,
    deleteConfirmOrg, setDeleteConfirmOrg, deleteConfirmText, setDeleteConfirmText,
    archivedOrgs, showArchived, setShowArchived,
    loadOrgs, loadArchivedOrgs, resetOrgForm,
    handleCreateOrg, handleEditOrg, handleDeleteOrg, confirmDeleteOrg, handleRestoreOrg,
    loadPrintifyShops, handleOrgTemplateUpload, handleOrgLogoUpload,
    uploadImageToStorage,
  } = orgHandlers;

  const aiUsage = useAiUsage(user?.id ?? null, selectedOrg?.id ?? null, subscription.creditsLimit);
  const collectionMemberships = useCollectionMemberships(selectedOrg?.id);

  const productHandlers = useProductHandlers(user?.id, selectedOrg, aiUsage);
  const {
    products, setProducts, selectedProduct, setSelectedProduct,
    listings, loading: productLoading,
    generating, searchQuery, setSearchQuery, activeFilter, setActiveFilter,
    selectedMarketplaces, setSelectedMarketplaces,
    importingShopify, generatingAll, genAllProgress, cancelGenAllRef,
    pushingAllShopify, pushAllProgress, cancelPushAllRef,
    loadProducts, loadListings,
    generateListingsForProduct, handleViewProduct, handleDeleteProduct,
    allTags, handleAddTag, handleRemoveTag,
    toggleMarketplace,
    handleImportFromShopify, handleCancelImport,
    handleGenerateAllListings, handlePushAllToShopify,
  } = productHandlers;

  const designProcessing = useDesignProcessing(user?.id);

  const loading = orgLoading || productLoading;

  // ─── Effects ───
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
            setTimeout(() => { aiUsage.refetch(); if (attempts < 5) pollCredits(attempts + 1); }, 2000);
          };
          pollCredits();
        }
      }

      let code = params.get("code");
      if (!code) {
        code = localStorage.getItem("shopify_oauth_code");
        if (code) { localStorage.removeItem("shopify_oauth_code"); localStorage.removeItem("shopify_oauth_shop"); }
      } else {
        window.history.replaceState({}, "", window.location.pathname);
      }

      if (code) {
        toast.info("Exchanging Shopify authorization code...");
        const orgId = selectedOrg?.id || sessionStorage.getItem("dash_org_id") || undefined;
        supabase.functions.invoke("shopify-exchange-token", { body: { code, organizationId: orgId } }).then(({ data, error }) => {
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

  const handleSelectOrg = (org: typeof selectedOrg & {}) => {
    setSelectedOrg(org);
    setView("products");
    loadProducts(org!.id);
    const mp = org!.enabled_marketplaces?.length ? [...org!.enabled_marketplaces] : [...ALL_MARKETPLACES] as string[];
    setSelectedMarketplaces(mp);
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
          <OrgFormView
            editingOrg={editingOrg}
            orgForm={orgForm}
            setOrgForm={setOrgForm}
            orgTemplatePreview={orgTemplatePreview}
            orgLogoPreview={orgLogoPreview}
            printifyShops={printifyShops}
            loadingPrintifyShops={loadingPrintifyShops}
            userId={user!.id}
            onSubmit={handleCreateOrg}
            onBack={() => { setView("orgs"); setEditingOrg(null); resetOrgForm(); }}
            onLoadPrintifyShops={() => loadPrintifyShops()}
            onTemplateUpload={(e) => handleOrgTemplateUpload(e, view)}
            onLogoUpload={handleOrgLogoUpload}
          />
        )}

        {/* Products View with Tabs */}
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

            <Tabs value={productsTab} onValueChange={(v) => { setProductsTab(v); if (v === "messages") setMsgRefreshKey(k => k + 1); if (v === "products" && selectedOrg) loadProducts(selectedOrg.id); }} className="w-full">
              <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden scrollbar-none">
                <TabsTrigger value="messages" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Message</span> Ideas</TabsTrigger>
                <TabsTrigger value="products" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><Package className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Products {products.length > 0 && `(${products.length})`}</TabsTrigger>
                <TabsTrigger value="autopilot" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><Rocket className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Autopilot{!canAccess(effectiveTier, "autopilot") && <Lock className="h-3 w-3 text-muted-foreground" />}</TabsTrigger>
                <TabsTrigger value="social" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><Share2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Social{!canAccess(effectiveTier, "social-posts") && <Lock className="h-3 w-3 text-muted-foreground" />}</TabsTrigger>
                <TabsTrigger value="calendar" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Calendar{!canAccess(effectiveTier, "content-calendar") && <Lock className="h-3 w-3 text-muted-foreground" />}</TabsTrigger>
                <TabsTrigger value="sync" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><GitCompare className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Sync</TabsTrigger>
                <TabsTrigger value="collections" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><FolderOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Collections</TabsTrigger>
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

              <TabsContent value="collections" className="mt-4">
                <div className="rounded-xl border border-border bg-card p-5">
                  <ShopifyCollections organization={selectedOrg!} products={products} />
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
                  <input type="file" accept="image/*" onChange={(e) => handleOrgTemplateUpload(e, view)} className="hidden" id="org-template-image-settings" />
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
                  onViewProduct={(p) => { handleViewProduct(p); setView("product-detail"); }}
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
                  collectionData={collectionMemberships.data}
                  collectionLoading={collectionMemberships.loading}
                  onRefreshCollections={collectionMemberships.refresh}
                  collectionLastFetched={collectionMemberships.lastFetched}
                  onCreateProductFromDesign={async (designUrl, typeKey) => {
                    if (!selectedOrg || !user) return;
                    const typeConfig = (await import("@/lib/productTypes")).PRODUCT_TYPES[typeKey];
                    const baseName = products.find(p => p.image_url === designUrl)?.title?.replace(/\s*(T-Shirt|Long Sleeve|Sweatshirt|Hoodie|Mug|Tote|Canvas|Journal|Notebook)\s*/gi, "").trim() || "New Product";
                    const title = `${baseName} ${typeConfig.label}`;
                    const { data: newProduct, error } = await supabase.from("products").insert({
                      title, category: typeConfig.category, price: typeConfig.defaultPrice,
                      organization_id: selectedOrg.id, user_id: user.id, image_url: designUrl,
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
                  onArchiveDesign={async (designUrl, archive) => {
                    const ids = products.filter((p) => p.image_url === designUrl).map((p) => p.id);
                    if (ids.length === 0) return;
                    const { error } = await supabase.from("products").update({ archived_at: archive ? new Date().toISOString() : null }).in("id", ids);
                    if (error) { toast.error(error.message); return; }
                    toast.success(archive ? `Archived ${ids.length} product${ids.length > 1 ? "s" : ""}` : `Restored ${ids.length} product${ids.length > 1 ? "s" : ""}`);
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
          <ProductFormView
            organization={selectedOrg}
            userId={user!.id}
            aiUsage={aiUsage}
            pendingLightDesignUrl={designProcessing.pendingLightDesignUrl}
            pendingDarkDesignUrl={designProcessing.pendingDarkDesignUrl}
            isProcessingDesign={designProcessing.isProcessingDesign}
            designProcessingStep={designProcessing.designProcessingStep}
            onDesignReset={designProcessing.reset}
            processDesignVariants={designProcessing.processDesignVariants}
            uploadImageToStorage={uploadImageToStorage}
            onProductCreated={async (product) => {
              setSelectedProduct(product);
              setView("product-detail");
              await loadListings(product.id);
              loadProducts(selectedOrg.id);
            }}
            onBack={() => setView("products")}
          />
        )}

        {/* Product Detail */}
        {view === "product-detail" && selectedProduct && (
          <ProductDetailView
            product={selectedProduct}
            products={products}
            listings={listings}
            organization={selectedOrg}
            userId={user!.id}
            effectiveTier={effectiveTier}
            aiUsage={aiUsage}
            selectedMarketplaces={selectedMarketplaces}
            setSelectedMarketplaces={setSelectedMarketplaces}
            toggleMarketplace={toggleMarketplace}
            generating={generating}
            onGenerateListings={generateListingsForProduct}
            onBack={() => { setProductsTab("products"); setView("products"); setSelectedProduct(null); }}
            setView={setView}
            setSelectedProduct={setSelectedProduct}
            loadListings={loadListings}
            loadProducts={(orgId) => loadProducts(orgId)}
            uploadImageToStorage={uploadImageToStorage}
          />
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
