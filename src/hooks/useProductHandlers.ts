import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notifySyncFailure } from "@/lib/notificationHelpers";
import type { Product, Listing, Organization } from "@/types/dashboard";
import { ALL_MARKETPLACES } from "@/types/dashboard";

export function useProductHandlers(
  userId: string | undefined,
  selectedOrg: Organization | null,
  aiUsage: any,
  onOrganizationRefresh?: (orgId: string) => Promise<void>,
) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [selectedMarketplaces, setSelectedMarketplaces] = useState<string[]>([]);

  // Import state
  const [importingShopify, setImportingShopify] = useState(false);
  const importAbortRef = useRef<AbortController | null>(null);
  const [showPrintifyMatch, setShowPrintifyMatch] = useState(false);

  // Generate/push all state
  const [generatingAll, setGeneratingAll] = useState(false);
  const [genAllProgress, setGenAllProgress] = useState({ done: 0, total: 0 });
  const cancelGenAllRef = useRef(false);
  const [pushingAllShopify, setPushingAllShopify] = useState(false);
  const [pushAllProgress, setPushAllProgress] = useState({ done: 0, total: 0 });
  const cancelPushAllRef = useRef(false);

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

  const generateListingsForProduct = async (product: Product, marketplaces?: string[]) => {
    if (!selectedOrg) return;
    const targets = marketplaces || selectedMarketplaces;
    if (targets.length === 0) { toast.error("Select at least one marketplace"); return; }
    setGenerating(true);
    try {
      if (aiUsage) {
        const allowed = await aiUsage.checkAndLog("generate-listings", userId!);
        if (!allowed) { setGenerating(false); return; }
      }
      const { data: result, error } = await supabase.functions.invoke("generate-listings", {
        body: {
          business: { name: selectedOrg.name, niche: selectedOrg.niche, tone: selectedOrg.tone, audience: selectedOrg.audience },
          product: { title: product.title, description: product.description, keywords: product.keywords, category: product.category, price: product.price, features: product.features },
          marketplaces: targets,
          excludedSections: selectedOrg.listing_excluded_sections || [],
        },
      });
      if (error) throw error;
      if (result.error) throw new Error(result.error);
      for (const m of targets) await supabase.from("listings").delete().eq("product_id", product.id).eq("marketplace", m);
      const listingRows = targets.filter((m) => result[m]).map((m) => ({
        product_id: product.id, user_id: userId!, marketplace: m, title: result[m].title,
        description: result[m].description, bullet_points: result[m].bulletPoints, tags: result[m].tags,
        seo_title: result[m].seoTitle || "", seo_description: result[m].seoDescription || "",
        url_handle: result[m].urlHandle || "", alt_text: result[m].altText || "",
      }));
      const { error: insertError } = await supabase.from("listings").insert(listingRows);
      if (insertError) throw insertError;
      await loadListings(product.id);
      if (aiUsage) await aiUsage.logUsage("generate-listings", userId!);
      toast.success(`Listings generated for ${targets.join(", ")}!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate listings");
    } finally {
      setGenerating(false);
    }
  };

  const handleViewProduct = async (product: Product) => {
    setSelectedProduct(product);
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

  const toggleMarketplace = (m: string) => {
    setSelectedMarketplaces((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  };

  const handleImportFromShopify = async () => {
    if (!selectedOrg) return;
    const { data: shopifyConn } = await supabase.from("shopify_connections").select("id").eq("user_id", userId!).eq("organization_id", selectedOrg.id).maybeSingle();
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
      const newProducts = await loadProducts(selectedOrg.id);
      await onOrganizationRefresh?.(selectedOrg.id);
      // Check if any unlinked products could match Printify
      const hasUnlinked = newProducts.some((p) => !p.printify_product_id);
      if (hasUnlinked) {
        setShowPrintifyMatch(true);
      }
    } catch (err: any) {
      if (controller.signal.aborted) { toast.info("Import cancelled"); return; }
      toast.error(err.message || "Failed to import from Shopify");
    } finally {
      setImportingShopify(false);
      importAbortRef.current = null;
    }
  };

  const handleCancelImport = () => { importAbortRef.current?.abort(); setImportingShopify(false); };

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
        if (aiUsage) { const allowed = await aiUsage.checkAndLog("generate-listings", userId!); if (!allowed) { toast.error("AI generation limit reached"); break; } }
        const { data: result, error } = await supabase.functions.invoke("generate-listings", {
          body: { business: { name: selectedOrg.name, niche: selectedOrg.niche, tone: selectedOrg.tone, audience: selectedOrg.audience }, product: { title: product.title, description: product.description, keywords: product.keywords, category: product.category, price: product.price, features: product.features } },
        });
        if (error) throw error;
        if (result?.error) throw new Error(result.error);
        await supabase.from("listings").delete().eq("product_id", product.id);
        const bulkMarketplaces = selectedOrg?.enabled_marketplaces?.length ? selectedOrg.enabled_marketplaces : ["etsy", "ebay", "shopify"];
        const listingRows = bulkMarketplaces.map((m) => ({ product_id: product.id, user_id: userId!, marketplace: m, title: result[m].title, description: result[m].description, bullet_points: result[m].bulletPoints, tags: result[m].tags, seo_title: result[m].seoTitle || "", seo_description: result[m].seoDescription || "", url_handle: result[m].urlHandle || "", alt_text: result[m].altText || "" }));
        await supabase.from("listings").insert(listingRows);
        if (aiUsage) await aiUsage.logUsage("generate-listings", userId!);
        successCount++;
      } catch (err: any) { console.error(`Failed to generate listings for ${product.title}:`, err); toast.error(`Failed: ${product.title}`); }
      if (i < products.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }
    setGenAllProgress({ done: products.length, total: products.length });
    setGeneratingAll(false);
    if (!cancelGenAllRef.current) toast.success(`Generated listings for ${successCount}/${products.length} products!`);
  };

  const handlePushAllToShopify = async () => {
    if (!selectedOrg || products.length === 0) return;
    const { data: shopifyConn } = await supabase.from("shopify_connections").select("id").eq("user_id", userId!).eq("organization_id", selectedOrg.id).maybeSingle();
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
          body: { organizationId: selectedOrg!.id, userId: userId!, productId: product.id, listing: { title: shopifyListing.title, description: shopifyListing.description, tags: shopifyListing.tags, seo_title: shopifyListing.seo_title, seo_description: shopifyListing.seo_description, url_handle: shopifyListing.url_handle, alt_text: shopifyListing.alt_text, price: product.price }, images: product.image_url ? [{ image_url: product.image_url }] : [] },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        successCount++;
      } catch (err: any) {
        console.error(`Failed to push ${product.title} to Shopify:`, err);
        if (userId && selectedOrg) notifySyncFailure(userId, selectedOrg.id, "Shopify", `Failed to push "${product.title}": ${err.message || "Unknown error"}`);
      }
      if (i < products.length - 1) await new Promise((r) => setTimeout(r, 1000));
    }
    setPushAllProgress({ done: products.length, total: products.length });
    setPushingAllShopify(false);
    if (!cancelPushAllRef.current) { toast.success(`Pushed ${successCount}/${products.length} products to Shopify!`); if (selectedOrg) loadProducts(selectedOrg.id); }
  };

  return {
    products, setProducts, selectedProduct, setSelectedProduct,
    listings, setListings, loading, generating,
    searchQuery, setSearchQuery, activeFilter, setActiveFilter,
    selectedMarketplaces, setSelectedMarketplaces,
    importingShopify, generatingAll, genAllProgress, cancelGenAllRef,
    pushingAllShopify, pushAllProgress, cancelPushAllRef,
    showPrintifyMatch, setShowPrintifyMatch,
    loadProducts, loadListings,
    generateListingsForProduct, handleViewProduct, handleDeleteProduct,
    getFilteredProducts, allTags, handleAddTag, handleRemoveTag,
    toggleMarketplace,
    handleImportFromShopify, handleCancelImport,
    handleGenerateAllListings, handlePushAllToShopify,
  };
}
