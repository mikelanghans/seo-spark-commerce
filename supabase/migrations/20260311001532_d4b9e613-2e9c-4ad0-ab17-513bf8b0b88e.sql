ALTER TABLE public.social_posts 
  ADD COLUMN image_url text DEFAULT '',
  ADD COLUMN scheduled_date date DEFAULT null;