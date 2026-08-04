import { describe, expect, it } from "vitest";
import { isValidNormalizedPhone, normalizePhone, toWhatsAppAddress } from "./phone.js";

describe("normalizePhone", () => {
  it.each([
    ["0757 400 356", "+40757400356"],
    ["757 400 356", "+40757400356"],
    ["40 757 400 356", "+40757400356"],
    ["+40 0757 400 356", "+40757400356"],
    ["0044 7700 900123", "+447700900123"],
    ["+33 6 12 34 56 78", "+33612345678"]
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("keeps WhatsApp addresses compatible with provider formatting", () => {
    expect(toWhatsAppAddress("whatsapp:+40 0757 400 356")).toBe("whatsapp:+40757400356");
  });

  it("validates the final E.164-shaped number", () => {
    expect(isValidNormalizedPhone("+40757400356")).toBe(true);
    expect(isValidNormalizedPhone("+40")).toBe(false);
  });
});
