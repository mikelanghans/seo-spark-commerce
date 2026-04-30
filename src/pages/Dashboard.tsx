import { useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_TYPES } from "@/lib/productTypes";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BulkUpload } from "@/components/BulkUpload";
import { AutopilotPipeline } from "@/components/AutopilotPipeline";
import { ShopifyEnrich } from "@/components/ShopifyEnrich";
import { ShopifySettings } from "@/components/ShopifySettings";
import { PrintifySettings } from "@/components/PrintifySettings";
import { MarketplaceSetupGuide } from "@/components/MarketplaceSetupGuide";
import { MarketplaceSettings } from "@/components/MarketplaceSettings";

import { MessageGenerator } from "@/components/MessageGenerator";
import { CollaborationHub } from "@/components/CollaborationHub";
import { SocialPostGenerator } from "@/components/SocialPostGenerator";
import { ContentCalendar } from "@/components/ContentCalendar";
import { SyncDashboard } from "@/components/SyncDashboard";
import { FullAutopilot } from "@/components/FullAutopilot";
import { ProductGrid } from "@/components/ProductGrid";
import { UpgradePrompt } from "@/components/UpgradePrompt";

import { canAccess } from "@/lib/featureGates";
import {
  Sparkles, Plus, Package, ArrowLeft, Loader2, Upload, X, Store, Share2, CalendarDays, GitCompare, ChevronDown, Rocket, Lock, BarChart3, Settings, ImageIcon, FolderOpen, Link2, Tag,
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
import { PrintifyMatchDialog } from "@/components/PrintifyMatchDialog";

import type { Product, View } from "@/types/dashboard";
import { ALL_MARKETPLACES } from "@/types/dashboard";

const LOW_CREDIT_NOTIFICATION_MILESTONES = [10, 5, 3, 1] as const;

const Dashboard = () => {
  const { user, loading: authLoading, signOut } = useAuth();
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
  const [showTour, setShowTour] = useState(() => !localStorage.getItem("brand_aura_tour_seen"));
  const [showImportWarning, setShowImportWarning] = useState(false);

  const subscription = useSubscription(user?.id ?? null);
  const effectiveTier = subscription.loading ? "pro" as const : subscription.tier;
  const notifs = useNotifications(user?.id ?? null);

  // Extracted hooks
  const orgHandlers = useOrgHandlers(user?.id, setView);
  const {
    orgs, orgsLoaded, selectedOrg, setSelectedOrg, loading: orgLoading,
    editingOrg, setEditingOrg, orgForm, setOrgForm,
    orgLogoPreview,
    printifyShops, loadingPrintifyShops,
    deleteConfirmOrg, setDeleteConfirmOrg, deleteConfirmText, setDeleteConfirmText,
    archivedOrgs, showArchived, setShowArchived,
    loadOrgs, loadArchivedOrgs, resetOrgForm,
    handleCreateOrg, handleEditOrg, handleDeleteOrg, confirmDeleteOrg, handleRestoreOrg,
    loadPrintifyShops, handleOrgLogoUpload,
    uploadImageToStorage,
  } = orgHandlers;

  const aiUsage = useAiUsage(user?.id ?? null, selectedOrg?.id ?? null, subscription.creditsLimit);
  const collectionMemberships = useCollectionMemberships(selectedOrg?.id);

  const productHandlers = useProductHandlers(
    user?.id,
    selectedOrg,
    aiUsage,
    async (orgId: string) => {
      const { data } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", orgId)
        .single();

      if (data) {
        setSelectedOrg(data as typeof selectedOrg);
      }

      await loadOrgs();
    },
  );
  const {
    products, setProducts, selectedProduct, setSelectedProduct,
    listings, loading: productLoading,
    generating, searchQuery, setSearchQuery, activeFilter, setActiveFilter,
    selectedMarketplaces, setSelectedMarketplaces,
    importingShopify, generatingAll, genAllProgress, cancelGenAllRef,
    pushingAllShopify, pushAllProgress, cancelPushAllRef,
    pushingAllEbay, pushAllEbayProgress, cancelPushAllEbayRef,
    showPrintifyMatch, setShowPrintifyMatch,
    loadProducts, loadListings,
    generateListingsForProduct, handleViewProduct, handleDeleteProduct,
    allTags, handleAddTag, handleRemoveTag,
    toggleMarketplace,
    handleImportFromShopify, handleCancelImport,
    handleGenerateAllListings, handlePushAllToShopify, handlePushAllToEbay,
  } = productHandlers;

  const designProcessing = useDesignProcessing(user?.id);

  // Product selection state
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const toggleProductSelect = (id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllProducts = () => {
    const activeIds = products.filter((p) => !p.archived_at).map((p) => p.id);
    setSelectedProductIds(new Set(activeIds));
  };
  const deselectAllProducts = () => setSelectedProductIds(new Set());

  // eBay bulk push confirmation
  const [ebayConfirm, setEbayConfirm] = useState<{ open: boolean; products: Product[]; eligible: Product[]; skipped: number }>({ open: false, products: [], eligible: [], skipped: 0 });
  const openEbayConfirm = () => {
    const subset = getSelectedProducts();
    const eligible = subset.filter((p) => !p.ebay_listing_id);
    setEbayConfirm({ open: true, products: subset, eligible, skipped: subset.length - eligible.length });
  };

  const getSelectedProducts = (): Product[] => {
    if (selectedProductIds.size === 0) return products.filter((p) => !p.archived_at);
    return products.filter((p) => selectedProductIds.has(p.id));
  };

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
    if (!user || aiUsage.loading || subscription.loading) return;
    const remaining = aiUsage.limit - aiUsage.usedCount;
    if (LOW_CREDIT_NOTIFICATION_MILESTONES.includes(remaining as typeof LOW_CREDIT_NOTIFICATION_MILESTONES[number])) {
      notifyLowCredits(user.id, remaining);
    }
  }, [user, aiUsage.loading, aiUsage.usedCount, aiUsage.limit, subscription.loading]);

  useEffect(() => {
    if (authLoading) return;
    if (selectedOrg) {
      sessionStorage.setItem("dash_org_id", selectedOrg.id);
    }
  }, [selectedOrg, authLoading]);

  useEffect(() => {
    if (authLoading) return;
    if (selectedProduct) {
      sessionStorage.setItem("dash_product_id", selectedProduct.id);
    }
  }, [selectedProduct, authLoading]);

  useEffect(() => {
    if (!authLoading && !user) {
      sessionStorage.removeItem("dash_org_id");
      sessionStorage.removeItem("dash_product_id");
      sessionStorage.removeItem("dash_view");
    }
  }, [user, authLoading]);

  useEffect(() => {
    const clearStuckPointerEvents = () => {
      if (document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = "";
      }

      if (document.documentElement.style.pointerEvents === "none") {
        document.documentElement.style.pointerEvents = "";
      }
    };

    clearStuckPointerEvents();

    const observer = new MutationObserver(() => {
      clearStuckPointerEvents();
    });

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "data-state", "aria-hidden"],
    });

    const intervalId = window.setInterval(clearStuckPointerEvents, 250);
    window.addEventListener("focus", clearStuckPointerEvents, true);
    document.addEventListener("pointerdown", clearStuckPointerEvents, true);
    document.addEventListener("keydown", clearStuckPointerEvents, true);

    return () => {
      observer.disconnect();
      window.clearInterval(intervalId);
      window.removeEventListener("focus", clearStuckPointerEvents, true);
      document.removeEventListener("pointerdown", clearStuckPointerEvents, true);
      document.removeEventListener("keydown", clearStuckPointerEvents, true);
      if (document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = "";
      }
      if (document.documentElement.style.pointerEvents === "none") {
        document.documentElement.style.pointerEvents = "";
      }
    };
  }, [view]);

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
  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;

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
            orgLogoPreview={orgLogoPreview}
            userId={user!.id}
            onSubmit={handleCreateOrg}
            onBack={() => { setView("orgs"); setEditingOrg(null); resetOrgForm(); }}
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
                    <DropdownMenuContent align="end" className="w-56" sideOffset={4} collisionPadding={8}>
                      <DropdownMenuItem onClick={() => setView("product-form")} className="gap-2"><Plus className="h-4 w-4" /> Add Manually</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { if (canAccess(effectiveTier, "bulk-upload")) setView("bulk-upload"); else toast.error("Bulk Upload requires Starter plan or above", { action: { label: "Upgrade", onClick: () => setView("settings") } }); }} className="gap-2">
                        <Upload className="h-4 w-4" /> AI from Images / CSV
                        {!canAccess(effectiveTier, "bulk-upload") && <Lock className="h-3 w-3 text-muted-foreground ml-auto" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowImportWarning(true)} className="gap-2">
                        <Store className="h-4 w-4" /> Import from Shopify
                        {!canAccess(effectiveTier, "shopify-sync") && <Lock className="h-3 w-3 text-muted-foreground ml-auto" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowPrintifyMatch(true)} className="gap-2">
                        <Link2 className="h-4 w-4" /> Link Printify Products
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Shopify import warning dialog */}
            <AlertDialog open={showImportWarning} onOpenChange={setShowImportWarning}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Import from Shopify</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>This will sync your Shopify catalog. Products that already exist locally (matched by Shopify ID) will have their <strong>title, description, price, tags, and category overwritten</strong> with the latest Shopify data.</p>
                    <p>Mockups and locally-generated images will be preserved.</p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => { setShowImportWarning(false); handleImportFromShopify(); }}>
                    Continue Import
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Tabs value={productsTab} onValueChange={(v) => { setProductsTab(v); if (v === "messages") setMsgRefreshKey(k => k + 1); if (v === "products" && selectedOrg) loadProducts(selectedOrg.id); }} className="w-full">
              <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden scrollbar-none">
                <TabsTrigger value="messages" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Message</span> Ideas</TabsTrigger>
                <TabsTrigger value="products" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><Package className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Products {products.length > 0 && `(${products.length})`}</TabsTrigger>
                <TabsTrigger value="autopilot" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><Rocket className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Autopilot{!canAccess(effectiveTier, "autopilot") && <Lock className="h-3 w-3 text-muted-foreground" />}</TabsTrigger>
                <TabsTrigger value="social" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><Share2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Social{!canAccess(effectiveTier, "social-posts") && <Lock className="h-3 w-3 text-muted-foreground" />}</TabsTrigger>
                <TabsTrigger value="calendar" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Calendar{!canAccess(effectiveTier, "content-calendar") && <Lock className="h-3 w-3 text-muted-foreground" />}</TabsTrigger>
                <TabsTrigger value="sync" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><GitCompare className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Sync</TabsTrigger>
                
                <TabsTrigger value="analytics" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Analytics</TabsTrigger>
                <TabsTrigger value="brand-settings" className="gap-1.5 text-xs sm:text-sm sm:gap-2"><Settings className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Configuration</TabsTrigger>
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
                <div className="rounded-xl border border-border bg-card p-5"><MarketplaceSettings userId={user!.id} organizationId={selectedOrg?.id} /></div>
                
                <div className="rounded-xl border border-border bg-card p-5"><MarketplaceSetupGuide /></div>
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
                  onArchiveProduct={async (productId, archive) => {
                    const { error } = await supabase.from("products").update({ archived_at: archive ? new Date().toISOString() : null }).eq("id", productId);
                    if (error) { toast.error(error.message); return; }
                    toast.success(archive ? "Product archived" : "Product restored");
                    if (selectedOrg) loadProducts(selectedOrg.id);
                  }}
                  collectionData={collectionMemberships.data}
                  collectionLoading={collectionMemberships.loading}
                  onRefreshCollections={collectionMemberships.refresh}
                  collectionLastFetched={collectionMemberships.lastFetched}
                  selectedProductIds={selectedProductIds}
                  onToggleSelect={toggleProductSelect}
                  onSelectAll={selectAllProducts}
                  onDeselectAll={deselectAllProducts}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {generatingAll || pushingAllShopify || pushingAllEbay ? (
                      <Button
                        onClick={() => {
                          if (generatingAll) cancelGenAllRef.current = true;
                          if (pushingAllShopify) cancelPushAllRef.current = true;
                          if (pushingAllEbay) cancelPushAllEbayRef.current = true;
                        }}
                        size="sm"
                        variant="destructive"
                        className="gap-1.5 text-xs sm:text-sm"
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancel {generatingAll ? `SEO (${genAllProgress.done}/${genAllProgress.total})` : pushingAllEbay ? `eBay (${pushAllEbayProgress.done}/${pushAllEbayProgress.total})` : `Push (${pushAllProgress.done}/${pushAllProgress.total})`}
                      </Button>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button disabled={products.length === 0} size="sm" className="gap-1.5 text-xs sm:text-sm">
                            <Rocket className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">SEO Actions{selectedProductIds.size > 0 ? ` (${selectedProductIds.size})` : ""}</span>
                            <span className="sm:hidden">SEO Actions{selectedProductIds.size > 0 ? ` (${selectedProductIds.size})` : ""}</span>
                            <ChevronDown className="h-3 w-3 ml-0.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem onClick={() => handleGenerateAllListings(getSelectedProducts())} className="gap-2">
                            <Sparkles className="h-4 w-4" />
                            <div>
                              <p className="font-medium">Generate SEO</p>
                              <p className="text-[10px] text-muted-foreground">
                                {selectedProductIds.size > 0 ? `For ${selectedProductIds.size} selected products` : "For all products"}
                              </p>
                            </div>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handlePushAllToShopify(getSelectedProducts())} className="gap-2">
                            <Store className="h-4 w-4" />
                            <div>
                              <p className="font-medium">Push to Shopify</p>
                              <p className="text-[10px] text-muted-foreground">
                                {selectedProductIds.size > 0 ? `Sync ${selectedProductIds.size} selected products` : "Sync all products"}
                              </p>
                            </div>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={openEbayConfirm} className="gap-2">
                            <Tag className="h-4 w-4" />
                            <div>
                              <p className="font-medium">Push to eBay</p>
                              <p className="text-[10px] text-muted-foreground">
                                Skips products already on eBay
                              </p>
                            </div>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={async () => { const subset = getSelectedProducts(); await handleGenerateAllListings(subset); if (!cancelGenAllRef.current) handlePushAllToShopify(subset); }} className="gap-2 border-t border-border">
                            <Rocket className="h-4 w-4 text-primary" />
                            <div>
                              <p className="font-medium text-primary">Generate &amp; Push</p>
                              <p className="text-[10px] text-muted-foreground">
                                {selectedProductIds.size > 0 ? `Both steps for ${selectedProductIds.size} selected` : "Run both steps for all"}
                              </p>
                            </div>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
      {selectedOrg && (
        <PrintifyMatchDialog
          open={showPrintifyMatch}
          onOpenChange={setShowPrintifyMatch}
          organizationId={selectedOrg.id}
          products={products}
          onMatched={() => { if (selectedOrg) loadProducts(selectedOrg.id); }}
        />
      )}

      <AlertDialog open={ebayConfirm.open} onOpenChange={(o) => setEbayConfirm((s) => ({ ...s, open: o }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish {ebayConfirm.eligible.length} {ebayConfirm.eligible.length === 1 ? "product" : "products"} to eBay?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  This will create live eBay listings using your existing fulfillment, payment, and return policies.
                  Each product uses its eBay-specific SEO listing (or the first generated listing as fallback) and its current price.
                </p>
                {ebayConfirm.skipped > 0 && (
                  <p className="text-amber-500">
                    {ebayConfirm.skipped} product{ebayConfirm.skipped === 1 ? " is" : "s are"} already on eBay and will be skipped.
                  </p>
                )}
                {ebayConfirm.eligible.length > 0 && (
                  <div className="rounded-md border border-border bg-muted/30 p-3 max-h-40 overflow-y-auto">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Will publish:</p>
                    <ul className="space-y-0.5 text-xs">
                      {ebayConfirm.eligible.slice(0, 10).map((p) => (
                        <li key={p.id} className="truncate">• {p.title || "Untitled"}</li>
                      ))}
                      {ebayConfirm.eligible.length > 10 && (
                        <li className="text-muted-foreground">…and {ebayConfirm.eligible.length - 10} more</li>
                      )}
                    </ul>
                  </div>
                )}
                {ebayConfirm.eligible.length === 0 && (
                  <p className="text-muted-foreground">No eligible products to publish.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={ebayConfirm.eligible.length === 0}
              onClick={() => {
                const toPush = ebayConfirm.products;
                setEbayConfirm({ open: false, products: [], eligible: [], skipped: 0 });
                handlePushAllToEbay(toPush);
              }}
            >
              Publish to eBay
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dashboard;
