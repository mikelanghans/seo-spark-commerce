import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  DollarSign, Loader2, Sparkles, TrendingUp, Target, Star, Calculator,
} from "lucide-react";
import { toast } from "sonner";

interface PricingTier {
  label: string;
  price: number;
  reasoning: string;
  targetAudience: string;
  marginEstimate: number;
}

interface PricingResult {
  marketAnalysis: string;
  typicalRange: { low: number; high: number };
  tiers: PricingTier[];
  recommendedTier: string;
  recommendedReason: string;
}

interface Props {
  product: {
    title: string;
    description: string;
    category: string;
    keywords: string;
    price: string;
    features: string;
  };
  business: {
    name: string;
    niche: string;
    audience: string;
    tone: string;
  };
  onApplyPrice?: (price: string) => void;
}

export const SmartPricing = ({ product, business, onApplyPrice }: Props) => {
  const [result, setResult] = useState<PricingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [costInput, setCostInput] = useState("12");
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-pricing", {
        body: { product, business },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data as PricingResult);
    } catch (err: any) {
      toast.error(err.message || "Pricing analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const cost = parseFloat(costInput) || 0;
  const calcMargin = (price: number) => price > 0 ? Math.round(((price - cost) / price) * 100) : 0;
  const calcProfit = (price: number) => Math.max(0, price - cost);

  const tierIcon = (label: string) => {
    if (label === "Budget") return <Target className="h-3.5 w-3.5" />;
    if (label === "Mid-Range") return <TrendingUp className="h-3.5 w-3.5" />;
    return <Star className="h-3.5 w-3.5" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Smart Pricing
          </h4>
          <p className="text-xs text-muted-foreground">
            AI-suggested pricing based on market analysis and brand positioning
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleAnalyze}
          disabled={loading}
          className="gap-1.5"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Analyze Pricing
        </Button>
      </div>

      {result && (
        <div className="space-y-4">
          {/* Market Analysis */}
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Market Analysis</p>
            <p className="text-sm">{result.marketAnalysis}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Typical range: ${result.typicalRange.low.toFixed(2)} – ${result.typicalRange.high.toFixed(2)}
            </p>
          </div>

          {/* Cost Input for Margin Calculator */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
            <Calculator className="h-4 w-4 text-muted-foreground shrink-0" />
            <Label className="text-xs shrink-0">Your cost per unit:</Label>
            <div className="relative w-24">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
              <Input
                type="number"
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                className="h-7 pl-5 text-xs"
                step="0.01"
                min="0"
              />
            </div>
          </div>

          {/* Pricing Tiers */}
          <div className="grid gap-2 sm:grid-cols-3">
            {result.tiers.map((tier) => {
              const isRecommended = tier.label === result.recommendedTier;
              const isSelected = selectedPrice === tier.price;
              return (
                <Card
                  key={tier.label}
                  className={`relative cursor-pointer p-3 transition-all hover:shadow-md ${
                    isSelected
                      ? "ring-2 ring-primary"
                      : isRecommended
                      ? "border-primary/50"
                      : ""
                  }`}
                  onClick={() => setSelectedPrice(tier.price)}
                >
                  {isRecommended && (
                    <Badge className="absolute -top-2 right-2 text-[10px] bg-primary text-primary-foreground">
                      Recommended
                    </Badge>
                  )}
                  <div className="flex items-center gap-1.5 mb-2">
                    {tierIcon(tier.label)}
                    <span className="text-xs font-semibold">{tier.label}</span>
                  </div>
                  <p className="text-2xl font-bold">${tier.price.toFixed(2)}</p>
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Profit</span>
                      <span className="font-medium text-green-600">${calcProfit(tier.price).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Margin</span>
                      <span className="font-medium">{calcMargin(tier.price)}%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">AI est. margin</span>
                      <span className="font-medium">{tier.marginEstimate}%</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">{tier.reasoning}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    <strong>Target:</strong> {tier.targetAudience}
                  </p>
                </Card>
              );
            })}
          </div>

          {/* Recommendation */}
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
            <p className="text-xs font-semibold text-primary mb-0.5">
              Why {result.recommendedTier}?
            </p>
            <p className="text-xs text-muted-foreground">{result.recommendedReason}</p>
          </div>

          {/* Apply Button */}
          {selectedPrice !== null && onApplyPrice && (
            <Button
              size="sm"
              onClick={() => {
                onApplyPrice(selectedPrice.toFixed(2));
                toast.success(`Price set to $${selectedPrice.toFixed(2)}`);
              }}
              className="w-full gap-2"
            >
              <DollarSign className="h-3.5 w-3.5" />
              Apply ${selectedPrice.toFixed(2)} to Product
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
