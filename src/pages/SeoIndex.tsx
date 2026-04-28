import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { startScan } from "@/integrations/seo-backend/client";
import { RecentScans } from "@/components/seo/RecentScans";
import { GlobalErrorBoundary } from "@/components/seo/GlobalErrorBoundary";
import { useToast } from "@/hooks/use-toast";
import { SCAN_SCOPE_LABELS, type ScanScope } from "@/integrations/seo-backend/types";
import { supabase } from "@/integrations/supabase/client";

const SeoIndex = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string>("");
  const [rootUrl, setRootUrl] = useState("");
  const [scope, setScope] = useState<ScanScope>("standard");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth"); return; }
    const stored = sessionStorage.getItem("dash_org_id");
    if (!stored) { navigate("/"); return; }
    setOrgId(stored);
    supabase.from("organizations").select("name").eq("id", stored).maybeSingle()
      .then(({ data }) => setOrgName(data?.name || ""));
  }, [user, authLoading, navigate]);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    let url = rootUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { new URL(url); } catch {
      toast({ title: "Invalid URL", description: "Enter a valid http(s) URL.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const id = await startScan(url, scope, orgId);
      navigate(`/seo/scan/${id}`);
    } catch (e) {
      toast({ title: "Failed to start scan", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !orgId) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <GlobalErrorBoundary>
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="h-4 w-4" /></Button>
            <div>
              <h1 className="text-2xl font-bold">SEO Site Audit</h1>
              <p className="text-sm text-muted-foreground">{orgName ? `Brand: ${orgName}` : "Brand-scoped scans"}</p>
            </div>
          </div>

          <form onSubmit={handleStart} className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rootUrl">Website URL</Label>
              <Input id="rootUrl" type="text" placeholder="https://example.com" value={rootUrl} onChange={(e) => setRootUrl(e.target.value)} required maxLength={2048} />
            </div>
            <div className="space-y-2">
              <Label>Scan scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as ScanScope)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SCAN_SCOPE_LABELS) as ScanScope[]).map((s) => (
                    <SelectItem key={s} value={s}>{SCAN_SCOPE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
              {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting…</> : "Start scan"}
            </Button>
          </form>

          <div className="rounded-xl border border-border bg-card p-6 space-y-3">
            <h2 className="text-lg font-semibold">Recent scans</h2>
            <RecentScans organizationId={orgId} />
          </div>
        </div>
      </div>
    </GlobalErrorBoundary>
  );
};

export default SeoIndex;
