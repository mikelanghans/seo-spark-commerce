import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, AlertCircle, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { extendScan, getScan } from "@/integrations/seo-backend/client";
import type { SavedScan } from "@/integrations/seo-backend/types";
import { ScanProgress } from "@/components/seo/ScanProgress";
import { ScanReport } from "@/components/seo/ScanReport";
import { ScanErrorDrawer } from "@/components/seo/ScanErrorDrawer";
import { GlobalErrorBoundary } from "@/components/seo/GlobalErrorBoundary";
import { useToast } from "@/hooks/use-toast";

const SeoScan = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [scan, setScan] = useState<SavedScan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth"); return; }
    if (!id) return;
    let cancelled = false;
    let timer: number | null = null;

    const tick = async () => {
      try {
        const s = await getScan(id);
        if (cancelled) return;
        setScan(s);
        setLoadError(null);
        if (s.status === "pending" || s.status === "running") {
          timer = window.setTimeout(tick, 2000);
        }
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Failed to load scan");
      }
    };
    tick();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [id, user, authLoading, navigate]);

  if (authLoading || (!scan && !loadError)) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <GlobalErrorBoundary>
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/seo")}><ArrowLeft className="h-4 w-4" /></Button>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold">SEO Scan</h1>
              {scan && <p className="truncate text-sm text-muted-foreground">{scan.root_url}</p>}
            </div>
          </div>

          {loadError && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <AlertCircle className="h-4 w-4" /> {loadError}
              </div>
            </div>
          )}

          {scan && (
            <>
              <div className="rounded-xl border border-border bg-card p-6">
                <ScanProgress scan={scan} />
                {scan.status === "error" && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <p className="text-sm text-destructive">{scan.error_message}</p>
                    <Button size="sm" variant="outline" onClick={() => setDrawerOpen(true)}>View error details</Button>
                  </div>
                )}
              </div>

              {scan.status === "complete" && scan.report && <ScanReport report={scan.report} />}
            </>
          )}

          <ScanErrorDrawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            scanId={id || null}
            errorMessage={scan?.error_message || undefined}
            pathname={window.location.pathname}
            timestamp={new Date().toISOString()}
          />
        </div>
      </div>
    </GlobalErrorBoundary>
  );
};

export default SeoScan;
