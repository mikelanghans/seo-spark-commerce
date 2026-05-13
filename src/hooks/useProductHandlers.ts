import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notifySyncFailure } from "@/lib/notificationHelpers";
import type { Product, Listing, Organization } from "@/types/dashboard";
import { ALL_MARKETPLACES } from "@/types/dashboard";

const isPublishedEbayListingId = (value?: string | null) => !!value && !/^BA-[a-z0-9-]+$/i.test(value);

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
  const [pushingAllEbay, setPushingAllEbay] = useState(false);
  const [pushAllEbayProgress, setPushAllEbayProgress] = useState({ done: 0, total: 0 });
  const cancelPushAllEbayRef = useRef(false);
  const [pushingAllEtsy, setPushingAllEtsy] = useState(false);
  const [pushAllEtsyProgress, setPushAllEtsyProgress] = useState({ done: 0, total: 0 });
  const cancelPushAllEtsyRef = useRef(false);
  const [pushingAllPrintify, setPushingAllPrintify] = useState(false);
  const [pushAllPrintifyProgress, setPushAllPrintifyProgress] = useState({ done: 0, total: 0 });
  const cancelPushAllPrintifyRef = useRef(false);

  // Warn before navigating away while a long-running bulk operation is in progress.
  const bulkInProgress = generatingAll || pushingAllShopify || pushingAllEbay || pushingAllEtsy || pushingAllPrintify || importingShopify;
  useEffect(() => {
    if (!bulkInProgress) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [bulkInProgress]);

  const loadProducts = async (orgId: string): Promise<Product[]> => {
    setLoading(true);
    const { data } = await supabase.from("products").select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
    const prods = (data as Product[]) || [];
    setProducts(prods);
    // Keep the currently-viewed product in sync with the latest DB row so inline edits
    // (e.g. category, price, tags) re-render immediately in the detail view.
    setSelectedProduct((current) => {
      if (!current) return current;
      const fresh = prods.find((p) => p.id === current.id);
      return fresh ?? current;
    });
    setLoading(false);
    return prods;
  };

  const loadListings = async (productId: string) => {
    // Clear stale listings first so a previous product's tags can't briefly leak into the UI
    setListings([]);
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

      // CRITICAL: re-fetch the latest product row so any unsaved-in-state edits
      // (title, category, description, features, keywords) are picked up. The
      // in-memory `product` arg can lag behind the DB after inline edits.
      const { data: freshProduct, error: fetchError } = await supabase
        .from("products")
        .select("id, title, description, keywords, category, price, features")
        .eq("id", product.id)
        .single();
      if (fetchError) throw fetchError;
      const src = freshProduct ?? product;

      const trim = (v: unknown) => (typeof v === "string" ? v.trim() : "");
      const productPayload = {
        title: trim(src.title),
        description: trim(src.description),
        keywords: trim(src.keywords),
        category: trim(src.category),
        price: trim(src.price),
        features: trim(src.features),
      };

      // Pull latest completed SEO scan findings (if any) so the AI can avoid
      // the same issues that hurt the storefront's existing score.
      let seoFindings: { overallScore?: number; topRecommendations?: string[]; topIssues?: { code: string; message: string; pageCount: number }[] } | undefined;
      try {
        const { data: scan } = await supabase
          .from("seo_scans")
          .select("report")
          .eq("organization_id", selectedOrg.id)
          .eq("status", "complete")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const report = (scan?.report ?? null) as any;
        if (report) {
          const grouped = Array.isArray(report.groupedIssues) ? report.groupedIssues : [];
          // Keep only issues that listing copy can actually influence
          const COPY_RELEVANT = new Set([
            "missing_title", "short_title", "long_title",
            "missing_meta_desc", "short_desc", "long_desc",
            "missing_alt", "thin_content", "no_question_content",
            "weak_heading_hierarchy", "aeo_no_subheadings",
          ]);
          const topIssues = grouped
            .filter((g: any) => COPY_RELEVANT.has(g.code))
            .slice(0, 6)
            .map((g: any) => ({ code: g.code, message: g.message, pageCount: (g.pages || []).length }));
          seoFindings = {
            overallScore: typeof report.overallScore === "number" ? report.overallScore : undefined,
            topRecommendations: Array.isArray(report.topRecommendations) ? report.topRecommendations.slice(0, 5) : [],
            topIssues,
          };
        }
      } catch (err) {
        console.warn("Could not load SEO findings for listing generator:", err);
      }

      const { data: result, error } = await supabase.functions.invoke("generate-listings", {
        body: {
          business: { name: selectedOrg.name, niche: selectedOrg.niche, tone: selectedOrg.tone, audience: selectedOrg.audience },
          product: productPayload,
          marketplaces: targets,
          excludedSections: selectedOrg.listing_excluded_sections || [],
          seoFindings,
        },
      });
      if (error) throw error;
      if (result.error) throw new Error(result.error);
      // Hard-reset stale listings (tags/SEO from a previous product or pre-regeneration state)
      // before deleting the targeted marketplace rows and inserting the fresh ones.
      setListings([]);
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
      // Refresh local product state too so the UI reflects whatever the DB now holds.
      if (selectedOrg) await loadProducts(selectedOrg.id);
      if (aiUsage) await aiUsage.logUsage("generate-listings", userId!);
      const succeeded = targets.filter((m) => result[m]);
      const failed = targets.filter((m) => !result[m]);
      if (failed.length > 0 && succeeded.length > 0) {
        toast.warning(`Generated ${succeeded.join(", ")}. Failed: ${failed.join(", ")} — try again to fill in.`);
      } else {
        toast.success(`Listings generated for ${succeeded.join(", ")}!`);
      }
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

  const handleGenerateAllListings = async (productSubset?: Product[]) => {
    const targetProducts = productSubset || products;
    if (!selectedOrg || targetProducts.length === 0) return;
    cancelGenAllRef.current = false;
    setGeneratingAll(true);
    setGenAllProgress({ done: 0, total: targetProducts.length });
    let successCount = 0;
    for (let i = 0; i < targetProducts.length; i++) {
      if (cancelGenAllRef.current) { toast.info(`Cancelled after ${successCount} products`); break; }
      const product = targetProducts[i];
      setGenAllProgress({ done: i, total: targetProducts.length });
      try {
        if (aiUsage) { const allowed = await aiUsage.checkAndLog("generate-listings", userId!); if (!allowed) { toast.error("AI generation limit reached"); break; } }
        const { data: result, error } = await supabase.functions.invoke("generate-listings", {
          body: { business: { name: selectedOrg.name, niche: selectedOrg.niche, tone: selectedOrg.tone, audience: selectedOrg.audience }, product: { title: product.title, description: product.description, keywords: product.keywords, category: product.category, price: product.price, features: product.features }, excludedSections: selectedOrg.listing_excluded_sections || [] },
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
      if (i < targetProducts.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }
    setGenAllProgress({ done: targetProducts.length, total: targetProducts.length });
    setGeneratingAll(false);
    if (!cancelGenAllRef.current) toast.success(`Generated listings for ${successCount}/${targetProducts.length} products!`);
  };

  const handlePushAllToShopify = async (productSubset?: Product[]) => {
    const targetProducts = productSubset || products;
    if (!selectedOrg || targetProducts.length === 0) return;
    const { data: shopifyConn } = await supabase.from("shopify_connections").select("id").eq("user_id", userId!).eq("organization_id", selectedOrg.id).maybeSingle();
    if (!shopifyConn) { toast.error("No Shopify store connected. Go to Settings to connect first."); return; }
    cancelPushAllRef.current = false;
    setPushingAllShopify(true);
    setPushAllProgress({ done: 0, total: targetProducts.length });
    let successCount = 0;
    for (let i = 0; i < targetProducts.length; i++) {
      if (cancelPushAllRef.current) { toast.info(`Cancelled after ${successCount} products`); break; }
      const product = targetProducts[i];
      setPushAllProgress({ done: i, total: targetProducts.length });
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
      if (i < targetProducts.length - 1) await new Promise((r) => setTimeout(r, 1000));
    }
    setPushAllProgress({ done: targetProducts.length, total: targetProducts.length });
    setPushingAllShopify(false);
    if (!cancelPushAllRef.current) { toast.success(`Pushed ${successCount}/${targetProducts.length} products to Shopify!`); if (selectedOrg) loadProducts(selectedOrg.id); }
  };

  const handlePushAllToEbay = async (productSubset?: Product[]) => {
    const targetProducts = productSubset || products;
    if (!selectedOrg || !userId || targetProducts.length === 0) return;
    const { data: ebayConn } = await supabase.from("ebay_connections").select("id, token_expires_at").eq("user_id", userId).maybeSingle();
    if (!ebayConn) { toast.error("eBay not connected. Go to Settings to connect first."); return; }

    // Only products without an existing eBay listing
    const queue = targetProducts.filter((p) => !isPublishedEbayListingId(p.ebay_listing_id));
    const skipped = targetProducts.length - queue.length;
    if (queue.length === 0) { toast.info("All selected products already have eBay listings."); return; }
    if (skipped > 0) toast.info(`Skipping ${skipped} product(s) already on eBay`);

    cancelPushAllEbayRef.current = false;
    setPushingAllEbay(true);
    setPushAllEbayProgress({ done: 0, total: queue.length });
    let successCount = 0;

    for (let i = 0; i < queue.length; i++) {
      if (cancelPushAllEbayRef.current) { toast.info(`Cancelled after ${successCount} products`); break; }
      const product = queue[i];
      setPushAllEbayProgress({ done: i, total: queue.length });
      try {
        const { data: productListings } = await supabase.from("listings").select("*").eq("product_id", product.id);
        if (!productListings || productListings.length === 0) {
          if (userId && selectedOrg) notifySyncFailure(userId, selectedOrg.id, "eBay", `Skipped "${product.title}": no SEO listing. Generate one first.`);
          continue;
        }
        const ebayListing = productListings.find((l) => l.marketplace === "ebay") || productListings[0];
        const { data: imgs } = await supabase.from("product_images").select("image_url, position, image_type").eq("product_id", product.id).order("position", { ascending: true });
        const images = (imgs || [])
          .filter((img: any) => img.image_type === "mockup")
          .map((img: any) => ({ image_url: img.image_url, image_type: img.image_type }));
        if (images.length === 0) {
          if (userId && selectedOrg) notifySyncFailure(userId, selectedOrg.id, "eBay", `Skipped "${product.title}": no mockup images. Generate mockups before pushing to eBay.`);
          continue;
        }

        const { data, error } = await supabase.functions.invoke("push-to-ebay", {
          body: {
            userId,
            productId: product.id,
            listing: {
              title: ebayListing.title,
              description: ebayListing.description,
              tags: ebayListing.tags,
              seo_title: ebayListing.seo_title,
              seo_description: ebayListing.seo_description,
              url_handle: ebayListing.url_handle,
              alt_text: ebayListing.alt_text,
              bullet_points: ebayListing.bullet_points,
              price: product.price,
            },
            images,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        successCount++;
      } catch (err: any) {
        console.error(`Failed to push ${product.title} to eBay:`, err);
        if (userId && selectedOrg) notifySyncFailure(userId, selectedOrg.id, "eBay", `Failed to push "${product.title}": ${err.message || "Unknown error"}`);
      }
      if (i < queue.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }
    setPushAllEbayProgress({ done: queue.length, total: queue.length });
    setPushingAllEbay(false);
    if (!cancelPushAllEbayRef.current) {
      toast.success(`Pushed ${successCount}/${queue.length} products to eBay!`);
      if (selectedOrg) loadProducts(selectedOrg.id);
    }
  };

  const handlePushAllToEtsy = async (productSubset?: Product[]) => {
    const targetProducts = productSubset || products;
    if (!selectedOrg || !userId || targetProducts.length === 0) return;
    const { data: etsyConn } = await supabase.from("etsy_connections").select("id").eq("user_id", userId).maybeSingle();
    if (!etsyConn?.id) { toast.error("Etsy not connected. Go to Settings to connect first."); return; }

    const queue = targetProducts.filter((p) => !p.etsy_listing_id);
    const skipped = targetProducts.length - queue.length;
    if (queue.length === 0) { toast.info("All selected products already have Etsy listings."); return; }
    if (skipped > 0) toast.info(`Skipping ${skipped} product(s) already on Etsy`);

    cancelPushAllEtsyRef.current = false;
    setPushingAllEtsy(true);
    setPushAllEtsyProgress({ done: 0, total: queue.length });
    let successCount = 0;

    for (let i = 0; i < queue.length; i++) {
      if (cancelPushAllEtsyRef.current) { toast.info(`Cancelled after ${successCount} products`); break; }
      const product = queue[i];
      setPushAllEtsyProgress({ done: i, total: queue.length });
      try {
        const { data: productListings } = await supabase.from("listings").select("*").eq("product_id", product.id);
        if (!productListings || productListings.length === 0) {
          if (userId && selectedOrg) notifySyncFailure(userId, selectedOrg.id, "Etsy", `Skipped "${product.title}": no SEO listing. Generate one first.`);
          continue;
        }
        const etsyListing = productListings.find((l) => l.marketplace === "etsy") || productListings[0];
        const { data: imgs } = await supabase.from("product_images").select("image_url, position").eq("product_id", product.id).order("position", { ascending: true });
        const images = (imgs && imgs.length > 0)
          ? imgs.map((img) => ({ image_url: img.image_url }))
          : (product.image_url ? [{ image_url: product.image_url }] : []);

        const { data, error } = await supabase.functions.invoke("push-to-etsy", {
          body: {
            userId,
            productId: product.id,
            listing: {
              title: etsyListing.title,
              description: etsyListing.description,
              tags: etsyListing.tags,
              seo_title: etsyListing.seo_title,
              seo_description: etsyListing.seo_description,
              url_handle: etsyListing.url_handle,
              alt_text: etsyListing.alt_text,
              price: product.price,
            },
            images,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        successCount++;
      } catch (err: any) {
        console.error(`Failed to push ${product.title} to Etsy:`, err);
        if (userId && selectedOrg) notifySyncFailure(userId, selectedOrg.id, "Etsy", `Failed to push "${product.title}": ${err.message || "Unknown error"}`);
      }
      if (i < queue.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }
    setPushAllEtsyProgress({ done: queue.length, total: queue.length });
    setPushingAllEtsy(false);
    if (!cancelPushAllEtsyRef.current) {
      toast.success(`Pushed ${successCount}/${queue.length} products to Etsy!`);
      if (selectedOrg) loadProducts(selectedOrg.id);
    }
  };

  const handlePushAllToPrintify = async (productSubset?: Product[]) => {
    const targetProducts = productSubset || products;
    if (!selectedOrg || !userId || targetProducts.length === 0) return;

    const queue = targetProducts.filter((p) => !!p.printify_product_id);
    const skipped = targetProducts.length - queue.length;
    if (queue.length === 0) {
      toast.error("None of the selected products are linked to Printify yet. Use 'Push to Shopify' (which goes via Printify) to create them first.");
      return;
    }
    if (skipped > 0) toast.info(`Skipping ${skipped} product(s) not yet on Printify`);

    cancelPushAllPrintifyRef.current = false;
    setPushingAllPrintify(true);
    // Total work units = printify push + shopify image republish (for products with shopify_product_id)
    const shopifyCount = queue.filter((p) => !!p.shopify_product_id).length;
    const totalUnits = queue.length + shopifyCount;
    setPushAllPrintifyProgress({ done: 0, total: totalUnits });
    let doneUnits = 0;
    let successCount = 0;
    let publishFailures = 0;
    let shopifySuccess = 0;

    const printifyShopId = (selectedOrg as any).printify_shop_id;
    const CONCURRENCY = 3;

    // ============ PHASE 1: Push all to Printify in parallel ============
    const printifySuccessProducts: Product[] = [];

    const runPrintify = async (product: Product) => {
      if (cancelPushAllPrintifyRef.current) return;
      try {
        const { data: productListings } = await supabase.from("listings").select("*").eq("product_id", product.id);
        const shopifyListing = productListings?.find((l) => l.marketplace === "shopify") || productListings?.[0];

        const { data, error } = await supabase.functions.invoke("printify-create-product", {
          body: {
            action: "update",
            organizationId: selectedOrg.id,
            shopId: printifyShopId,
            productId: product.id,
            printifyProductId: product.printify_product_id,
            updateFields: ["title", "description", "tags", "pricing"],
            title: shopifyListing?.title || product.title,
            description: shopifyListing?.description || product.description,
            tags: (() => {
              const listingTags: string[] = Array.isArray(shopifyListing?.tags)
                ? (shopifyListing.tags as any[]).map((t) => String(t))
                : (typeof shopifyListing?.tags === "string"
                    ? (shopifyListing.tags as string).split(",").map((t: string) => t.trim())
                    : (product.keywords || "").split(",").map((k: string) => k.trim()).filter(Boolean));
              const productTags: string[] = Array.isArray(product.tags) ? product.tags : [];
              const merged = [...listingTags, ...productTags].map((t) => String(t || "").trim()).filter(Boolean);
              const seen = new Set<string>();
              return merged.filter((t) => { const k = t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
            })(),
            price: product.price,
            sizePricing: product.size_pricing || (selectedOrg as any).default_size_pricing || {},
            category: product.category,
            publish: true,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (data?.staleIdCleared) throw new Error("Product no longer exists on Printify (link cleared)");
        if (data?.publishError) {
          publishFailures++;
          console.warn(`Printify publish warning for ${product.title}:`, data.publishError);
        }
        successCount++;
        if (product.shopify_product_id) printifySuccessProducts.push(product);
      } catch (err: any) {
        console.error(`Failed to push ${product.title} to Printify:`, err);
        if (userId && selectedOrg) notifySyncFailure(userId, selectedOrg.id, "Printify", `Failed to push "${product.title}": ${err.message || "Unknown error"}`);
      } finally {
        doneUnits++;
        setPushAllPrintifyProgress({ done: doneUnits, total: totalUnits });
      }
    };

    // Concurrency-limited runner
    const runWithConcurrency = async <T,>(items: T[], worker: (item: T) => Promise<void>, limit: number) => {
      let idx = 0;
      const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (idx < items.length) {
          if (cancelPushAllPrintifyRef.current) return;
          const myIdx = idx++;
          await worker(items[myIdx]);
        }
      });
      await Promise.all(workers);
    };

    await runWithConcurrency(queue, runPrintify, CONCURRENCY);

    // ============ PHASE 2: Republish Shopify mockups + shipping ============
    if (!cancelPushAllPrintifyRef.current && printifySuccessProducts.length > 0) {
      // Wait once for Printify→Shopify image sync to finish (typically 10–15s)
      toast.info(`Waiting 20s for Printify→Shopify image sync, then republishing ${printifySuccessProducts.length} mockups…`);
      await new Promise((r) => setTimeout(r, 20000));

      const runShopify = async (product: Product) => {
        if (cancelPushAllPrintifyRef.current) return;
        try {
          const { data: productListings } = await supabase.from("listings").select("*").eq("product_id", product.id);
          const { buildShopifyGallery } = await import("@/lib/shopifyGallery");
          const variants = await buildShopifyGallery({
            productId: product.id,
            userId: userId!,
            appendSizeChart: true,
          });
          await supabase.functions.invoke("push-to-shopify", {
            body: {
              organizationId: selectedOrg.id,
              product: {
                id: product.id,
                title: product.title,
                description: product.description,
                price: product.price,
                shopify_product_id: product.shopify_product_id,
                printify_product_id: product.printify_product_id,
                size_pricing: product.size_pricing,
                category: product.category,
              },
              listings: productListings || [],
              imageUrl: product.image_url,
              variants,
              updateFields: ["shipping_profile", "images"],
              replaceAllImages: true,
            },
          });
          shopifySuccess++;
        } catch (shipErr: any) {
          console.warn(`Post-Printify Shopify image/shipping update failed for ${product.title}:`, shipErr?.message || shipErr);
        } finally {
          doneUnits++;
          setPushAllPrintifyProgress({ done: doneUnits, total: totalUnits });
        }
      };

      await runWithConcurrency(printifySuccessProducts, runShopify, CONCURRENCY);
    }

    setPushAllPrintifyProgress({ done: totalUnits, total: totalUnits });
    setPushingAllPrintify(false);
    if (!cancelPushAllPrintifyRef.current) {
      const note = publishFailures > 0 ? ` (${publishFailures} publish warnings — check notifications)` : "";
      const shopNote = shopifyCount > 0 ? ` · Shopify mockups: ${shopifySuccess}/${shopifyCount}` : "";
      toast.success(`Printify: ${successCount}/${queue.length}${note}${shopNote}`);
      if (selectedOrg) loadProducts(selectedOrg.id);
    } else {
      toast.info(`Cancelled after Printify ${successCount} · Shopify ${shopifySuccess}`);
    }
  };

  return {
    products, setProducts, selectedProduct, setSelectedProduct,
    listings, setListings, loading, generating,
    searchQuery, setSearchQuery, activeFilter, setActiveFilter,
    selectedMarketplaces, setSelectedMarketplaces,
    importingShopify, generatingAll, genAllProgress, cancelGenAllRef,
    pushingAllShopify, pushAllProgress, cancelPushAllRef,
    pushingAllEbay, pushAllEbayProgress, cancelPushAllEbayRef,
    pushingAllEtsy, pushAllEtsyProgress, cancelPushAllEtsyRef,
    pushingAllPrintify, pushAllPrintifyProgress, cancelPushAllPrintifyRef,
    showPrintifyMatch, setShowPrintifyMatch,
    loadProducts, loadListings,
    generateListingsForProduct, handleViewProduct, handleDeleteProduct,
    getFilteredProducts, allTags, handleAddTag, handleRemoveTag,
    toggleMarketplace,
    handleImportFromShopify, handleCancelImport,
    handleGenerateAllListings, handlePushAllToShopify, handlePushAllToEbay, handlePushAllToEtsy,
    handlePushAllToPrintify,
  };
}
