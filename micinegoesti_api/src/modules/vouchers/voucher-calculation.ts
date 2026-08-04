export type VoucherDiscountType = "percentage" | "fixed_amount";
export type VoucherStatus = "pending" | "active" | "redeemed" | "revoked" | "expired";

export type VoucherSnapshot = {
  status: VoucherStatus;
  discountType: VoucherDiscountType;
  discountValue: number;
  maximumDiscount?: number | null;
  minimumSubtotal: number;
  validFrom?: string | null;
  expiresAt?: string | null;
  maxRedemptions: number;
  redemptionCount: number;
  userId?: string | null;
  sessionKey?: string | null;
};

export class VoucherValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function normalizeVoucherCode(value: string) {
  return value.trim().toUpperCase();
}

export function isValidVoucherCode(value: string) {
  return /^[A-Z0-9][A-Z0-9-]{3,39}$/.test(normalizeVoucherCode(value));
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateVoucherDiscount({
  discountType,
  discountValue,
  maximumDiscount,
  minimumSubtotal,
  subtotal
}: {
  discountType: VoucherDiscountType;
  discountValue: number;
  maximumDiscount?: number | null;
  minimumSubtotal?: number | null;
  subtotal: number;
}) {
  const safeSubtotal = roundMoney(Math.max(0, subtotal));
  const safeMinimum = roundMoney(Math.max(0, minimumSubtotal ?? 0));
  if (safeSubtotal < safeMinimum) {
    throw new VoucherValidationError("Subtotalul minim pentru voucher nu a fost atins.");
  }

  const rawDiscount =
    discountType === "percentage"
      ? safeSubtotal * Math.max(0, discountValue) / 100
      : Math.max(0, discountValue);
  const cappedDiscount = maximumDiscount != null ? Math.min(rawDiscount, Math.max(0, maximumDiscount)) : rawDiscount;

  return roundMoney(Math.min(cappedDiscount, safeSubtotal));
}

export function assertVoucherUsable(
  voucher: VoucherSnapshot,
  context: {
    subtotal: number;
    userId?: string | null;
    sessionId?: string | null;
    now?: Date;
  }
) {
  const now = context.now ?? new Date();

  if (voucher.status === "pending") {
    throw new VoucherValidationError("Voucherul așteaptă aprobarea administratorului.");
  }
  if (voucher.status === "revoked" || voucher.status === "expired") {
    throw new VoucherValidationError("Voucherul nu mai este activ.");
  }
  if (voucher.status === "redeemed" || voucher.redemptionCount >= voucher.maxRedemptions) {
    throw new VoucherValidationError("Voucherul a fost deja folosit.");
  }
  if (voucher.status !== "active") {
    throw new VoucherValidationError("Voucherul nu este activ.");
  }
  if (voucher.validFrom && now < new Date(voucher.validFrom)) {
    throw new VoucherValidationError("Voucherul nu este încă activ.");
  }
  if (voucher.expiresAt && now > new Date(voucher.expiresAt)) {
    throw new VoucherValidationError("Voucherul a expirat.");
  }
  if (voucher.userId && voucher.userId !== context.userId) {
    throw new VoucherValidationError("Voucherul aparține altui client.");
  }
  if (!voucher.userId && voucher.sessionKey && voucher.sessionKey !== context.sessionId) {
    throw new VoucherValidationError("Voucherul aparține altei sesiuni.");
  }

  return calculateVoucherDiscount({
    discountType: voucher.discountType,
    discountValue: voucher.discountValue,
    maximumDiscount: voucher.maximumDiscount,
    minimumSubtotal: voucher.minimumSubtotal,
    subtotal: context.subtotal
  });
}

export function finalTotalAfterVoucher(subtotal: number, discountAmount: number, deliveryCost: number) {
  return roundMoney(Math.max(0, roundMoney(subtotal) - roundMoney(discountAmount)) + Math.max(0, roundMoney(deliveryCost)));
}
