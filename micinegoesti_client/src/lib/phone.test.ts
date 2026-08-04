import { describe, expect, it } from "vitest";
import { normalizePhoneForSubmit } from "./phone";

describe("normalizePhoneForSubmit", () => {
  it("uses Romania for a local number", () => {
    expect(normalizePhoneForSubmit("757 400 356")).toBe("+40757400356");
  });

  it("lets the user edit the country code", () => {
    expect(normalizePhoneForSubmit("+33 6 12 34 56 78")).toBe("+33612345678");
  });

  it("removes a Romanian trunk zero after +40", () => {
    expect(normalizePhoneForSubmit("+40 0757 400 356")).toBe("+40757400356");
  });

  it("rejects an incomplete prefix", () => {
    expect(() => normalizePhoneForSubmit("+40")).toThrow("număr complet");
  });
});
