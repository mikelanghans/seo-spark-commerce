import { CheckCircle2, Loader2, AlertCircle, Clock } from "lucide-react";
import type { SavedScan } from "@/integrations/seo-backend/types";

export const ScanStatusIcon = ({ status }: { status: SavedScan["status"] }) => {
  if (status === "complete") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === "error") return <AlertCircle className="h-4 w-4 text-destructive" />;
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  return <Clock className="h-4 w-4 text-muted-foreground" />;
};

export const ScanProgress = ({ scan }: { scan: SavedScan }) => {
  const pct = scan.pages_total > 0 ? Math.min(100, Math.round((scan.pages_scanned / scan.pages_total) * 100)) : 0;
  const phaseLabel = {
    queued: "Queued",
    mapping: "Discovering URLs",
    scanning: `Scanning pages (${scan.pages_scanned} of ${scan.pages_total})`,
    grading: "Grading SEO",
    complete: "Complete",
    error: "Error",
  }[scan.phase];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <ScanStatusIcon status={scan.status} />
        <span className="font-medium">{phaseLabel}</span>
        {scan.discovered_url_count > 0 && scan.phase !== "queued" && (
          <span className="text-muted-foreground">· {scan.discovered_url_count} URLs discovered</span>
        )}
      </div>
      {scan.status === "running" && (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${scan.phase === "mapping" ? 5 : scan.phase === "grading" ? 95 : pct}%` }}
          />
        </div>
      )}
    </div>
  );
};
