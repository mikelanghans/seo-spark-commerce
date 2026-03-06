import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Upload, ImageIcon, FileSpreadsheet, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ProductData {
  title: string;
  description: string;
  keywords: string;
  category: string;
  price: string;
  features: string;
  image_url?: string | null;
}

interface Props {
  organizationId: string;
  userId: string;
  onComplete: () => void;
  onBack: () => void;
}

interface UploadResult {
  name: string;
  status: "success" | "error";
  message?: string;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z_]/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || "";
    });
    return row;
  });
}

function mapCSVRow(row: Record<string, string>): ProductData {
  return {
    title: row.title || row.name || row.product_title || row.product_name || "",
    description: row.description || row.product_description || "",
    keywords: row.keywords || row.tags || row.seo_keywords || "",
    category: row.category || row.product_category || "",
    price: row.price || row.product_price || "",
    features: row.features || row.key_features || "",
  };
}

export const BulkUpload = ({ organizationId, userId, onComplete, onBack }: Props) => {
  const [tab, setTab] = useState("images");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<UploadResult[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  const handleMultiImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      toast.error("No image files selected");
      return;
    }

    setUploading(true);
    setTotal(imageFiles.length);
    setProgress(0);
    setResults([]);

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      try {
        const base64 = await fileToBase64(file);

        // Analyze with AI
        const { data, error } = await supabase.functions.invoke("analyze-product", {
          body: { imageBase64: base64 },
        });
        if (error) throw error;
        if (data.error) throw new Error(data.error);

        // Upload image to storage
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("product-images").upload(path, file);
        let imageUrl: string | null = null;
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
          imageUrl = urlData.publicUrl;
        }

        // Save product
        const { error: insertError } = await supabase.from("products").insert({
          title: data.title || file.name,
          description: data.description || "",
          features: (data.features || []).join("\n"),
          category: data.category || "",
          keywords: (data.keywords || []).join(", "),
          price: data.suggestedPrice || "",
          image_url: imageUrl,
          organization_id: organizationId,
          user_id: userId,
        });
        if (insertError) throw insertError;

        setResults((prev) => [...prev, { name: file.name, status: "success" }]);
      } catch (err: any) {
        setResults((prev) => [...prev, { name: file.name, status: "error", message: err.message }]);
      }
      setProgress(i + 1);
    }

    setUploading(false);
    toast.success(`Processed ${imageFiles.length} images`);
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setResults([]);

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      if (rows.length === 0) {
        toast.error("No data rows found in CSV");
        setUploading(false);
        return;
      }

      setTotal(rows.length);
      setProgress(0);

      for (let i = 0; i < rows.length; i++) {
        const product = mapCSVRow(rows[i]);
        const label = product.title || `Row ${i + 2}`;

        if (!product.title) {
          setResults((prev) => [...prev, { name: label, status: "error", message: "Missing title" }]);
          setProgress(i + 1);
          continue;
        }

        try {
          const { error } = await supabase.from("products").insert({
            ...product,
            organization_id: organizationId,
            user_id: userId,
          });
          if (error) throw error;
          setResults((prev) => [...prev, { name: label, status: "success" }]);
        } catch (err: any) {
          setResults((prev) => [...prev, { name: label, status: "error", message: err.message }]);
        }
        setProgress(i + 1);
      }

      toast.success(`Processed ${rows.length} products from CSV`);
    } catch (err: any) {
      toast.error("Failed to parse CSV: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const isDone = !uploading && results.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold">Bulk Upload</h2>
          <p className="text-sm text-muted-foreground">
            Import multiple products at once via images or CSV
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start gap-1 bg-secondary/50 p-1">
          <TabsTrigger value="images" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <ImageIcon className="h-4 w-4" /> Multiple Images
          </TabsTrigger>
          <TabsTrigger value="csv" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <FileSpreadsheet className="h-4 w-4" /> CSV File
          </TabsTrigger>
        </TabsList>

        <TabsContent value="images" className="mt-6">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleMultiImageUpload}
            className="hidden"
            disabled={uploading}
          />
          {!uploading && results.length === 0 && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-card/50 py-16 transition-colors hover:border-primary/50 hover:bg-card"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
                <ImageIcon className="h-7 w-7 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  Select multiple product images
                </p>
                <p className="text-xs text-muted-foreground">
                  AI will analyze each image and create a product automatically
                </p>
              </div>
            </button>
          )}
        </TabsContent>

        <TabsContent value="csv" className="mt-6">
          <input
            ref={csvRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleCSVUpload}
            className="hidden"
            disabled={uploading}
          />
          {!uploading && results.length === 0 && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => csvRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-card/50 py-16 transition-colors hover:border-primary/50 hover:bg-card"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
                  <Upload className="h-7 w-7 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    Upload a CSV file
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Columns: title, description, category, price, keywords, features
                  </p>
                </div>
              </button>
              <div className="rounded-lg bg-secondary/50 p-4">
                <p className="mb-2 text-xs font-medium text-foreground">Expected CSV format:</p>
                <code className="block whitespace-pre-wrap text-xs text-muted-foreground">
                  title,description,category,price,keywords,features{"\n"}
                  Lavender Candle,Hand-poured soy candle...,Home &gt; Candles,$24.99,"candle,lavender",100% soy wax
                </code>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Progress */}
      {(uploading || results.length > 0) && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {uploading ? "Processing…" : "Complete"}
              </span>
              <span className="font-medium">
                {progress} / {total}
              </span>
            </div>
            <Progress value={(progress / Math.max(total, 1)) * 100} className="h-2" />
          </div>

          {isDone && (
            <div className="flex items-center gap-4 rounded-lg bg-secondary/50 p-4">
              {errorCount === 0 ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-500" />
              )}
              <p className="text-sm">
                <span className="font-medium">{successCount} products</span> imported successfully
                {errorCount > 0 && (
                  <span className="text-muted-foreground"> • {errorCount} failed</span>
                )}
              </p>
            </div>
          )}

          <div className="max-h-60 space-y-1 overflow-y-auto">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm">
                {r.status === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                )}
                <span className="truncate">{r.name}</span>
                {r.message && (
                  <span className="ml-auto truncate text-xs text-muted-foreground">{r.message}</span>
                )}
              </div>
            ))}
          </div>

          {isDone && (
            <div className="flex justify-end">
              <Button onClick={onComplete} className="gap-2">
                <CheckCircle2 className="h-4 w-4" /> Done
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
