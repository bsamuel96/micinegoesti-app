import { describe, expect, it } from "vitest";
import {
  isProductTrashed,
  restoreProductMetadata,
  trashProductMetadata
} from "./product-trash.js";

describe("product trash metadata", () => {
  it("preserves the previous publication state when a product is trashed", () => {
    const metadata = trashProductMetadata({ allergen_codes: [1, 7] }, false, "2026-07-27T10:00:00.000Z");

    expect(metadata).toEqual({
      allergen_codes: [1, 7],
      trashed_at: "2026-07-27T10:00:00.000Z",
      trash_previous_is_active: false
    });
    expect(isProductTrashed(metadata)).toBe(true);
  });

  it("restores the original publication state and removes trash markers", () => {
    expect(restoreProductMetadata({
      short_description: "Meniu",
      trashed_at: "2026-07-27T10:00:00.000Z",
      trash_previous_is_active: false
    })).toEqual({
      metadata: { short_description: "Meniu" },
      isPublished: false
    });
  });

  it("does not overwrite the original state when deleting an already trashed product", () => {
    const metadata = {
      trashed_at: "2026-07-27T10:00:00.000Z",
      trash_previous_is_active: true
    };

    expect(trashProductMetadata(metadata, false, "2026-07-28T10:00:00.000Z")).toBe(metadata);
  });
});
