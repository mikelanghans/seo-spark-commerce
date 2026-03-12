import { supabase } from "@/integrations/supabase/client";
import type { StepKey, StepStatus, PipelineItem } from "@/components/AutopilotPipeline";

export interface PipelineJobRow {
  id: string;
  user_id: string;
  organization_id: string;
  status: string;
  push_to_shopify: boolean;
  concurrency: number;
  total_items: number;
  completed_items: number;
  failed_items: number;
  created_at: string;
  updated_at: string;
}

export interface PipelineJobItemRow {
  id: string;
  job_id: string;
  item_index: number;
  folder_name: string;
  design_file_name: string;
  mockup_file_names: string[];
  step: string;
  status: string;
  error: string | null;
  product_title: string | null;
  product_id: string | null;
  design_url: string | null;
  mockup_uploads: { colorName: string; url: string }[];
}

/** Create a new pipeline job record */
export async function createPipelineJob(
  userId: string,
  organizationId: string,
  pushToShopify: boolean,
  concurrency: number,
  items: PipelineItem[]
): Promise<string> {
  const { data, error } = await supabase
    .from("pipeline_jobs")
    .insert({
      user_id: userId,
      organization_id: organizationId,
      status: "running",
      push_to_shopify: pushToShopify,
      concurrency,
      total_items: items.length,
      completed_items: 0,
      failed_items: 0,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create pipeline job: ${error.message}`);

  // Insert all items
  const itemRows = items.map((item, i) => ({
    job_id: data.id,
    item_index: i,
    folder_name: item.folderName,
    design_file_name: item.designFileName,
    mockup_file_names: item.mockupFileNames,
    step: item.step,
    status: item.status,
  }));
  const { error: itemsError } = await supabase.from("pipeline_job_items").insert(itemRows);
  if (itemsError) console.error("Failed to insert job items:", itemsError.message);

  return data.id;
}

/** Update a single pipeline item's progress */
export async function updatePipelineItem(
  jobId: string,
  itemIndex: number,
  updates: {
    step?: StepKey;
    status?: StepStatus;
    error?: string;
    productTitle?: string;
    productId?: string;
    designUrl?: string;
    mockupUploads?: { colorName: string; url: string }[];
  }
) {
  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.step !== undefined) dbUpdates.step = updates.step;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.error !== undefined) dbUpdates.error = updates.error;
  if (updates.productTitle !== undefined) dbUpdates.product_title = updates.productTitle;
  if (updates.productId !== undefined) dbUpdates.product_id = updates.productId;
  if (updates.designUrl !== undefined) dbUpdates.design_url = updates.designUrl;
  if (updates.mockupUploads !== undefined) dbUpdates.mockup_uploads = updates.mockupUploads;

  await supabase
    .from("pipeline_job_items")
    .update(dbUpdates)
    .eq("job_id", jobId)
    .eq("item_index", itemIndex);
}

/** Update job-level counters */
export async function updatePipelineJobCounters(jobId: string) {
  const { data: items } = await supabase
    .from("pipeline_job_items")
    .select("status, step")
    .eq("job_id", jobId);

  if (!items) return;

  const completed = items.filter((i: any) => i.step === "done").length;
  const failed = items.filter((i: any) => i.status === "error").length;
  const allDone = completed + failed === items.length;

  await supabase
    .from("pipeline_jobs")
    .update({
      completed_items: completed,
      failed_items: failed,
      status: allDone ? "completed" : "running",
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

/** Find incomplete pipeline jobs for a user+org */
export async function findIncompleteJob(
  userId: string,
  organizationId: string
): Promise<{ job: PipelineJobRow; items: PipelineJobItemRow[] } | null> {
  const { data: jobs } = await supabase
    .from("pipeline_jobs")
    .select("*")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("status", "running")
    .order("created_at", { ascending: false })
    .limit(1);

  if (!jobs || jobs.length === 0) return null;

  const job = jobs[0] as PipelineJobRow;
  const { data: items } = await supabase
    .from("pipeline_job_items")
    .select("*")
    .eq("job_id", job.id)
    .order("item_index", { ascending: true });

  if (!items) return null;

  return { job, items: items as PipelineJobItemRow[] };
}

/** Convert DB items back to PipelineItem format */
export function dbItemToPipelineItem(row: PipelineJobItemRow): PipelineItem {
  return {
    folderName: row.folder_name,
    designFileName: row.design_file_name,
    mockupFileNames: (row.mockup_file_names || []) as string[],
    step: row.step as StepKey,
    status: row.status as StepStatus,
    error: row.error || undefined,
    productTitle: row.product_title || undefined,
    productId: row.product_id || undefined,
  };
}
