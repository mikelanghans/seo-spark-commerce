import { useState } from "react";
import type { ScanReport as ScanReportType, ScanReportPage } from "@/integrations/seo-backend/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wrench, Link2 } from "lucide-react";
import { FixIssueSheet } from "./FixIssueSheet";

const sevColor: Record<string, string> = {
  error: "destructive",
  warning: "default",
  info: "secondary",
};

export const ScanReport = ({ report }: { report: ScanReportType }) => {
  const [fixPage, setFixPage] = useState<ScanReportPage | null>(null);

  const matchedCount = report.pages.filter((p) => p.productMatch?.listingId).length;

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
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant="destructive">{report.issueCounts.error} errors</Badge>
          <Badge>{report.issueCounts.warning} warnings</Badge>
          <Badge variant="secondary">{report.issueCounts.info} info</Badge>
          {matchedCount > 0 && (
            <Badge variant="outline" className="ml-auto gap-1">
              <Link2 className="h-3 w-3" /> {matchedCount} of {report.pages.length} pages linked to your products
            </Badge>
          )}
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
          {report.pages.map((p) => {
            const matched = !!p.productMatch?.listingId;
            const fixable = matched && p.issues.some((i) => i.severity !== "info" || i.field);
            return (
              <details key={p.url} className="rounded-lg border border-border bg-background p-3">
                <summary className="cursor-pointer">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{p.title || "(no title)"}</span>
                        {matched && <Badge variant="outline" className="gap-1 text-[10px]"><Link2 className="h-3 w-3" /> linked</Badge>}
                      </div>
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
                <div className="mt-3 space-y-3 text-xs">
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
                  {p.issues.length > 0 && (
                    <div className="flex justify-end pt-1">
                      <Button
                        size="sm"
                        variant={fixable ? "default" : "outline"}
                        onClick={() => setFixPage(p)}
                        title={matched ? "Open the linked listing to review and fix" : "This page isn't linked to a Brand Aura listing"}
                      >
                        <Wrench className="mr-2 h-3 w-3" />
                        {matched ? "Fix issues" : "View"}
                      </Button>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </div>

      <FixIssueSheet open={!!fixPage} onOpenChange={(o) => !o && setFixPage(null)} page={fixPage} />
    </div>
  );
};
