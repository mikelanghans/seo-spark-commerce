import type { ScanReport } from "@/integrations/seo-backend/types";
import { Badge } from "@/components/ui/badge";

const sevColor: Record<string, string> = {
  error: "destructive",
  warning: "default",
  info: "secondary",
};

export const ScanReport = ({ report }: { report: ScanReport }) => {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Overall SEO Score</h3>
            <p className="text-sm text-muted-foreground break-all">{report.rootUrl}</p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-primary">{report.overallScore}</div>
            <div className="text-xs text-muted-foreground">{report.pages.length} pages analyzed</div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Badge variant="destructive">{report.issueCounts.error} errors</Badge>
          <Badge>{report.issueCounts.warning} warnings</Badge>
          <Badge variant="secondary">{report.issueCounts.info} info</Badge>
        </div>
      </div>

      {report.summary && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-2 text-lg font-semibold">Summary</h3>
          <p className="text-sm text-muted-foreground">{report.summary}</p>
          {report.topRecommendations?.length > 0 && (
            <>
              <h4 className="mt-4 mb-2 text-sm font-semibold">Top Recommendations</h4>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                {report.topRecommendations.map((r, i) => <li key={i}>{r}</li>)}
              </ol>
            </>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="mb-4 text-lg font-semibold">Per-page breakdown</h3>
        <div className="space-y-3">
          {report.pages.map((p) => (
            <details key={p.url} className="rounded-lg border border-border bg-background p-3">
              <summary className="cursor-pointer">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.title || "(no title)"}</div>
                    <div className="truncate text-xs text-muted-foreground">{p.url}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{p.score}</span>
                    <Badge variant={p.issues.some((i) => i.severity === "error") ? "destructive" : "secondary"}>
                      {p.issues.length} issues
                    </Badge>
                  </div>
                </div>
              </summary>
              <div className="mt-3 space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                  <div>Status: {p.status}</div>
                  <div>Words: {p.wordCount}</div>
                  <div>Internal links: {p.internalLinks}</div>
                  <div>External links: {p.externalLinks}</div>
                </div>
                <ul className="space-y-1">
                  {p.issues.map((i, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Badge variant={sevColor[i.severity] as any}>{i.severity}</Badge>
                      <span>{i.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
};
