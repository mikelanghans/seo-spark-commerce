import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Link2, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LocalProduct {
  id: string;
  title: string;
  printify_product_id: string | null;
}

interface PrintifyProduct {
  id: string;
  title: string;
  shopId: number;
}

interface Match {
  localProduct: LocalProduct;
  printifyProduct: PrintifyProduct;
  selected: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  products: LocalProduct[];
  onMatched: () => void;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Score how well two normalized titles match (0 = no match, higher = better) */
function titleSimilarity(a: string, b: string): number {
  if (a === b) return 100;
  // One contains the other
  if (a.includes(b) || b.includes(a)) {
    const longer = Math.max(a.length, b.length);
    const shorter = Math.min(a.length, b.length);
    return 60 + Math.round((shorter / longer) * 40);
  }
  // Word overlap
  const wordsA = new Set(a.split(" ").filter(Boolean));
  const wordsB = new Set(b.split(" ").filter(Boolean));
  const overlap = [...wordsA].filter((w) => wordsB.has(w)).length;
  const total = Math.max(wordsA.size, wordsB.size);
  if (total === 0) return 0;
  const score = Math.round((overlap / total) * 80);
  return score >= 40 ? score : 0; // Threshold: at least 50% word overlap
}

export const PrintifyMatchDialog = ({ open, onOpenChange, organizationId, products, onMatched }: Props) => {
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const fetchAndMatch = async () => {
    setLoading(true);
    setMatches([]);
    setDone(false);
    try {
      const { data, error } = await supabase.functions.invoke("printify-list-products", {
        body: { organizationId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const printifyProducts: PrintifyProduct[] = data.products || [];
      const unlinked = products.filter((p) => !p.printify_product_id);

      // Build matches using fuzzy title matching
      const usedPrintifyIds = new Set<string>();
      const foundMatches: Match[] = [];

      for (const lp of unlinked) {
        const normLocal = normalizeTitle(lp.title);
        let bestMatch: PrintifyProduct | null = null;
        let bestScore = 0;

        for (const pp of printifyProducts) {
          if (usedPrintifyIds.has(pp.id)) continue;
          const score = titleSimilarity(normLocal, normalizeTitle(pp.title));
          if (score > bestScore) {
            bestScore = score;
            bestMatch = pp;
          }
        }

        if (bestMatch && bestScore >= 40) {
          usedPrintifyIds.add(bestMatch.id);
          foundMatches.push({
            localProduct: lp,
            printifyProduct: bestMatch,
            selected: bestScore >= 80, // Auto-select high-confidence matches
          });
        }
      }

      setMatches(foundMatches);
      if (foundMatches.length === 0) {
        toast.info("No matching Printify products found by title");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch Printify products");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const selected = matches.filter((m) => m.selected);
    if (selected.length === 0) {
      toast.error("No matches selected");
      return;
    }
    setSaving(true);
    try {
      let linked = 0;
      for (const match of selected) {
        const { error } = await supabase
          .from("products")
          .update({ printify_product_id: match.printifyProduct.id })
          .eq("id", match.localProduct.id);
        if (!error) linked++;
      }
      toast.success(`Linked ${linked} product${linked !== 1 ? "s" : ""} to Printify!`);
      setDone(true);
      onMatched();
    } catch (err: any) {
      toast.error(err.message || "Failed to save matches");
    } finally {
      setSaving(false);
    }
  };

  const toggleMatch = (index: number) => {
    setMatches((prev) =>
      prev.map((m, i) => (i === index ? { ...m, selected: !m.selected } : m))
    );
  };

  const allSelected = matches.length > 0 && matches.every((m) => m.selected);
  const toggleAll = () => {
    const newVal = !allSelected;
    setMatches((prev) => prev.map((m) => ({ ...m, selected: newVal })));
  };

  const selectedCount = matches.filter((m) => m.selected).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Link Printify Products
          </DialogTitle>
          <DialogDescription>
            Match your imported products to existing Printify products by title so you can update them instead of creating duplicates.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {matches.length === 0 && !loading && !done && (
            <Button onClick={fetchAndMatch} disabled={loading} className="w-full gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Scan Printify for matches
            </Button>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Fetching Printify products…</span>
            </div>
          )}

          {matches.length > 0 && !done && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {matches.length} match{matches.length !== 1 ? "es" : ""} found
                </p>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs text-primary hover:underline"
                >
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
              </div>

              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {matches.map((match, i) => (
                  <label
                    key={match.localProduct.id}
                    className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                  >
                    <Checkbox
                      checked={match.selected}
                      onCheckedChange={() => toggleMatch(i)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-medium truncate">{match.localProduct.title}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Link2 className="h-3 w-3" />
                        Printify: {match.printifyProduct.title}
                      </p>
                    </div>
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  </label>
                ))}
              </div>

              <Button
                onClick={handleSave}
                disabled={saving || selectedCount === 0}
                className="w-full gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Linking…
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4" />
                    Link {selectedCount} product{selectedCount !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            </>
          )}

          {done && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-primary" />
              <p className="font-medium">Products linked!</p>
              <p className="text-sm text-muted-foreground">
                You can now update these products on Printify instead of creating new ones.
              </p>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          )}

          {matches.length === 0 && !loading && !done && (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
              Products are matched by exact title. Make sure titles match between your app and Printify.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
