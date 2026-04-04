import type { DesignPlacement } from "@/lib/mockupComposition";

export function parsePrintPlacement(value: unknown): DesignPlacement | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<DesignPlacement>;
  const { scale, offsetX, offsetY } = candidate;

  if (
    typeof scale !== "number" || !Number.isFinite(scale) ||
    typeof offsetX !== "number" || !Number.isFinite(offsetX) ||
    typeof offsetY !== "number" || !Number.isFinite(offsetY)
  ) {
    return null;
  }

  return { scale, offsetX, offsetY };
}