import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Users, Package, FileText, Zap, Image, Building2, ArrowLeft, TicketCheck, AlertTriangle, RefreshCw, DollarSign, Activity } from "lucide-react";
import { toast } from "sonner";

interface Metrics {
  totalUsers: number;
  totalOrgs: number;
  totalProducts: number;
  totalListings: number;
  totalAiUsage: number;
  aiUsage30d: number;
  totalImages: number;
  tickets: any[];
  recentProducts: any[];
}

interface ErrorLog {
  id: string;
  user_id: string;
  organization_id: string | null;
  error_message: string;
  error_stack: string;
  error_source: string;
  page_url: string;
  user_agent: string;
  metadata: any;
  created_at: string;
}

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Error logs state
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [errorLogsTotal, setErrorLogsTotal] = useState(0);
  const [errorLogsLoading, setErrorLogsLoading] = useState(false);
  const [errorDays, setErrorDays] = useState("7");
  const [errorSource, setErrorSource] = useState("all");
  const [expandedError, setExpandedError] = useState<string | null>(null);

  // AI spend monitoring state
  const [spendData, setSpendData] = useState<any>(null);
  const [spendLoading, setSpendLoading] = useState(false);
  const [thresholdLimit, setThresholdLimit] = useState("0.75");
  const [thresholdPct, setThresholdPct] = useState("80");
  const [savingThreshold, setSavingThreshold] = useState(false);

  useEffect(() => {
    const fetchMetrics = async () => {
      if (!user) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const { data, error } = await supabase.functions.invoke("admin-metrics", {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setMetrics(data);
      } catch (err: any) {
        setError(err.message || "Failed to load admin data");
      } finally {
        setLoading(false);
      }
    };
    fetchMetrics();
  }, [user]);

  const fetchErrorLogs = async () => {
    if (!user) return;
    setErrorLogsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams({ days: errorDays, limit: "100" });
      if (errorSource !== "all") params.set("source", errorSource);

      const { data, error } = await supabase.functions.invoke(
        `admin-error-logs?${params.toString()}`,
        { headers: { Authorization: `Bearer ${session?.access_token}` } }
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setErrorLogs(data.logs || []);
      setErrorLogsTotal(data.total || 0);
    } catch (err: any) {
      console.error("Failed to fetch error logs:", err);
    } finally {
      setErrorLogsLoading(false);
    }
  };

  const fetchSpendData = async () => {
    setSpendLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("check-ai-spend", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      setSpendData(data);
      setThresholdLimit(String(data?.limit ?? "0.75"));
      setThresholdPct(String(Math.round((data?.threshold / data?.limit) * 100) || 80));
    } catch (err: any) {
      console.error("Failed to fetch spend data:", err);
    } finally {
      setSpendLoading(false);
    }
  };

  const saveThreshold = async () => {
    setSavingThreshold(true);
    try {
      const { error } = await supabase
        .from("admin_settings" as any)
        .update({
          value: {
            monthly_limit: parseFloat(thresholdLimit) || 0.75,
            notify_at_pct: parseInt(thresholdPct) || 80,
          },
          updated_at: new Date().toISOString(),
        } as any)
        .eq("key", "ai_spend_threshold");
      if (error) throw error;
      toast.success("Spend threshold updated");
      fetchSpendData();
    } catch (err: any) {
      toast.error("Failed to save threshold");
      console.error(err);
    } finally {
      setSavingThreshold(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
        <p className="text-destructive font-medium">{error}</p>
        <Button variant="outline" onClick={() => navigate("/")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Button>
      </div>
    );
  }

  const stats = [
    { label: "Total Users", value: metrics?.totalUsers ?? 0, icon: Users, color: "text-blue-500" },
    { label: "Brands", value: metrics?.totalOrgs ?? 0, icon: Building2, color: "text-purple-500" },
    { label: "Products", value: metrics?.totalProducts ?? 0, icon: Package, color: "text-emerald-500" },
    { label: "Listings", value: metrics?.totalListings ?? 0, icon: FileText, color: "text-amber-500" },
    { label: "Mockup Images", value: metrics?.totalImages ?? 0, icon: Image, color: "text-pink-500" },
    { label: "AI Calls (All Time)", value: metrics?.totalAiUsage ?? 0, icon: Zap, color: "text-orange-500" },
    { label: "AI Calls (30d)", value: metrics?.aiUsage30d ?? 0, icon: Zap, color: "text-cyan-500" },
    { label: "Support Tickets", value: metrics?.tickets?.length ?? 0, icon: TicketCheck, color: "text-red-500" },
  ];

  const openTickets = metrics?.tickets?.filter((t) => t.status === "open") ?? [];

  const sourceColor = (src: string) => {
    switch (src) {
      case "uncaught": return "destructive";
      case "unhandled-rejection": return "destructive";
      case "edge-function": return "secondary";
      case "api": return "secondary";
      default: return "outline";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Button>
        <h1 className="text-xl font-bold text-foreground">Admin Console</h1>
        <Badge variant="outline" className="ml-auto text-xs">Platform Owner</Badge>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-8">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="errors" onClick={() => { if (errorLogs.length === 0) fetchErrorLogs(); }}>
              Error Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-8 mt-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {stats.map((s) => (
                <Card key={s.label}>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <s.icon className={`h-5 w-5 ${s.color}`} />
                      <div>
                        <p className="text-2xl font-bold text-foreground">{s.value.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Open Support Tickets */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TicketCheck className="h-4 w-4 text-red-500" />
                  Open Support Tickets ({openTickets.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {openTickets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No open tickets 🎉</p>
                ) : (
                  <div className="space-y-3">
                    {openTickets.map((t: any) => (
                      <div key={t.id} className="border border-border rounded-lg p-4 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-foreground">{t.subject}</span>
                          <Badge variant="secondary" className="text-xs">{t.tier}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{t.message}</p>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span>{t.name} — {t.email}</span>
                          <span>{new Date(t.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Products */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4 text-emerald-500" />
                  Recent Products
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(metrics?.recentProducts ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No products yet</p>
                ) : (
                  <div className="space-y-2">
                    {metrics?.recentProducts?.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-foreground">{p.title}</p>
                          <p className="text-xs text-muted-foreground">{p.category} — ${p.price}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="errors" className="space-y-6 mt-6">
            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={errorDays} onValueChange={setErrorDays}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last 24 hours</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>

              <Select value={errorSource} onValueChange={setErrorSource}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="uncaught">Uncaught errors</SelectItem>
                  <SelectItem value="unhandled-rejection">Unhandled rejections</SelectItem>
                  <SelectItem value="edge-function">Edge functions</SelectItem>
                  <SelectItem value="api">API errors</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={fetchErrorLogs} disabled={errorLogsLoading} className="gap-2">
                <RefreshCw className={`h-3.5 w-3.5 ${errorLogsLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>

              <span className="text-sm text-muted-foreground ml-auto">
                {errorLogsTotal} error{errorLogsTotal !== 1 ? "s" : ""} found
              </span>
            </div>

            {/* Error list */}
            {errorLogsLoading && errorLogs.length === 0 ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : errorLogs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No errors logged in this period 🎉</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {errorLogs.map((log) => (
                  <Card
                    key={log.id}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedError(expandedError === log.id ? null : log.id)}
                  >
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-foreground truncate max-w-[500px]">
                              {log.error_message || "Unknown error"}
                            </p>
                            <Badge variant={sourceColor(log.error_source)} className="text-xs shrink-0">
                              {log.error_source}
                            </Badge>
                          </div>
                          <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                            <span>{new Date(log.created_at).toLocaleString()}</span>
                            {log.page_url && <span className="truncate max-w-[300px]">{log.page_url}</span>}
                          </div>

                          {expandedError === log.id && (
                            <div className="mt-3 space-y-2">
                              <div className="text-xs text-muted-foreground">
                                <strong>User ID:</strong> <code className="bg-muted px-1 py-0.5 rounded">{log.user_id}</code>
                              </div>
                              {log.organization_id && (
                                <div className="text-xs text-muted-foreground">
                                  <strong>Org ID:</strong> <code className="bg-muted px-1 py-0.5 rounded">{log.organization_id}</code>
                                </div>
                              )}
                              {log.error_stack && (
                                <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto max-h-48 whitespace-pre-wrap break-all text-muted-foreground">
                                  {log.error_stack}
                                </pre>
                              )}
                              {log.metadata && Object.keys(log.metadata).length > 0 && (
                                <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto text-muted-foreground">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              )}
                              <div className="text-xs text-muted-foreground truncate">
                                <strong>UA:</strong> {log.user_agent}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
