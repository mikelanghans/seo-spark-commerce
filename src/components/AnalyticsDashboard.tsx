import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, DollarSign, ShoppingCart, Package, Palette, TrendingUp, BarChart3 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  AreaChart, Area, CartesianGrid, LineChart, Line,
} from "recharts";

interface Organization {
  id: string;
  name: string;
  enabled_marketplaces?: string[];
}

interface Props {
  organization: Organization;
  userId: string;
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 160 60% 45%))",
  "hsl(var(--chart-3, 30 80% 55%))",
  "hsl(var(--chart-4, 280 65% 60%))",
  "hsl(var(--chart-5, 340 75% 55%))",
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
];

export function AnalyticsDashboard({ organization, userId }: Props) {
  const [loading, setLoading] = useState(true);

  // Internal metrics
  const [marketplaceStatus, setMarketplaceStatus] = useState<{ name: string; value: number }[]>([]);
  const [aiUsageTrend, setAiUsageTrend] = useState<{ date: string; calls: number }[]>([]);
  const [topByListings, setTopByListings] = useState<{ title: string; count: number }[]>([]);
  const [colorPopularity, setColorPopularity] = useState<{ name: string; value: number }[]>([]);

  // Shopify metrics
  const [shopifyData, setShopifyData] = useState<{
    revenueByDay: { date: string; revenue: number }[];
    topProducts: { title: string; quantity: number; revenue: number }[];
    totalRevenue: number;
    totalOrders: number;
  } | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, [organization.id]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadMarketplaceStatus().catch(e => console.error("Analytics: marketplace status", e)),
        loadAiUsageTrend().catch(e => console.error("Analytics: ai usage", e)),
        loadTopByListings().catch(e => console.error("Analytics: top listings", e)),
        loadColorPopularity().catch(e => console.error("Analytics: colors", e)),
        loadShopifyAnalytics().catch(e => console.error("Analytics: shopify", e)),
      ]);
    } catch (e) {
      console.error("Analytics load failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadMarketplaceStatus = async () => {
    // Products with their listing counts
    const { data: products } = await supabase
      .from("products")
      .select("id, title")
      .eq("organization_id", organization.id);

    if (!products || products.length === 0) {
      setMarketplaceStatus([]);
      return;
    }

    const { data: listings } = await supabase
      .from("listings")
      .select("product_id, marketplace")
      .in("product_id", products.map(p => p.id));

    const enabledMp = organization.enabled_marketplaces?.length
      ? organization.enabled_marketplaces.length
      : 4; // default all 4

    let fullySynced = 0;
    let partialSync = 0;
    let notListed = 0;

    for (const product of products) {
      const productListings = (listings || []).filter(l => l.product_id === product.id);
      const uniqueMarketplaces = new Set(productListings.map(l => l.marketplace)).size;
      if (uniqueMarketplaces === 0) notListed++;
      else if (uniqueMarketplaces >= enabledMp) fullySynced++;
      else partialSync++;
    }

    setMarketplaceStatus([
      { name: "Fully Synced", value: fullySynced },
      { name: "Partial Sync", value: partialSync },
      { name: "Not Listed", value: notListed },
    ].filter(s => s.value > 0));
  };

  const loadAiUsageTrend = async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("ai_usage_log")
      .select("created_at")
      .eq("organization_id", organization.id)
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: true });

    if (!data || data.length === 0) {
      setAiUsageTrend([]);
      return;
    }

    const daily: Record<string, number> = {};
    for (const row of data) {
      const day = row.created_at.substring(0, 10);
      daily[day] = (daily[day] || 0) + 1;
    }

    // Fill in missing days
    const result: { date: string; calls: number }[] = [];
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    for (let i = 0; i <= 30; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().substring(0, 10);
      result.push({ date: key, calls: daily[key] || 0 });
    }

    setAiUsageTrend(result);
  };

  const loadTopByListings = async () => {
    const { data: products } = await supabase
      .from("products")
      .select("id, title")
      .eq("organization_id", organization.id);

    if (!products || products.length === 0) {
      setTopByListings([]);
      return;
    }

    const { data: listings } = await supabase
      .from("listings")
      .select("product_id")
      .in("product_id", products.map(p => p.id));

    const counts: Record<string, { title: string; count: number }> = {};
    for (const p of products) {
      counts[p.id] = { title: p.title, count: 0 };
    }
    for (const l of listings || []) {
      if (counts[l.product_id]) counts[l.product_id].count++;
    }

    setTopByListings(
      Object.values(counts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
    );
  };

  const loadColorPopularity = async () => {
    const { data: products } = await supabase
      .from("products")
      .select("id")
      .eq("organization_id", organization.id);

    if (!products || products.length === 0) {
      setColorPopularity([]);
      return;
    }

    const { data: images } = await supabase
      .from("product_images")
      .select("color_name")
      .in("product_id", products.map(p => p.id))
      .neq("color_name", "");

    if (!images || images.length === 0) {
      setColorPopularity([]);
      return;
    }

    const colorCounts: Record<string, number> = {};
    for (const img of images) {
      const color = img.color_name.trim();
      if (color) colorCounts[color] = (colorCounts[color] || 0) + 1;
    }

    setColorPopularity(
      Object.entries(colorCounts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)
    );
  };

  const loadShopifyAnalytics = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const { data, error } = await supabase.functions.invoke("fetch-shopify-analytics", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { organizationId: organization.id },
      });

      if (error || data?.error) {
        console.error("Shopify analytics error:", error || data?.error);
        return;
      }

      setShopifyData(data);
    } catch (e) {
      console.error("Shopify analytics fetch failed:", e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalProducts = (marketplaceStatus.reduce((sum, s) => sum + s.value, 0));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Package className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalProducts}</p>
                <p className="text-xs text-muted-foreground">Total Products</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-500/10 p-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{aiUsageTrend.reduce((s, d) => s + d.calls, 0)}</p>
                <p className="text-xs text-muted-foreground">AI Calls (30d)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {shopifyData && (
          <>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-amber-500/10 p-2">
                    <DollarSign className="h-4 w-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">${shopifyData.totalRevenue.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Revenue (90d)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-500/10 p-2">
                    <ShoppingCart className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{shopifyData.totalOrders}</p>
                    <p className="text-xs text-muted-foreground">Orders (90d)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Shopify Revenue Chart */}
        {shopifyData && shopifyData.revenueByDay.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-amber-500" />
                Shopify Revenue (Last 90 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={shopifyData.revenueByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    labelFormatter={(v) => new Date(v).toLocaleDateString()}
                    formatter={(v: number) => [`$${v.toFixed(2)}`, "Revenue"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary) / 0.15)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Products by Marketplace Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Products by Marketplace Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {marketplaceStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No products yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={marketplaceStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {marketplaceStatus.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Color Variant Popularity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4 text-pink-500" />
              Color Variant Popularity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {colorPopularity.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No color variant data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={colorPopularity} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={80}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* AI Usage Trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              AI Generation Usage (Last 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {aiUsageTrend.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No AI usage data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={aiUsageTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    labelFormatter={(v) => new Date(v).toLocaleDateString()}
                  />
                  <Line
                    type="monotone"
                    dataKey="calls"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top Products by Listing Count */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-500" />
              Top Products by Listing Coverage
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topByListings.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No listings yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topByListings}>
                  <XAxis
                    dataKey="title"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={60}
                    tickFormatter={(v) => v.length > 15 ? v.substring(0, 14) + "…" : v}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--chart-2, 160 60% 45%))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Shopify Top Selling Products */}
        {shopifyData && shopifyData.topProducts.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-amber-500" />
                Top Selling Products (Shopify)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                {shopifyData.topProducts.slice(0, 8).map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{i + 1}.</span>
                      <span className="truncate">{p.title}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className="text-xs text-muted-foreground">{p.quantity} sold</span>
                      <span className="font-medium">${p.revenue.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
