import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check, Trash2, ExternalLink, Printer, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props {
  userId: string;
  organizationId?: string;
}

export const PrintifySettings = ({ userId, organizationId }: Props) => {
  const [loading, setLoading] = useState(true);
  const [printifyToken, setPrintifyToken] = useState("");
  const [printifyHasToken, setPrintifyHasToken] = useState(false);
  const [savingPrintify, setSavingPrintify] = useState(false);
  const [editing, setEditing] = useState(false);

  // Shop picker state
  const [shops, setShops] = useState<{ id: number; title: string }[]>([]);
  const [loadingShops, setLoadingShops] = useState(false);
  const [currentShopId, setCurrentShopId] = useState<number | null>(null);
  const [savingShop, setSavingShop] = useState(false);

  useEffect(() => {
    if (organizationId) loadStatus();
    else setLoading(false);
  }, [organizationId]);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const { data: checkData } = await supabase.functions.invoke("save-printify-credentials", {
        body: { organizationId, action: "check" },
      });
      if (checkData?.hasToken) {
        setPrintifyHasToken(true);
        loadShops();
      }
      // Load current shop id from org
      if (organizationId) {
        const { data: org } = await supabase.from("organizations").select("printify_shop_id").eq("id", organizationId).single();
        if (org) setCurrentShopId(org.printify_shop_id);
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const loadShops = async () => {
    if (!organizationId) return;
    setLoadingShops(true);
    try {
      const { data } = await supabase.functions.invoke("printify-get-shops", {
        body: { organizationId },
      });
      setShops(data?.shops || []);
    } catch { /* silent */ }
    setLoadingShops(false);
  };

  const saveShopSelection = async (shopId: number | null) => {
    if (!organizationId) return;
    setSavingShop(true);
    try {
      const { error } = await supabase.from("organizations").update({ printify_shop_id: shopId }).eq("id", organizationId);
      if (error) throw error;
      setCurrentShopId(shopId);
      toast.success("Printify shop updated");
    } catch (e: any) {
      toast.error(e.message || "Failed to update shop");
    } finally {
      setSavingShop(false);
    }
  };

  const savePrintify = async () => {
    if (!printifyToken.trim()) {
      toast.error("Printify API token is required");
      return;
    }
    if (!organizationId) {
      toast.error("No brand selected");
      return;
    }
    setSavingPrintify(true);
    try {
      const { data, error } = await supabase.functions.invoke("save-printify-credentials", {
        body: { organizationId, printifyToken },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPrintifyHasToken(true);
      setPrintifyToken("");
      setEditing(false);
      toast.success("Printify token saved!");
      loadShops();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSavingPrintify(false);
    }
  };

  const disconnectPrintify = async () => {
    if (!organizationId) return;
    try {
      const { data, error } = await supabase.functions.invoke("save-printify-credentials", {
        body: { organizationId, action: "disconnect" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPrintifyHasToken(false);
      setEditing(false);
      setPrintifyToken("");
      setShops([]);
      setCurrentShopId(null);
      toast.success("Printify disconnected");
    } catch (e: any) {
      toast.error(e.message || "Failed to disconnect");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Printer className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Printify Connection</h3>
      </div>

      {printifyHasToken && !editing ? (
        <>
          <div className="rounded-md bg-green-500/10 border border-green-500/30 px-4 py-3 flex items-center gap-2">
            <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-700 dark:text-green-300">Connected to Printify</span>
          </div>

          {/* Shop Picker */}
          <div className="space-y-2">
            <Label>Printify Shop</Label>
            <p className="text-xs text-muted-foreground">Link to a specific Printify shop for print-on-demand products</p>
            {loadingShops ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading shops…</div>
            ) : shops.length > 0 ? (
              <select
                value={currentShopId || ""}
                onChange={(e) => saveShopSelection(e.target.value ? Number(e.target.value) : null)}
                disabled={savingShop}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Auto (first shop)</option>
                {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.title}</option>)}
              </select>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={loadShops} className="gap-2">
                <RefreshCw className="h-3.5 w-3.5" /> Load Shops
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => { setEditing(true); setPrintifyToken(""); }}>
              <Pencil className="h-4 w-4" /> Edit App Credentials
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" /> Disconnect
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect Printify?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove your Printify API token. You won't be able to push products to Printify until you reconnect.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={disconnectPrintify} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Disconnect
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {printifyHasToken ? "Update your Printify API token below." : "Connect your Printify account to push products for print-on-demand."}
            <a href="https://printify.com/app/account/api" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary ml-1">
              Get API token <ExternalLink className="h-3 w-3" />
            </a>
          </p>
          <div>
            <Label>API Token</Label>
            <Input type="password" value={printifyToken} onChange={(e) => setPrintifyToken(e.target.value)} placeholder={printifyHasToken ? "Enter new token" : "Your Printify API token"} />
          </div>
          <div className="flex gap-2">
            <Button onClick={savePrintify} disabled={savingPrintify} className="gap-2">
              {savingPrintify ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {printifyHasToken ? "Update Token" : "Connect Printify"}
            </Button>
            {editing && (
              <Button variant="outline" onClick={() => { setEditing(false); setPrintifyToken(""); }}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
