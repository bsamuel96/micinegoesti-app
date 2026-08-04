import { describe, expect, it } from "vitest";
import {
  assertVoucherUsable,
  calculateVoucherDiscount,
  finalTotalAfterVoucher,
  VoucherValidationError,
  type VoucherSnapshot
} from "./voucher-calculation.js";

const activeVoucher: VoucherSnapshot = {
  status: "active",
  discountType: "percentage",
  discountValue: 20,
  maximumDiscount: null,
  minimumSubtotal: 0,
  validFrom: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-12-31T23:59:59.000Z",
  maxRedemptions: 1,
  redemptionCount: 0,
  userId: null,
  sessionKey: null
};

describe("voucher calculation", () => {
  it("calculates percentage discounts", () => {
    expect(calculateVoucherDiscount({ discountType: "percentage", discountValue: 15, subtotal: 100 })).toBe(15);
  });

  it("calculates fixed discounts", () => {
    expect(calculateVoucherDiscount({ discountType: "fixed_amount", discountValue: 12.5, subtotal: 100 })).toBe(12.5);
  });

  it("rejects orders below the minimum subtotal", () => {
    expect(() => calculateVoucherDiscount({ discountType: "percentage", discountValue: 10, minimumSubtotal: 75, subtotal: 50 })).toThrow(
      "Subtotalul minim pentru voucher nu a fost atins."
    );
  });

  it("applies maximum discount caps", () => {
    expect(calculateVoucherDiscount({ discountType: "percentage", discountValue: 50, maximumDiscount: 20, subtotal: 100 })).toBe(20);
  });

  it("never discounts more than the product subtotal", () => {
    expect(calculateVoucherDiscount({ discountType: "fixed_amount", discountValue: 200, subtotal: 70 })).toBe(70);
    expect(finalTotalAfterVoucher(70, 70, 10)).toBe(10);
  });

  it("rejects pending, revoked, expired and exhausted vouchers", () => {
    expect(() => assertVoucherUsable({ ...activeVoucher, status: "pending" }, { subtotal: 100, now: new Date("2026-06-01") })).toThrow("așteaptă aprobarea");
    expect(() => assertVoucherUsable({ ...activeVoucher, status: "revoked" }, { subtotal: 100, now: new Date("2026-06-01") })).toThrow("nu mai este activ");
    expect(() => assertVoucherUsable({ ...activeVoucher, expiresAt: "2026-01-01T00:00:00.000Z" }, { subtotal: 100, now: new Date("2026-06-01") })).toThrow("a expirat");
    expect(() => assertVoucherUsable({ ...activeVoucher, redemptionCount: 1 }, { subtotal: 100, now: new Date("2026-06-01") })).toThrow("deja folosit");
  });

  it("enforces user and session ownership", () => {
    expect(() => assertVoucherUsable({ ...activeVoucher, userId: "user-1" }, { subtotal: 100, userId: "user-2", now: new Date("2026-06-01") })).toThrow("altui client");
    expect(() => assertVoucherUsable({ ...activeVoucher, sessionKey: "session-a" }, { subtotal: 100, sessionId: "session-b", now: new Date("2026-06-01") })).toThrow("altei sesiuni");
  });

  it("throws typed validation errors", () => {
    try {
      assertVoucherUsable({ ...activeVoucher, status: "redeemed" }, { subtotal: 100, now: new Date("2026-06-01") });
    } catch (error) {
      expect(error).toBeInstanceOf(VoucherValidationError);
    }
  });
});
