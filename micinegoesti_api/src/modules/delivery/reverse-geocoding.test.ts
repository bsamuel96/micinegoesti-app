import { describe, expect, it } from "vitest";
import { formatRomanianAddress } from "./reverse-geocoding.js";

describe("reverse geocoding address formatting", () => {
  it("builds a concise Romanian delivery address", () => {
    expect(formatRomanianAddress({
      display_name: "fallback",
      address: { road: "Strada Exemplu", house_number: "12", city: "București", postcode: "030000" }
    })).toBe("Strada Exemplu 12, București, 030000");
  });

  it("falls back to the provider display name", () => {
    expect(formatRomanianAddress({ display_name: "Negoești, România" })).toBe("Negoești, România");
  });
});

