import { describe, expect, it } from "vitest";
import type { Category } from "./types";
import { sortMenuCategories } from "./client";

describe("sortMenuCategories", () => {
  it("uses the saved dashboard order before the legacy category rank", () => {
    const categories: Category[] = [
      { id: "grill", slug: "grill", label: "Grill", sortOrder: 2, isActive: true },
      { id: "new", slug: "noutati", label: "Noutăți", sortOrder: 0, isActive: true },
      { id: "menu", slug: "meniuri", label: "Meniuri", sortOrder: 1, isActive: true }
    ];

    expect(sortMenuCategories(categories).map((category) => category.id)).toEqual(["new", "menu", "grill"]);
  });
});
