import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Users, Package, FileText, Zap, Image, Building2, ArrowLeft, TicketCheck } from "lucide-react";

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

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      </main>
    </div>
  );
}
