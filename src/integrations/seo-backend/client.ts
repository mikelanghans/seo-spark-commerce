import { supabase } from "@/integrations/supabase/client";
import type { SavedScan, ScanScope } from "./types";

export async function startScan(rootUrl: string, scope: ScanScope, organizationId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("seo-start-scan", {
    body: { rootUrl, scope, organizationId },
  });
  if (error) throw new Error(error.message || "Failed to start scan");
  if (!data?.scanId) throw new Error((data as any)?.error || "No scanId returned");
  return data.scanId as string;
}

export async function getScan(scanId: string): Promise<SavedScan> {
  const { data, error } = await supabase.functions.invoke("seo-get-scan", { body: { scanId } });
  if (error) throw new Error(error.message || "Failed to load scan");
  if (!data?.scan) throw new Error((data as any)?.error || "Scan not found");
  return data.scan as SavedScan;
}

export async function listScans(organizationId: string, limit = 20): Promise<SavedScan[]> {
  const { data, error } = await supabase.functions.invoke("seo-list-scans", { body: { organizationId, limit } });
  if (error) throw new Error(error.message || "Failed to load scans");
  return (data?.scans || []) as SavedScan[];
}

export async function retryScan(scanId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("seo-retry-scan", { body: { scanId } });
  if (error) throw new Error(error.message || "Failed to retry scan");
  if (!data?.scanId) throw new Error((data as any)?.error || "No scanId returned");
  return data.scanId as string;
}

export async function extendScan(scanId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("seo-extend-scan", { body: { scanId } });
  if (error) throw new Error(error.message || "Failed to extend scan");
  if ((data as any)?.error) throw new Error((data as any).error);
}
