import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BusinessContextForm, BusinessContext } from "@/components/BusinessContextForm";
import { ProductForm, ProductInfo } from "@/components/ProductForm";
import { ListingOutput } from "@/components/ListingOutput";
import { generateListings, MarketplaceListings } from "@/lib/listingGenerator";
import { Sparkles } from "lucide-react";

const MARKETPLACES = ["amazon", "etsy", "ebay", "shopify"] as const;

const Index = () => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [business, setBusiness] = useState<BusinessContext | null>(null);
  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [listings, setListings] = useState<MarketplaceListings | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleBusinessSubmit = (data: BusinessContext) => {
    setBusiness(data);
    setStep(2);
  };

  const handleProductSubmit = async (data: ProductInfo) => {
    setProduct(data);
    setIsGenerating(true);
    setStep(3);
    const result = generateListings(business!, data);
    // Simulate AI delay
    await new Promise((r) => setTimeout(r, 1500));
    setListings(result);
    setIsGenerating(false);
  };

  const handleReset = () => {
    setStep(1);
    setBusiness(null);
    setProduct(null);
    setListings(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">ListingForge</h1>
            <p className="text-xs text-muted-foreground">AI-powered marketplace listings</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {/* Progress */}
        <div className="mb-10 flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  step >= s
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {s}
              </div>
              <span
                className={`text-sm font-medium ${
                  step >= s ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {s === 1 ? "Business" : s === 2 ? "Product" : "Listings"}
              </span>
              {s < 3 && (
                <div
                  className={`mx-2 h-px w-12 ${
                    step > s ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {step === 1 && <BusinessContextForm onSubmit={handleBusinessSubmit} initial={business} />}
        {step === 2 && (
          <ProductForm
            onSubmit={handleProductSubmit}
            onBack={() => setStep(1)}
            initial={product}
          />
        )}
        {step === 3 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Your Listings</h2>
                <p className="text-sm text-muted-foreground">
                  Optimized for each marketplace
                </p>
              </div>
              <button
                onClick={handleReset}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Start Over
              </button>
            </div>

            {isGenerating ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-20">
                <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">
                  Generating optimized listings…
                </p>
              </div>
            ) : (
              listings && (
                <Tabs defaultValue="amazon">
                  <TabsList className="w-full justify-start gap-1 bg-secondary/50 p-1">
                    {MARKETPLACES.map((m) => (
                      <TabsTrigger
                        key={m}
                        value={m}
                        className="capitalize data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                      >
                        {m}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {MARKETPLACES.map((m) => (
                    <TabsContent key={m} value={m}>
                      <ListingOutput marketplace={m} listing={listings[m]} />
                    </TabsContent>
                  ))}
                </Tabs>
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
