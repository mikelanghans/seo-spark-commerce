ALTER TABLE public.organizations
  ADD COLUMN brand_font text NOT NULL DEFAULT '',
  ADD COLUMN brand_color text NOT NULL DEFAULT '',
  ADD COLUMN brand_font_size text NOT NULL DEFAULT 'large',
  ADD COLUMN brand_style_notes text NOT NULL DEFAULT '';