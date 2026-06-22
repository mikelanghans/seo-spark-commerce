ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS default_size_pricing jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS size_pricing jsonb DEFAULT NULL;