import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, AlertCircle, Plus, Link as LinkIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
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
  const [singleUrl, setSingleUrl] = useState("");

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

  const handleExtend = async (url?: string) => {
    if (!id) return;
    setExtending(true);
    try {
      await extendScan(id, url);
      if (url) setSingleUrl("");
      toast({ title: "Scanning more pages", description: "Discovering and grading additional URLs…" });
      // Poll until the scan returns to a complete/error state
      const poll = async () => {
        try {
          const s = await getScan(id);
          setScan(s);
          if (s.status === "running" || s.status === "pending") {
            window.setTimeout(poll, 2000);
          } else {
            setExtending(false);
            if (s.status === "complete") {
              toast({ title: "Scan extended", description: `Now covers ${s.report?.pages.length ?? s.pages_scanned} pages.` });
            } else if (s.status === "error") {
              toast({ title: "Extend failed", description: s.error_message || "Unknown error", variant: "destructive" });
            }
          }
        } catch (e) {
          setExtending(false);
          toast({ title: "Extend failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
        }
      };
      poll();
    } catch (e) {
      setExtending(false);
      toast({ title: "Extend failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  };

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

              {scan.status === "complete" && scan.report && (
                <>
                  <ScanReport report={scan.report} />
                  <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm text-muted-foreground">
                        Discover and grade additional pages from this site (up to 25 more per run).
                      </div>
                      <Button onClick={() => handleExtend()} disabled={extending}>
                        {extending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                        {extending ? "Scanning…" : "Scan more pages"}
                      </Button>
                    </div>
                    <div className="border-t border-border pt-3">
                      <div className="mb-2 text-sm text-muted-foreground">
                        Or scan one specific URL on this site:
                      </div>
                      <form
                        className="flex flex-wrap items-center gap-2"
                        onSubmit={(e) => { e.preventDefault(); if (singleUrl.trim()) handleExtend(singleUrl.trim()); }}
                      >
                        <div className="relative flex-1 min-w-[240px]">
                          <LinkIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            type="url"
                            placeholder={scan.root_url ? `${scan.root_url.replace(/\/$/, "")}/some-page` : "https://example.com/page"}
                            value={singleUrl}
                            onChange={(e) => setSingleUrl(e.target.value)}
                            disabled={extending}
                            className="pl-8"
                          />
                        </div>
                        <Button type="submit" variant="outline" disabled={extending || !singleUrl.trim()}>
                          {extending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                          Scan this URL
                        </Button>
                      </form>
                    </div>
                  </div>
                </>
              )}
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
