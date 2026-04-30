import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Music2, Loader2, CheckCircle2, AlertCircle, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { exportSingleProductToTikTok, type TikTokExportProduct } from "@/lib/tiktokExport";

interface Props {
  product: TikTokExportProduct;
  hasListings: boolean;
}

/**
 * Single-product TikTok export.
 *
 * TikTok Shop has no public listing API for new sellers, so "push" = generate
 * a category-specific .xlsx with the product's listing pre-filled, ready to
 * upload via Seller Center → Bulk Action → Add Products.
 */
export const PushToTikTok = ({ product, hasListings }: Props) => {
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setResult(null);
    try {
      await exportSingleProductToTikTok(product);
      setResult({ success: true });
      toast.success("TikTok Shop .xlsx downloaded — upload it in Seller Center → Bulk Action.", { duration: 6000 });
    } catch (e: any) {
      setResult({ success: false, error: e?.message });
      toast.error(e?.message || "Failed to generate TikTok export");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={exporting || !hasListings}
      className="gap-2"
      title={hasListings ? "Download .xlsx for TikTok Seller Center bulk upload" : "Generate listings first"}
    >
      {exporting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : result?.success ? (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      ) : result && !result.success ? (
        <AlertCircle className="h-4 w-4 text-destructive" />
      ) : (
        <Music2 className="h-4 w-4 text-pink-500" />
      )}
      <FileSpreadsheet className="h-3.5 w-3.5 -ml-1 opacity-60" />
      {result?.success ? "Downloaded" : "Push to TikTok"}
    </Button>
  );
};
