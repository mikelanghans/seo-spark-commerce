import { useState, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Upload, CheckCircle2, XCircle, AlertTriangle, Trash2, Merge, ImageIcon, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/types/dashboard";

interface Props {
  products: Product[];
  organizationId: string;
  userId: string;
  onComplete: () => void;
  onBack: () => void;
}

interface MatchedFile {
  file: File;
  matchedProduct: Product | null;
  score: number;
  previewUrl: string;
}

// Simple fuzzy match: normalize both strings and compute overlap
function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.(png|jpg|jpeg|webp|svg)$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchScore(filename: string, productTitle: string): number {
  const a = normalizeTitle(filename);
  const b = normalizeTitle(productTitle);
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.9;
  const aWords = a.split(" ").filter(Boolean);
  const bWords = b.split(" ").filter(Boolean);
  const matches = aWords.filter((w) => bWords.some((bw) => bw.includes(w) || w.includes(bw)));
  if (aWords.length === 0) return 0;
  return matches.length / Math.max(aWords.length, bWords.length);
}

function findBestMatch(filename: string, products: Product[]): { product: Product | null; score: number } {
  let best: Product | null = null;
  let bestScore = 0;
  for (const p of products) {
    const s = matchScore(filename, p.title);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  return { product: bestScore >= 0.3 ? best : null, score: bestScore };
}

// Find duplicate products (same title)
function findDuplicates(products: Product[]): Map<string, Product[]> {
  const byTitle = new Map<string, Product[]>();
  for (const p of products) {
    const key = p.title.trim().toLowerCase();
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key)!.push(p);
  }
  const dupes = new Map<string, Product[]>();
  for (const [key, group] of byTitle) {
    if (group.length > 1) dupes.set(key, group);
  }
  return dupes;
}

export const DesignRematcher = ({ products, organizationId, userId, onComplete, onBack }: Props) => {
  const [tab, setTab] = useState<"rematch" | "duplicates">("rematch");
  const [matchedFiles, setMatchedFiles] = useState<MatchedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [searchOverride, setSearchOverride] = useState<Record<number, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const duplicates = useMemo(() => findDuplicates(products), [products]);

  // Handle file selection
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;

    const matched: MatchedFile[] = files.map((file) => {
      const { product, score } = findBestMatch(file.name, products);
      return {
        file,
        matchedProduct: product,
        score,
        previewUrl: URL.createObjectURL(file),
      };
    });

    setMatchedFiles(matched);
    setSearchOverride({});
  };

  // Manually reassign a file to a different product
  const reassignFile = (fileIndex: number, productId: string) => {
    const product = products.find((p) => p.id === productId) || null;
    setMatchedFiles((prev) =>
      prev.map((m, i) => (i === fileIndex ? { ...m, matchedProduct: product, score: product ? 1 : 0 } : m))
    );
  };

  // Remove a file from the list
  const removeFile = (index: number) => {
    setMatchedFiles((prev) => {
      const removed = prev[index];
      URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Apply all matched designs
  const applyMatches = async () => {
    const toApply = matchedFiles.filter((m) => m.matchedProduct);
    if (toApply.length === 0) {
      toast.error("No matched files to apply");
      return;
    }

    setUploading(true);
    setProgress(0);
    let success = 0;

    for (let i = 0; i < toApply.length; i++) {
      const { file, matchedProduct } = toApply[i];
      if (!matchedProduct) continue;

      try {
        // Upload to storage
        const ext = file.name.split(".").pop() || "png";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("product-images").upload(path, file);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
        const imageUrl = urlData.publicUrl;

        // Update product image_url
        const { error: updateError } = await supabase
          .from("products")
          .update({ image_url: imageUrl })
          .eq("id", matchedProduct.id);
        if (updateError) throw updateError;

        success++;
      } catch (err: any) {
        console.error(`Failed to update ${matchedProduct.title}:`, err);
      }
      setProgress(i + 1);
    }

    setUploading(false);
    toast.success(`Updated designs for ${success}/${toApply.length} products`);
    if (success > 0) onComplete();
  };

  // Delete a duplicate product
  const deleteDuplicate = async (productId: string) => {
    const { error } = await supabase.from("products").delete().eq("id", productId);
    if (error) {
      toast.error("Failed to delete: " + error.message);
    } else {
      toast.success("Deleted duplicate");
      onComplete();
    }
  };

  const matchedCount = matchedFiles.filter((m) => m.matchedProduct).length;
  const unmatchedCount = matchedFiles.length - matchedCount;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold">Design Organizer</h2>
          <p className="text-sm text-muted-foreground">Replace Shopify images with source designs & clean up duplicates</p>
        </div>
      </div>

      {/* Tab switch */}
      <div className="flex gap-2 border-b border-border pb-2">
        <button
          onClick={() => setTab("rematch")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === "rematch" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <ImageIcon className="h-4 w-4 inline mr-2" />
          Replace Designs ({products.length})
        </button>
        <button
          onClick={() => setTab("duplicates")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === "duplicates" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Merge className="h-4 w-4 inline mr-2" />
          Duplicates ({duplicates.size})
        </button>
      </div>

      {/* ───── REMATCH TAB ───── */}
      {tab === "rematch" && (
        <div className="space-y-4">
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFilesSelected} className="hidden" />

          {matchedFiles.length === 0 ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-card/50 py-16 transition-colors hover:border-primary/50 hover:bg-card"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
                <Upload className="h-7 w-7 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">Select your source design files</p>
                <p className="text-xs text-muted-foreground">
                  Filenames will be fuzzy-matched to product titles (e.g. "slowly-unfurling.png" → "slowly unfurling.")
                </p>
              </div>
            </button>
          ) : (
            <>
              {/* Summary */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-sm">
                  <span className="flex items-center gap-1 text-green-500">
                    <CheckCircle2 className="h-4 w-4" /> {matchedCount} matched
                  </span>
                  {unmatchedCount > 0 && (
                    <span className="flex items-center gap-1 text-yellow-500">
                      <AlertTriangle className="h-4 w-4" /> {unmatchedCount} unmatched
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    Add more files
                  </Button>
                  <Button size="sm" onClick={applyMatches} disabled={uploading || matchedCount === 0}>
                    {uploading ? `Applying… ${progress}/${matchedCount}` : `Apply ${matchedCount} matches`}
                  </Button>
                </div>
              </div>

              {uploading && <Progress value={(progress / matchedCount) * 100} className="h-2" />}

              {/* Match list */}
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {matchedFiles.map((m, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                      m.matchedProduct ? "border-border bg-card" : "border-yellow-500/30 bg-yellow-500/5"
                    }`}
                  >
                    {/* Preview */}
                    <img src={m.previewUrl} alt="" className="h-14 w-14 rounded-md object-cover border border-border shrink-0" />

                    {/* File info */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{m.file.name}</p>
                      {m.matchedProduct ? (
                        <p className="text-xs text-green-500 truncate">
                          → {m.matchedProduct.title}
                          <span className="text-muted-foreground ml-2">({Math.round(m.score * 100)}% match)</span>
                        </p>
                      ) : (
                        <p className="text-xs text-yellow-500">No match found</p>
                      )}
                    </div>

                    {/* Current product image */}
                    {m.matchedProduct?.image_url && (
                      <div className="hidden sm:flex flex-col items-center gap-1 shrink-0">
                        <span className="text-[10px] text-muted-foreground">Current</span>
                        <img src={m.matchedProduct.image_url} alt="" className="h-10 w-10 rounded object-cover border border-border opacity-50" />
                      </div>
                    )}

                    {/* Manual reassign */}
                    <div className="shrink-0 w-48">
                      <select
                        value={m.matchedProduct?.id || ""}
                        onChange={(e) => reassignFile(i, e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                      >
                        <option value="">— No match —</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <Button variant="ghost" size="icon" onClick={() => removeFile(i)} className="shrink-0">
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ───── DUPLICATES TAB ───── */}
      {tab === "duplicates" && (
        <div className="space-y-4">
          {duplicates.size === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
              <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
              <p className="text-sm text-muted-foreground">No duplicates found — your catalog is clean!</p>
            </div>
          ) : (
            Array.from(duplicates.entries()).map(([key, group]) => (
              <div key={key} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <h4 className="font-medium text-sm">"{group[0].title}" — {group.length} copies</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.map((product, idx) => (
                    <div key={product.id} className="flex items-center gap-3 rounded-lg border border-border p-3 bg-background">
                      {product.image_url ? (
                        <img src={product.image_url} alt="" className="h-16 w-16 rounded-md object-cover border border-border shrink-0" />
                      ) : (
                        <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center shrink-0">
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">
                          {product.shopify_product_id ? `Shopify #${product.shopify_product_id}` : "No Shopify ID"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{product.category || "No category"} • ${product.price || "0"}</p>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{product.id}</p>
                      </div>
                      {idx > 0 && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteDuplicate(product.id)}
                          className="shrink-0 gap-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </Button>
                      )}
                      {idx === 0 && (
                        <span className="text-xs text-green-500 font-medium shrink-0">Keep</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
