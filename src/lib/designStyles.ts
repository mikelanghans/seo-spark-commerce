export const DESIGN_STYLE_LABELS: Record<string, string> = {
  "text-only": "Text",
  "text-with-graphics": "Text + Graphics",
  "minimalist": "Art",
  "retro": "Retro",
  "hand-drawn": "Sketch",
  "bold-graphic": "Bold",
  "distressed": "Grunge",
  "illustration": "Illustration",
  "photo-based": "Photo-Based",
};

export const DESIGN_STYLE_DESCRIPTIONS: Record<string, string> = {
  "text-only": "Clean typography-focused designs with no graphics — great for quotes and slogans",
  "text-with-graphics": "Text paired with simple icons or shapes for added visual interest",
  "minimalist": "Stripped-back artistic compositions with minimal elements and plenty of whitespace",
  "retro": "Vintage-inspired designs with nostalgic color palettes and classic typography",
  "hand-drawn": "Organic, hand-sketched feel with imperfect lines and a personal touch",
  "bold-graphic": "High-impact designs with thick lines, strong contrast, and punchy visuals",
  "distressed": "Rough, textured designs with a worn, weathered aesthetic",
  "illustration": "Detailed illustrated artwork with clean separation between text and graphics",
  "photo-based": "Designs built around photographic imagery blended with text overlays",
};

export const getStyleLabel = (value: string): string =>
  DESIGN_STYLE_LABELS[value] || value.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

export const getStyleDescription = (value: string): string =>
  DESIGN_STYLE_DESCRIPTIONS[value] || "";
