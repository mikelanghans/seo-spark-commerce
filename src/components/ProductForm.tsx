import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles } from "lucide-react";

export interface ProductInfo {
  title: string;
  description: string;
  keywords: string;
  category: string;
  price: string;
  features: string;
}

interface Props {
  onSubmit: (data: ProductInfo) => void;
  onBack: () => void;
  initial: ProductInfo | null;
}

export const ProductForm = ({ onSubmit, onBack, initial }: Props) => {
  const [form, setForm] = useState<ProductInfo>(
    initial ?? { title: "", description: "", keywords: "", category: "", price: "", features: "" }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Product Information</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Provide details about the product you want to list.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Product Title</Label>
          <Input
            id="title"
            placeholder="e.g. Lavender Soy Candle 8oz"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            placeholder="e.g. Home & Garden > Candles"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Product Description</Label>
          <Textarea
            id="description"
            placeholder="Describe your product in detail — materials, size, use cases…"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={4}
            required
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="features">Key Features (one per line)</Label>
          <Textarea
            id="features"
            placeholder={"Hand-poured with 100% soy wax\n8oz jar, 50+ hour burn time\nNatural lavender essential oil"}
            value={form.features}
            onChange={(e) => setForm({ ...form, features: e.target.value })}
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="keywords">Keywords (comma separated)</Label>
          <Input
            id="keywords"
            placeholder="e.g. soy candle, lavender, handmade, gift"
            value={form.keywords}
            onChange={(e) => setForm({ ...form, keywords: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="price">Price</Label>
          <Input
            id="price"
            placeholder="e.g. $24.99"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
          />
        </div>
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button type="submit" className="gap-2">
          <Sparkles className="h-4 w-4" />
          Generate Listings
        </Button>
      </div>
    </form>
  );
};
