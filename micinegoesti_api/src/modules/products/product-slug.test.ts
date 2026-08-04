import { describe, expect, it } from "vitest";
import {
  isProductSlugConflict,
  nextAvailableProductSlug,
  slugifyProduct
} from "./product-slug.js";

describe("product slug allocation", () => {
  it("normalizes Romanian product names", () => {
    expect(slugifyProduct("  Pâine și Smântână  ")).toBe("paine-si-smantana");
  });

  it("keeps the readable base when it is available", () => {
    expect(nextAvailableProductSlug("Piure", ["cartofi-prajiti"])).toBe("piure");
  });

  it("adds the first available numeric suffix for duplicate names", () => {
    expect(nextAvailableProductSlug("Piure", ["piure", "piure-2", "piure-4"]))
      .toBe("piure-3");
  });

  it("only identifies the product slug unique constraint", () => {
    expect(isProductSlugConflict({
      code: "23505",
      message: 'duplicate key value violates unique constraint "products_slug_key"'
    })).toBe(true);
    expect(isProductSlugConflict({
      code: "23505",
      message: 'duplicate key value violates unique constraint "products_pkey"'
    })).toBe(false);
  });
});
