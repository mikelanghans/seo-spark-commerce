import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { getScan, retryScan } from "@/integrations/seo-backend/client";
import type { SavedScan } from "@/integrations/seo-backend/types";
import { useNavigate } from "react-router-dom";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scanId: string | null;
  errorMessage?: string;
  pathname?: string;
  timestamp?: string;
}

export const ScanErrorDrawer = ({ open, onOpenChange, scanId, errorMessage, pathname, timestamp }: Props) => {
  const navigate = useNavigate();
  const [scan, setScan] = useState<SavedScan | null>(null);
  const [chain, setChain] = useState<SavedScan[]>([]);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(scanId);

  useEffect(() => { setActiveId(scanId); }, [scanId]);

  useEffect(() => {
    if (!open || !activeId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const cur = await getScan(activeId);
        if (cancelled) return;
        setScan(cur);
        // Walk back to find original, then walk forward to build the full chain
        // For simplicity: walk forward only (from this scan onwards)
        const result: SavedScan[] = [cur];
        let cursor: SavedScan | null = cur;
        const seen = new Set<string>([cur.id]);
        while (cursor?.retry_scan_id && !seen.has(cursor.retry_scan_id)) {
          try {
            const next = await getScan(cursor.retry_scan_id);
            if (cancelled) return;
            seen.add(next.id);
            result.push(next);
            cursor = next;
          } catch { break; }
        }
        if (!cancelled) setChain(result);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open, activeId]);

  const handleRetry = async () => {
    if (!activeId) return;
    setRetrying(true);
    try {
      const newId = await retryScan(activeId);
      setActiveId(newId);
    } catch (e) {
      console.error(e);
    } finally {
      setRetrying(false);
    }
  };

  const payload = {
    scanId: activeId,
    originalScanId: scanId,
    pathname,
    errorMessage,
    timestamp,
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Scan error details</SheetTitle>
        </SheetHeader>

        {loading && <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>}

        {scan && (
          <div className="mt-4 space-y-4 text-sm">
            <section className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground">Status</div>
              <div className="flex items-center gap-2">
                <Badge variant={scan.status === "error" ? "destructive" : "secondary"}>{scan.status}</Badge>
                <span>Phase: {scan.phase}</span>
              </div>
            </section>

            <section className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground">Root URL</div>
              <div className="break-all">{scan.root_url}</div>
              <div className="text-xs text-muted-foreground">Scope: {scan.scope} · {scan.pages_scanned} of {scan.pages_total} pages</div>
            </section>

            <section className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground">Timestamps</div>
              <div className="text-xs">Created: {new Date(scan.created_at).toLocaleString()}</div>
              <div className="text-xs">Updated: {new Date(scan.updated_at).toLocaleString()}</div>
            </section>

            {scan.error_message && (
              <section className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground">Saved error</div>
                <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{scan.error_message}</div>
              </section>
            )}

            <section className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">Retry timeline</div>
              <ol className="space-y-2">
                {chain.map((c, idx) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${
                      c.status === "complete" ? "bg-green-500" :
                      c.status === "error" ? "bg-destructive" :
                      c.status === "running" ? "bg-primary" : "bg-muted-foreground"
                    }`} />
                    <button onClick={() => navigate(`/seo/scan/${c.id}`)} className="flex-1 text-left text-xs underline-offset-2 hover:underline">
                      {idx === 0 ? "Original scan" : `Retry #${idx}`} — {c.status}
                    </button>
                    {c.id === activeId && <Badge variant="outline">Current</Badge>}
                  </li>
                ))}
              </ol>
            </section>

            <Button onClick={handleRetry} disabled={retrying} className="w-full gap-2">
              {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Retry scan
            </Button>

            <section className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground">Request payload</div>
              <pre className="overflow-auto rounded-md bg-muted p-2 text-[11px]">{JSON.stringify(payload, null, 2)}</pre>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
