import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListingOutput, ListingData } from "@/components/ListingOutput";
import { BulkUpload } from "@/components/BulkUpload";
import { AutopilotPipeline } from "@/components/AutopilotPipeline";
import { ProductMockups } from "@/components/ProductMockups";
import { ShopifySettings } from "@/components/ShopifySettings";
import { PushToShopify } from "@/components/PushToShopify";
import {
  Sparkles, Plus, Building2, Package, ArrowLeft, LogOut, Loader2, Trash2, Eye, ImageIcon, Upload, Search, Rocket, Edit2, Check, Settings,
} from "lucide-react";
import { toast } from "sonner";

interface Organization {
  id: string;
  name: string;
  niche: string;
  tone: string;
  audience: string;
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

type View = "orgs" | "org-form" | "products" | "product-form" | "product-detail" | "bulk-upload" | "autopilot" | "settings";

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState<View>("orgs");
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);

  // Form states
  const [orgForm, setOrgForm] = useState({ name: "", niche: "", tone: "", audience: "" });
  const [productForm, setProductForm] = useState({
    title: "", description: "", keywords: "", category: "", price: "", features: "",
  });
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAutoFill, setAiAutoFill] = useState(true);

  useEffect(() => {
    if (user) loadOrgs();
  }, [user]);

  const loadOrgs = async () => {
    setLoading(true);
    const { data } = await supabase.from("organizations").select("*").order("created_at", { ascending: false });
    setOrgs((data as Organization[]) || []);
    setLoading(false);
  };

  const loadProducts = async (orgId: string) => {
    setLoading(true);
    const { data } = await supabase.from("products").select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
    setProducts((data as Product[]) || []);
    setLoading(false);
  };

  const loadListings = async (productId: string) => {
    const { data } = await supabase.from("listings").select("*").eq("product_id", productId);
    setListings((data as Listing[]) || []);
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingOrg) {
      const { error } = await supabase.from("organizations").update(orgForm).eq("id", editingOrg.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Organization updated!");
      setEditingOrg(null);
    } else {
      const { error } = await supabase.from("organizations").insert({ ...orgForm, user_id: user!.id });
      if (error) { toast.error(error.message); return; }
      toast.success("Organization created!");
    }
    setOrgForm({ name: "", niche: "", tone: "", audience: "" });
    setView("orgs");
    loadOrgs();
  };

  const handleEditOrg = (org: Organization) => {
    setEditingOrg(org);
    setOrgForm({ name: org.name, niche: org.niche, tone: org.tone, audience: org.audience });
    setView("org-form");
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

    let imageUrl: string | null = null;
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

    // Auto-generate listings
    setSelectedProduct(product as Product);
    setView("product-detail");
    await generateListingsForProduct(product as Product);
    loadProducts(selectedOrg.id);
  };

  const generateListingsForProduct = async (product: Product) => {
    if (!selectedOrg) return;
    setGenerating(true);

    try {
      const { data: result, error } = await supabase.functions.invoke("generate-listings", {
        body: {
          business: { name: selectedOrg.name, niche: selectedOrg.niche, tone: selectedOrg.tone, audience: selectedOrg.audience },
          product: { title: product.title, description: product.description, keywords: product.keywords, category: product.category, price: product.price, features: product.features },
        },
      });
      if (error) throw error;
      if (result.error) throw new Error(result.error);

      // Delete old listings then save new ones
      await supabase.from("listings").delete().eq("product_id", product.id);

      const listingRows = MARKETPLACES.map((m) => ({
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
      toast.success("Listings generated and saved!");
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
              <p className="text-xs text-muted-foreground">AI-powered marketplace listings</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={signOut} className="gap-2">
            <LogOut className="h-4 w-4" /> Sign Out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {/* Organizations List */}
        {view === "orgs" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Organizations</h2>
                <p className="text-sm text-muted-foreground">Manage your businesses and their products</p>
              </div>
              <Button onClick={() => setView("org-form")} className="gap-2">
                <Plus className="h-4 w-4" /> New Organization
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : orgs.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
                <Building2 className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No organizations yet</p>
                <Button variant="link" onClick={() => setView("org-form")} className="mt-2">
                  Create your first one
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {orgs.map((org) => (
                  <div
                    key={org.id}
                    className="group relative cursor-pointer rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
                    onClick={() => handleSelectOrg(org)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold">{org.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{org.niche}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditOrg(org); }}
                        className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteOrg(org.id); }}
                        className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
                      <span>Tone: {org.tone}</span>
                      <span>•</span>
                      <span>Audience: {org.audience}</span>
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
              <Button type="button" variant="ghost" size="icon" onClick={() => { setView("orgs"); setEditingOrg(null); setOrgForm({ name: "", niche: "", tone: "", audience: "" }); }}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h2 className="text-2xl font-bold">{editingOrg ? "Edit Organization" : "New Organization"}</h2>
                <p className="text-sm text-muted-foreground">{editingOrg ? "Update your business context" : "Set up your business context"}</p>
              </div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Business Name</Label>
                <Input value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} required placeholder="e.g. Wildberry Crafts" />
              </div>
              <div className="space-y-2">
                <Label>Niche / Industry</Label>
                <Input value={orgForm.niche} onChange={(e) => setOrgForm({ ...orgForm, niche: e.target.value })} required placeholder="e.g. Handmade candles" />
              </div>
              <div className="space-y-2">
                <Label>Brand Tone</Label>
                <Input value={orgForm.tone} onChange={(e) => setOrgForm({ ...orgForm, tone: e.target.value })} required placeholder="e.g. Warm & friendly" />
              </div>
              <div className="space-y-2">
                <Label>Target Audience</Label>
                <Input value={orgForm.audience} onChange={(e) => setOrgForm({ ...orgForm, audience: e.target.value })} required placeholder="e.g. Young professionals" />
              </div>
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
                <p className="text-sm text-muted-foreground">{selectedOrg.niche} • {products.length} products</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setView("autopilot")} className="gap-2">
                  <Rocket className="h-4 w-4" /> Launch to Shopify
                </Button>
                <Button variant="outline" onClick={() => setView("bulk-upload")} className="gap-2">
                  <Upload className="h-4 w-4" /> Import Products
                </Button>
                <Button variant="outline" onClick={() => setView("product-form")} className="gap-2">
                  <Plus className="h-4 w-4" /> Add Product
                </Button>
              </div>
            </div>

            {/* Search */}
            {products.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search products…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
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
                  .filter((p) => !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((product) => (
                  <div
                    key={product.id}
                    className="group relative cursor-pointer rounded-xl border border-border bg-card overflow-hidden transition-colors hover:border-primary/40"
                    onClick={() => handleViewProduct(product)}
                  >
                    {product.image_url && (
                      <div className="h-32 overflow-hidden bg-secondary">
                        <img src={product.image_url} alt={product.title} className="h-full w-full object-contain p-2" />
                      </div>
                    )}
                    {!product.image_url && (
                      <div className="flex h-32 items-center justify-center bg-secondary">
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
                <h2 className="text-2xl font-bold">Add Product</h2>
                <p className="text-sm text-muted-foreground">Upload an image or fill in manually</p>
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
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => { setView("products"); setSelectedProduct(null); }}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1">
                <h2 className="text-2xl font-bold">{selectedProduct.title}</h2>
                <p className="text-sm text-muted-foreground">{selectedProduct.category} {selectedProduct.price && `• ${selectedProduct.price}`}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateListingsForProduct(selectedProduct)}
                disabled={generating}
                className="gap-2"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Regenerate
              </Button>
            </div>

            {/* Mockup Images */}
            <div className="rounded-xl border border-border bg-card p-5">
              <ProductMockups productId={selectedProduct.id} userId={user!.id} productTitle={selectedProduct.title} />
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
        {/* Autopilot Pipeline */}
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
      </main>
    </div>
  );
};

export default Dashboard;
