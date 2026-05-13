ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS design_quality text NOT NULL DEFAULT 'standard';

ALTER TABLE public.organizations
DROP CONSTRAINT IF EXISTS organizations_design_quality_check;

ALTER TABLE public.organizations
ADD CONSTRAINT organizations_design_quality_check
CHECK (design_quality IN ('standard', 'pro'));