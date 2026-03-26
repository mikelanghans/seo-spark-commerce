import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, Trash2, ExternalLink, Printer } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string;
  organizationId?: string;
}

export const PrintifySettings = ({ userId, organizationId }: Props) => {
  const [loading, setLoading] = useState(true);
  const [printifyToken, setPrintifyToken] = useState("");
  const [printifyHasToken, setPrintifyHasToken] = useState(false);
  const [savingPrintify, setSavingPrintify] = useState(false);

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
      if (checkData?.hasToken) setPrintifyHasToken(true);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
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
      toast.success("Printify token saved!");
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Printer className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Printify</h3>
        </div>
        {printifyHasToken ? (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-300">
              <Check className="h-3 w-3 mr-1" /> Connected
            </Badge>
            <Button variant="ghost" size="icon" onClick={disconnectPrintify}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ) : (
          <Badge variant="secondary">Not connected</Badge>
        )}
      </div>

      {printifyHasToken ? (
        <p className="text-sm text-muted-foreground">Your Printify API token is saved. Products will be created in your Printify account.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Connect your Printify account to push products for print-on-demand.
            <a href="https://printify.com/app/account/api" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary ml-1">
              Get API token <ExternalLink className="h-3 w-3" />
            </a>
          </p>
          <div>
            <Label>API Token</Label>
            <Input type="password" value={printifyToken} onChange={(e) => setPrintifyToken(e.target.value)} placeholder="Your Printify API token" />
          </div>
          <Button onClick={savePrintify} disabled={savingPrintify} className="gap-2">
            {savingPrintify ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Connect Printify
          </Button>
        </div>
      )}
    </div>
  );
};
