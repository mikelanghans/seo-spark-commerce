import { describe, expect, it } from "vitest";

import { resolveSingleDesignVariant } from "@/lib/productImageUtils";

describe("resolveSingleDesignVariant", () => {
  it("treats duplicate light/dark rows with the same file as a shared design", () => {
    const sharedUrl = "https://cdn.example.com/designs/starfield.png?cache=1";

    const result = resolveSingleDesignVariant([
      { image_url: sharedUrl, color_name: "light-on-dark" },
      { image_url: "https://cdn.example.com/designs/starfield.png?cache=2", color_name: "dark-on-light" },
    ]);

    expect(result).toEqual({
      lightUrl: sharedUrl,
      darkUrl: sharedUrl,
      hasSingleSharedFile: true,
    });
  });

  it("treats a single distinct uploaded asset as shared even if color names are inconsistent", () => {
    const sharedUrl = "https://cdn.example.com/designs/starfield.png";

    const result = resolveSingleDesignVariant([
      { image_url: sharedUrl, color_name: "primary" },
      { image_url: sharedUrl, color_name: "secondary" },
    ]);

    expect(result).toEqual({
      lightUrl: sharedUrl,
      darkUrl: sharedUrl,
      hasSingleSharedFile: true,
    });
  });
});