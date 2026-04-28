import { useMemo, useState } from "react";
import type {
  ScanReport as ScanReportType,
  ScanReportPage,
  GroupedIssue,
  ScanCategory,
} from "@/integrations/seo-backend/types";
import { CATEGORY_LABELS } from "@/integrations/seo-backend/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertCircle, AlertTriangle, Info, Wrench, Link2, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { FixIssueSheet } from "./FixIssueSheet";

const asUrlString = (u: unknown): string => {
  if (typeof u === "string") return u;
  if (u && typeof u === "object" && typeof (u as any).url === "string") return (u as any).url;
  return "";
};

const gradeForScore = (s: number): { letter: string; tone: "success" | "warn" | "bad" } => {
  if (s >= 90) return { letter: "A", tone: "success" };
  if (s >= 80) return { letter: "B", tone: "success" };
  if (s >= 70) return { letter: "C", tone: "warn" };
  if (s >= 60) return { letter: "D", tone: "warn" };
  return { letter: "F", tone: "bad" };
};

const toneClass = (tone: "success" | "warn" | "bad") =>
  tone === "success"
    ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
    : tone === "warn"
      ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
      : "bg-destructive/15 text-destructive border-destructive/30";

const barColor = (s: number) =>
  s >= 80 ? "bg-emerald-500" : s >= 60 ? "bg-amber-500" : "bg-destructive";

const SeverityIcon = ({ s }: { s: "error" | "warning" | "info" }) =>
  s === "error" ? (
    <AlertCircle className="h-4 w-4 text-destructive" />
  ) : s === "warning" ? (
    <AlertTriangle className="h-4 w-4 text-amber-500" />
  ) : (
    <Info className="h-4 w-4 text-muted-foreground" />
  );

const CategoryBar = ({ label, score, issuesTotal }: { label: string; score: number; issuesTotal: number }) => (
  <div className="space-y-1.5">
    <div className="flex items-baseline justify-between gap-3">
      <div>
        <span className="text-sm font-semibold">{label}</span>
        <span className="ml-2 text-xs text-muted-foreground">
          {issuesTotal} issue{issuesTotal === 1 ? "" : "s"}
        </span>
      </div>
      <span className={`text-sm font-bold ${score >= 80 ? "text-emerald-500" : score >= 60 ? "text-amber-500" : "text-destructive"}`}>
        {score}
      </span>
    </div>
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full ${barColor(score)} transition-all`} style={{ width: `${Math.max(2, score)}%` }} />
    </div>
  </div>
);

const PageQuickStats = ({ p }: { p: ScanReportPage }) => (
  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
    <span><span className="font-medium text-foreground">Title:</span> {p.title ? `${p.title.length} chars` : "missing"}</span>
    <span><span className="font-medium text-foreground">Meta:</span> {p.description ? `${p.description.length} chars` : "missing"}</span>
    <span><span className="font-medium text-foreground">H1s:</span> {p.headingCounts?.h1 ?? p.h1?.length ?? 0}</span>
    <span><span className="font-medium text-foreground">Schema:</span> {p.jsonLdTypes?.length ?? 0}</span>
    <span><span className="font-medium text-foreground">Images missing alt:</span> {p.imagesMissingAlt}/{p.imagesTotal ?? 0}</span>
  </div>
);

export const ScanReport = ({ report }: { report: ScanReportType }) => {
  const [fixPage, setFixPage] = useState<ScanReportPage | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedPages, setExpandedPages] = useState<Record<string, boolean>>({});
  const [pageSort, setPageSort] = useState<"score" | "url" | "issues">("score");
  const [issueTab, setIssueTab] = useState<"all" | "error" | "warning" | "info">("all");

  const categoryScores = report.categoryScores;
  const grouped = report.groupedIssues || [];
  const matchedCount = report.pages.filter((p) => p.productMatch?.listingId).length;

  // Compute per-category issue totals across the grouped list
  const categoryIssueTotals = useMemo(() => {
    const totals: Record<ScanCategory, number> = { onPage: 0, structuredData: 0, aeo: 0, performance: 0 };
    for (const g of grouped) {
      totals[g.category] = (totals[g.category] || 0) + g.pages.length;
    }
    return totals;
  }, [grouped]);

  const filteredGrouped = useMemo(() => {
    if (issueTab === "all") return grouped;
    return grouped.filter((g) => g.severity === issueTab);
  }, [grouped, issueTab]);

  const sortedPages = useMemo(() => {
    const arr = [...report.pages];
    if (pageSort === "score") arr.sort((a, b) => a.score - b.score); // worst first
    else if (pageSort === "issues") arr.sort((a, b) => b.issues.length - a.issues.length);
    else arr.sort((a, b) => asUrlString(a.url).localeCompare(asUrlString(b.url)));
    return arr;
  }, [report.pages, pageSort]);

  const overallGrade = gradeForScore(report.overallScore);

  return (
    <div className="space-y-6">
      {/* Site audit header */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Site Audit
        </div>
        <div className="mt-2 flex items-center gap-2">
          <a
            href={report.rootUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-2xl font-bold hover:underline break-all"
          >
            {report.rootUrl}
          </a>
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          Scanned <span className="font-semibold text-foreground">{report.pages.length}</span> page
          {report.pages.length === 1 ? "" : "s"}
          {matchedCount > 0 && (
            <span className="ml-2 inline-flex items-center gap-1">
              · <Link2 className="h-3 w-3" />
              <span className="font-semibold text-foreground">{matchedCount}</span> linked to your products
            </span>
          )}
        </div>
      </div>

      {/* Score + category breakdown */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="grid gap-6 md:grid-cols-[200px_1fr] md:items-center">
          {/* Score ring */}
          <div className="flex flex-col items-center gap-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              SEO + AEO Grade
            </div>
            <div className={`flex h-12 w-12 items-center justify-center rounded-lg border text-2xl font-black ${toneClass(overallGrade.tone)}`}>
              {overallGrade.letter}
            </div>
            <div className="relative mt-1 flex h-32 w-32 items-center justify-center">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" className="fill-none stroke-muted" strokeWidth="8" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  className={`fill-none ${
                    report.overallScore >= 80
                      ? "stroke-emerald-500"
                      : report.overallScore >= 60
                        ? "stroke-amber-500"
                        : "stroke-destructive"
                  }`}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${(report.overallScore / 100) * 264} 264`}
                />
              </svg>
              <div className="absolute text-center">
                <div className="text-3xl font-black">{report.overallScore}</div>
                <div className="text-[10px] text-muted-foreground">/ 100</div>
              </div>
            </div>
          </div>

          {/* Category bars */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">
                {report.overallScore >= 80
                  ? "Healthy — minor optimizations available."
                  : report.overallScore >= 60
                    ? "Needs work — several SEO/AEO issues to address."
                    : "Critical — major SEO/AEO issues across the site."}
              </h3>
            </div>
            <CategoryBar
              label={CATEGORY_LABELS.onPage}
              score={categoryScores?.onPage ?? 0}
              issuesTotal={categoryIssueTotals.onPage}
            />
            <CategoryBar
              label={CATEGORY_LABELS.structuredData}
              score={categoryScores?.structuredData ?? 0}
              issuesTotal={categoryIssueTotals.structuredData}
            />
            <CategoryBar
              label={CATEGORY_LABELS.aeo}
              score={categoryScores?.aeo ?? 0}
              issuesTotal={categoryIssueTotals.aeo}
            />
          </div>
        </div>
      </div>

      {/* Summary + recommendations */}
      {(report.summary || report.topRecommendations?.length > 0) && (
        <div className="rounded-xl border border-border bg-card p-6">
          {report.summary && (
            <>
              <h3 className="mb-2 text-lg font-semibold">Summary</h3>
              <p className="text-sm text-muted-foreground">{report.summary}</p>
            </>
          )}
          {report.topRecommendations?.length > 0 && (
            <>
              <h4 className="mt-4 mb-2 text-sm font-semibold">Top Recommendations</h4>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                {report.topRecommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}

      {/* Grouped issues — fix once, improve every page */}
      {grouped.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Issues across the site</h3>
              <p className="text-sm text-muted-foreground">
                Same issues grouped — fix once, improve every affected page.
              </p>
            </div>
            <Tabs value={issueTab} onValueChange={(v) => setIssueTab(v as any)}>
              <TabsList>
                <TabsTrigger value="all">All <Badge variant="secondary" className="ml-1.5">{grouped.length}</Badge></TabsTrigger>
                <TabsTrigger value="error">
                  Critical <Badge variant="destructive" className="ml-1.5">{grouped.filter((g) => g.severity === "error").length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="warning">
                  Warnings <Badge className="ml-1.5">{grouped.filter((g) => g.severity === "warning").length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="info">
                  Info <Badge variant="secondary" className="ml-1.5">{grouped.filter((g) => g.severity === "info").length}</Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-2">
            {filteredGrouped.map((g: GroupedIssue) => {
              const open = expandedGroups[g.code];
              return (
                <div key={g.code} className="rounded-lg border border-border bg-background">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted/40"
                    onClick={() => setExpandedGroups((s) => ({ ...s, [g.code]: !open }))}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <SeverityIcon s={g.severity} />
                      <span className="text-sm font-medium truncate">{g.message}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="text-xs">
                        {g.pages.length} page{g.pages.length === 1 ? "" : "s"}
                      </Badge>
                      {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>
                  {open && (
                    <ul className="border-t border-border px-3 py-2 text-xs">
                      {g.pages.slice(0, 25).map((pg, i) => {
                        const url = asUrlString(pg.url);
                        return (
                          <li key={i} className="flex items-center justify-between gap-2 py-1">
                            <span className="truncate">{pg.title || url}</span>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </li>
                        );
                      })}
                      {g.pages.length > 25 && (
                        <li className="pt-1 text-muted-foreground">+ {g.pages.length - 25} more</li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-page results */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Per-page results ({report.pages.length})</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sort by</span>
            <Button size="sm" variant={pageSort === "score" ? "default" : "outline"} onClick={() => setPageSort("score")}>
              Lowest score
            </Button>
            <Button size="sm" variant={pageSort === "url" ? "default" : "outline"} onClick={() => setPageSort("url")}>
              URL
            </Button>
            <Button size="sm" variant={pageSort === "issues" ? "default" : "outline"} onClick={() => setPageSort("issues")}>
              Most issues
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {sortedPages.map((p, idx) => {
            const url = asUrlString(p.url);
            const matched = !!p.productMatch?.listingId;
            const grade = gradeForScore(p.score);
            const isOpen = expandedPages[url || String(idx)];
            const path = (() => {
              try { return new URL(url).pathname; } catch { return url; }
            })();
            return (
              <div key={url || idx} className="rounded-lg border border-border bg-background">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40"
                  onClick={() => setExpandedPages((s) => ({ ...s, [url || String(idx)]: !isOpen }))}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-lg font-black ${toneClass(grade.tone)}`}>
                    {grade.letter}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{p.title || path || "(no title)"}</span>
                      {matched && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Link2 className="h-3 w-3" /> linked
                        </Badge>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{path}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold text-muted-foreground">{p.score}/100</span>
                    <Badge variant={p.issues.some((i) => i.severity === "error") ? "destructive" : "secondary"}>
                      {p.issues.length} issue{p.issues.length === 1 ? "" : "s"}
                    </Badge>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="space-y-3 border-t border-border p-4">
                    <PageQuickStats p={p} />
                    {p.issues.length > 0 && (
                      <ul className="space-y-2">
                        {p.issues.map((i, idx2) => (
                          <li key={idx2} className="flex items-start gap-2 text-sm">
                            <SeverityIcon s={i.severity} />
                            <div>
                              <div className="font-medium">{i.message}</div>
                              {i.field && (
                                <div className="text-xs text-muted-foreground">field: {i.field}</div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Open page <ExternalLink className="h-3 w-3" />
                      </a>
                      {p.issues.length > 0 && (
                        <Button
                          size="sm"
                          variant={matched ? "default" : "outline"}
                          onClick={() => setFixPage(p)}
                          title={matched ? "Open the linked listing to review and fix" : "This page isn't linked to a Brand Aura listing"}
                        >
                          <Wrench className="mr-2 h-3 w-3" />
                          {matched ? "Fix issues" : "View"}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <FixIssueSheet open={!!fixPage} onOpenChange={(o) => !o && setFixPage(null)} page={fixPage} />
    </div>
  );
};
