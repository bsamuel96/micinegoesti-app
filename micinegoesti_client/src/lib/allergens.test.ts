import { describe, expect, it } from "vitest";
import { EU_ALLERGENS, allergenLabels } from "./allergens";

describe("EU allergen legend", () => {
  it("contains the complete numbered list from 1 to 14", () => {
    expect(EU_ALLERGENS.map((allergen) => allergen.code)).toEqual(
      Array.from({ length: 14 }, (_, index) => index + 1)
    );
  });

  it("maps selected codes to the labels shown on the frontend", () => {
    expect(allergenLabels([1, 7, 10]).map((allergen) => allergen.label)).toEqual([
      "Gluten",
      "Lapte",
      "Muștar"
    ]);
  });
});
