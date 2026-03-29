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

export const getStyleLabel = (value: string): string =>
  DESIGN_STYLE_LABELS[value] || value.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
