import { Router } from "express";
import { z } from "zod";
import { Role } from "../../constants.js";
import { asyncHandler } from "../../lib/http.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { requireRoles } from "../../middleware/auth.js";
import { getCheckoutPricing } from "../orders/orders.service.js";
import {
  cancelGameCampaign,
  createGameCampaign,
  finalizeGameCampaign,
  getAdminGameCampaignState,
  updateGameCampaign,
  updateGameRewardMode
} from "../game/game-campaigns.service.js";
import {
  approveVoucher,
  createManualVoucher,
  getGameRecordRuleWithRecord,
  issueCurrentRecordVoucher,
  listAdminVouchers,
  listMine,
  revokeVoucher,
  upsertGameRecordRule,
  validateVoucherForCheckout
} from "./vouchers.service.js";

export const vouchersRouter = Router();

const sessionSchema = z.string().trim().min(8).max(160);
const discountTypeSchema = z.enum(["percentage", "fixed_amount"]);

const gameRecordRuleSchema = z.object({
  enabled: z.boolean(),
  name: z.string().trim().min(2).max(120),
  discountType: discountTypeSchema,
  discountValue: z.number().positive(),
  maximumDiscount: z.number().nonnegative().nullable().optional(),
  minimumSubtotal: z.number().nonnegative().default(0),
  validityDays: z.number().int().positive().nullable().optional(),
  codePrefix: z.string().trim().min(2).max(16).default("RECORD")
});

const gameCampaignFieldsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  startsAt: z.string().datetime(),
  durationMinutes: z.number().int().min(1).max(525_600),
  firstPrizePercent: z.number().positive().max(100),
  secondPrizePercent: z.number().positive().max(100),
  thirdPrizePercent: z.number().positive().max(100),
  maximumDiscount: z.number().nonnegative().nullable().optional(),
  minimumSubtotal: z.number().nonnegative().default(0),
  validityDays: z.number().int().positive().nullable().optional(),
  codePrefix: z.string().trim().min(2).max(16).default("CAMPANIE")
});

const descendingCampaignPrizes = (input: {
  firstPrizePercent: number;
  secondPrizePercent: number;
  thirdPrizePercent: number;
}) =>
  input.firstPrizePercent >= input.secondPrizePercent
  && input.secondPrizePercent >= input.thirdPrizePercent;

const gameCampaignSchema = gameCampaignFieldsSchema.refine(
  descendingCampaignPrizes,
  {
    message: "Premiile trebuie să fie în ordine descrescătoare.",
    path: ["firstPrizePercent"]
  }
);

const gameCampaignUpdateSchema = gameCampaignFieldsSchema.omit({
  durationMinutes: true
}).extend({
  endsAt: z.string().datetime()
}).refine(
  descendingCampaignPrizes,
  {
    message: "Premiile trebuie să fie în ordine descrescătoare.",
    path: ["firstPrizePercent"]
  }
).refine(
  (input) => new Date(input.endsAt).getTime() > new Date(input.startsAt).getTime(),
  {
    message: "Finalul campaniei trebuie să fie după început.",
    path: ["endsAt"]
  }
);

const manualVoucherSchema = z.object({
  code: z.string().trim().max(40).nullable().optional(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(240).nullable().optional(),
  recipientType: z.enum(["public", "customer", "current_record_holder"]),
  userId: z.string().nullable().optional(),
  discountType: discountTypeSchema,
  discountValue: z.number().positive(),
  maximumDiscount: z.number().nonnegative().nullable().optional(),
  minimumSubtotal: z.number().nonnegative().default(0),
  validFrom: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  maxRedemptions: z.number().int().positive().default(1),
  activeImmediately: z.boolean().default(false)
});

const checkoutItemsSchema = z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1) })).optional();
const voucherValidationSchema = z.object({
  code: z.string().trim().min(1),
  cartId: z.string().optional(),
  sessionId: sessionSchema.optional(),
  items: checkoutItemsSchema,
  orderType: z.enum(["delivery", "pickup"]),
  deliveryZoneId: z.string().optional()
});

vouchersRouter.get(
  "/admin/voucher-rules/game-record",
  requireRoles(Role.ADMIN),
  asyncHandler(async (_req, res) => {
    res.json(await getGameRecordRuleWithRecord());
  })
);

vouchersRouter.put(
  "/admin/voucher-rules/game-record",
  requireRoles(Role.ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = gameRecordRuleSchema.parse(req.body);
    const rule = await upsertGameRecordRule(input, req.user!.id);
    res.json({ rule });
  })
);

vouchersRouter.get(
  "/admin/game-campaigns",
  requireRoles(Role.ADMIN),
  asyncHandler(async (_req, res) => {
    res.json(await getAdminGameCampaignState());
  })
);

vouchersRouter.post(
  "/admin/game-campaigns",
  requireRoles(Role.ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = gameCampaignSchema.parse(req.body);
    const campaign = await createGameCampaign(input, req.user!.id);
    res.status(201).json({ campaign });
  })
);

vouchersRouter.put(
  "/admin/game-campaigns/:id",
  requireRoles(Role.ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const campaignId = z.string().uuid().parse(req.params.id);
    const input = gameCampaignUpdateSchema.parse(req.body);
    const campaign = await updateGameCampaign(campaignId, input, req.user!.id);
    res.json({ campaign });
  })
);

vouchersRouter.post(
  "/admin/game-campaigns/:id/finalize",
  requireRoles(Role.ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const campaignId = z.string().uuid().parse(req.params.id);
    const result = await finalizeGameCampaign(campaignId, req.user!.id);
    res.json({ result });
  })
);

vouchersRouter.post(
  "/admin/game-campaigns/:id/cancel",
  requireRoles(Role.ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const campaignId = z.string().uuid().parse(req.params.id);
    const campaign = await cancelGameCampaign(campaignId, req.user!.id);
    res.json({ campaign });
  })
);

vouchersRouter.put(
  "/admin/game-reward-mode",
  requireRoles(Role.ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = z.object({
      mode: z.enum(["campaign", "instant_record"])
    }).parse(req.body);
    res.json(await updateGameRewardMode(input.mode, req.user!.id));
  })
);

vouchersRouter.get(
  "/admin/vouchers",
  requireRoles(Role.ADMIN),
  asyncHandler(async (req, res) => {
    const filters = z
      .object({
        search: z.string().optional(),
        status: z.string().optional(),
        source: z.string().optional(),
        recipient: z.string().optional()
      })
      .parse(req.query);
    res.json({ vouchers: await listAdminVouchers(filters) });
  })
);

vouchersRouter.post(
  "/admin/vouchers",
  requireRoles(Role.ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = manualVoucherSchema.parse(req.body);
    const voucher = await createManualVoucher(input, req.user!.id);
    res.status(201).json({ voucher });
  })
);

vouchersRouter.post(
  "/admin/vouchers/issue-current-record",
  requireRoles(Role.ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const voucher = await issueCurrentRecordVoucher(req.user!.id);
    res.status(201).json({ voucher });
  })
);

vouchersRouter.post(
  "/admin/vouchers/:id/approve",
  requireRoles(Role.ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const voucher = await approveVoucher(req.params.id, req.user!.id);
    res.json({ voucher });
  })
);

vouchersRouter.post(
  "/admin/vouchers/:id/revoke",
  requireRoles(Role.ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const voucher = await revokeVoucher(req.params.id, req.user!.id);
    res.json({ voucher });
  })
);

vouchersRouter.post(
  "/vouchers/validate",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = voucherValidationSchema.parse(req.body);
    const pricing = await getCheckoutPricing(input);
    const voucher = await validateVoucherForCheckout({
      code: input.code,
      subtotal: pricing.subtotal,
      deliveryCost: pricing.deliveryCost,
      userId: req.user?.id ?? null,
      sessionId: input.sessionId ?? null
    });
    res.json({ voucher });
  })
);

vouchersRouter.get(
  "/vouchers/mine",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = z.object({ sessionId: sessionSchema.optional() }).parse(req.query);
    res.json({ vouchers: await listMine({ userId: req.user?.id ?? null, sessionId: input.sessionId ?? null }) });
  })
);
