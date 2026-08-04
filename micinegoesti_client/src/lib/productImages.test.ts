import { describe, expect, it } from "vitest";
import { getProductCoverImage, PRODUCT_IMAGE_FALLBACK } from "./productImages";

describe("getProductCoverImage", () => {
  it("uses ordered gallery, then legacy URL, then fallback", () => {
    expect(getProductCoverImage({ images: [{ id: "b", url: "b", sortOrder: 2 }, { id: "a", url: "a", sortOrder: 0 }], imageUrl: null, legacyImageUrl: null })).toBe("a");
    expect(getProductCoverImage({ images: [], imageUrl: "/legacy.jpg", legacyImageUrl: null })).toBe("/legacy.jpg");
    expect(getProductCoverImage({ images: [], imageUrl: null, legacyImageUrl: null })).toBe(PRODUCT_IMAGE_FALLBACK);
  });

  it("uses the standard dish image when configured image fields are blank", () => {
    expect(getProductCoverImage({
      images: [{ id: "blank", url: "  ", sortOrder: 0 }],
      imageUrl: "",
      legacyImageUrl: null
    })).toBe("/assets/brand/dark.png");
  });
});
