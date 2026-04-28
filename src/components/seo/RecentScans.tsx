import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listScans } from "@/integrations/seo-backend/client";
import type { SavedScan } from "@/integrations/seo-backend/types";
import { ScanStatusIcon } from "./ScanProgress";
import { Button } from "@/components/ui/button";

export const RecentScans = ({ organizationId }: { organizationId: string }) => {
  const navigate = useNavigate();
  const [scans, setScans] = useState<SavedScan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const load = async () => {
      try {
        const data = await listScans(organizationId, 20);
        if (!cancelled) setScans(data);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const tick = async () => {
      await load();
      // Re-poll if any scan is active
      const active = (await listScans(organizationId, 20).catch(() => [])).some(
        (s) => s.status === "pending" || s.status === "running",
      );
      if (cancelled) return;
      timer = window.setTimeout(tick, active ? 2000 : 10000);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [organizationId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading recent scans…</p>;
  if (scans.length === 0) return <p className="text-sm text-muted-foreground">No scans yet. Start your first audit above.</p>;

  return (
    <div className="space-y-2">
      {scans.map((s) => (
        <button
          key={s.id}
          onClick={() => navigate(`/seo/scan/${s.id}`)}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition hover:bg-accent"
        >
          <div className="flex min-w-0 items-center gap-3">
            <ScanStatusIcon status={s.status} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{s.root_url}</div>
              <div className="text-xs text-muted-foreground">
                {s.scope} · {s.status === "running" ? `${s.pages_scanned} of ${s.pages_total} pages` : new Date(s.created_at).toLocaleString()}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm">View</Button>
        </button>
      ))}
    </div>
  );
};
