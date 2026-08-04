import { describe, expect, it } from "vitest";
import { normalizeAllergenCodes, readAllergenCodes } from "./allergens.js";

describe("allergen code normalization", () => {
  it("deduplicates, converts and sorts all valid EU allergen codes", () => {
    expect(normalizeAllergenCodes(["14", 1, 7, 1])).toEqual([1, 7, 14]);
  });

  it("rejects codes outside the complete 1-14 EU list", () => {
    expect(() => normalizeAllergenCodes([0, 15])).toThrow(/1 și 14/);
  });

  it("keeps catalog reads available when old metadata is malformed", () => {
    expect(readAllergenCodes(["unknown"])).toEqual([]);
  });
});
