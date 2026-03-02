import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export interface BusinessContext {
  name: string;
  niche: string;
  tone: string;
  audience: string;
}

interface Props {
  onSubmit: (data: BusinessContext) => void;
  initial: BusinessContext | null;
}

export const BusinessContextForm = ({ onSubmit, initial }: Props) => {
  const [form, setForm] = useState<BusinessContext>(
    initial ?? { name: "", niche: "", tone: "", audience: "" }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Tell us about your business</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This context helps us tailor the tone and keywords of your listings.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Business Name</Label>
          <Input
            id="name"
            placeholder="e.g. Wildberry Crafts"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="niche">Niche / Industry</Label>
          <Input
            id="niche"
            placeholder="e.g. Handmade candles, Tech accessories"
            value={form.niche}
            onChange={(e) => setForm({ ...form, niche: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tone">Brand Tone</Label>
          <Input
            id="tone"
            placeholder="e.g. Warm & friendly, Professional, Quirky"
            value={form.tone}
            onChange={(e) => setForm({ ...form, tone: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="audience">Target Audience</Label>
          <Input
            id="audience"
            placeholder="e.g. Young professionals, Gift shoppers"
            value={form.audience}
            onChange={(e) => setForm({ ...form, audience: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" className="gap-2">
          Next: Product Details
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
};
