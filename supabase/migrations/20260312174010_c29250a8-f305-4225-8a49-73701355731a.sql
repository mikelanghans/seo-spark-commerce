
-- Pipeline jobs table to persist autopilot runs
CREATE TABLE public.pipeline_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL DEFAULT 'running',
  push_to_shopify boolean NOT NULL DEFAULT true,
  concurrency integer NOT NULL DEFAULT 3,
  total_items integer NOT NULL DEFAULT 0,
  completed_items integer NOT NULL DEFAULT 0,
  failed_items integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Pipeline job items table to persist each item's progress
CREATE TABLE public.pipeline_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.pipeline_jobs(id) ON DELETE CASCADE NOT NULL,
  item_index integer NOT NULL DEFAULT 0,
  folder_name text NOT NULL,
  design_file_name text NOT NULL DEFAULT '',
  mockup_file_names jsonb NOT NULL DEFAULT '[]',
  step text NOT NULL DEFAULT 'upload',
  status text NOT NULL DEFAULT 'pending',
  error text,
  product_title text,
  product_id uuid,
  design_url text,
  mockup_uploads jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pipeline_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_job_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for pipeline_jobs
CREATE POLICY "Users can manage own pipeline jobs"
  ON public.pipeline_jobs FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS policies for pipeline_job_items
CREATE POLICY "Users can manage own pipeline job items"
  ON public.pipeline_job_items FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pipeline_jobs j
    WHERE j.id = pipeline_job_items.job_id AND j.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pipeline_jobs j
    WHERE j.id = pipeline_job_items.job_id AND j.user_id = auth.uid()
  ));
