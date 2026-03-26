
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS enabled_social_platforms text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.social_posts
ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;
