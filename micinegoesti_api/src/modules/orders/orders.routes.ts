import { Router } from "express";
import { z } from "zod";
import { Role, statusFromApi } from "../../constants.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { getSupabase } from "../../lib/supabase.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";
import {
  canReadOrder,
  completeKitchenOrder,
  confirmAndDispatchOrder,
  confirmKitchenOrder,
  createCheckoutOrder,
  getOrderByNumberAndPhone,
  getOrderByTrackingToken,
  getOrderRecord,
  listOrdersForRole,
  markOrderPaid,
  serializeOrderWithTracking,
  updateCourierDeliveryStage,
  updateCourierLocation,
  updateOrderStatus
} from "./orders.service.js";

export const ordersRouter = Router();

type CheckoutPayload = Parameters<typeof createCheckoutOrder>[0];

const checkoutSchema = z.object({
  cartId: z.string().optional(),
  sessionId: z.string().trim().min(8).max(160).optional(),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1) })).optional(),
  contact: z.object({
    fullName: z.string().min(2),
    phone: z.string().min(6),
    address: z.string().optional()
  }),
  orderType: z.enum(["delivery", "pickup"]),
  deliveryZoneId: z.string().optional(),
  notes: z.string().optional(),
  voucherCode: z.string().trim().max(40).optional().nullable(),
  location: z
    .object({
      lat: z.number(),
      lng: z.number()
    })
    .optional()
}).superRefine((value, context) => {
  if (value.orderType === "delivery" && !value.location) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["location"], message: "Selectează locația exactă pe hartă." });
  }
});

ordersRouter.post(
  "/checkout",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = checkoutSchema.parse(req.body) as CheckoutPayload;
    const order = await createCheckoutOrder(input, req);
    res.status(201).json({ order });
  })
);

ordersRouter.post(
  "/orders/track",
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        token: z.string().min(12).optional(),
        orderId: z.number().int().optional(),
        phone: z.string().min(6).optional()
      })
      .refine((value) => value.token || (value.orderId && value.phone), {
        message: "Folosește linkul de tracking sau numărul comenzii împreună cu telefonul."
      })
      .parse(req.body);

    const order = input.token
      ? await getOrderByTrackingToken(input.token)
      : await getOrderByNumberAndPhone(input.orderId!, input.phone!);

    res.json({ order });
  })
);

ordersRouter.get(
  "/orders/track/:token",
  asyncHandler(async (req, res) => {
    const order = await getOrderByTrackingToken(req.params.token);
    res.json({ order });
  })
);

ordersRouter.post(
  "/courier/location",
  requireRoles(Role.DELIVERER),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracyMeters: z.number().nonnegative().optional().nullable(),
      heading: z.number().min(0).max(360).optional().nullable(),
      speedMps: z.number().nonnegative().optional().nullable(),
      activeOrderId: z.number().int().positive().optional().nullable()
    }).parse(req.body);
    const location = await updateCourierLocation(req.user!.id, input);
    res.json({ location });
  })
);

ordersRouter.patch(
  "/orders/:id/delivery-stage",
  requireRoles(Role.DELIVERER),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) throw new HttpError(400, "Identificatorul comenzii nu este valid.");
    const input = z.object({ stage: z.enum(["en_route", "arrived"]) }).parse(req.body);
    const order = await updateCourierDeliveryStage(id, req.user!.id, input.stage);
    res.json({ order });
  })
);

ordersRouter.get(
  "/orders",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER, Role.KITCHEN, Role.DELIVERER),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const status = typeof req.query.status === "string" ? statusFromApi(req.query.status) : undefined;
    res.json({ orders: await listOrdersForRole(req, status) });
  })
);

ordersRouter.get(
  "/orders/:id",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER, Role.KITCHEN, Role.DELIVERER),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const order = await getOrderRecord(id);
    if (!canReadOrder(req, order)) throw new HttpError(404, "Order not found.");
    res.json({ order: await serializeOrderWithTracking(order) });
  })
);

ordersRouter.patch(
  "/orders/:id/status",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = z.object({ status: z.string(), note: z.string().optional() }).parse(req.body);
    const id = Number.parseInt(req.params.id, 10);
    const nextStatus = statusFromApi(input.status);
    const existing = await getOrderRecord(id);

    const isManager = req.user?.role === Role.ADMIN || req.user?.role === Role.STORE_MANAGER;
    const isKitchen =
      req.user?.role === Role.KITCHEN &&
      ((existing.status === "pending" && nextStatus === "confirmed") ||
        (existing.status === "confirmed" && nextStatus === "preparing") ||
        (existing.status === "preparing" &&
          ((existing.order_type === "pickup" && nextStatus === "ready_for_pickup") ||
            (existing.order_type === "delivery" && nextStatus === "out_for_delivery"))));
    const isAssignedDeliverer =
      req.user?.role === Role.DELIVERER &&
      existing.assigned_deliverer_id === req.user.id &&
      existing.order_type === "delivery" &&
      ["completed", "failed"].includes(nextStatus);

    if (!isManager && !isKitchen && !isAssignedDeliverer) {
      throw new HttpError(403, "Nu poți actualiza statusul acestei comenzi.");
    }
    if (isAssignedDeliverer && !existing.courier_arrived_at) {
      throw new HttpError(409, "Confirmă mai întâi sosirea la adresa clientului.");
    }

    if (req.user?.role === Role.KITCHEN && existing.status === "pending" && nextStatus === "confirmed") {
      res.json(await confirmKitchenOrder(id, req.user.id));
      return;
    }
    if (
      req.user?.role === Role.KITCHEN &&
      existing.status === "preparing" &&
      ((existing.order_type === "pickup" && nextStatus === "ready_for_pickup") ||
        (existing.order_type === "delivery" && nextStatus === "out_for_delivery"))
    ) {
      res.json(await completeKitchenOrder(id, req.user.id));
      return;
    }

    const order = await updateOrderStatus(id, nextStatus, req.user?.id, input.note);
    res.json({ order });
  })
);

ordersRouter.post(
  "/orders/:id/kitchen-confirm",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER, Role.KITCHEN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) throw new HttpError(400, "Identificatorul comenzii nu este valid.");
    res.json(await confirmKitchenOrder(id, req.user!.id));
  })
);

ordersRouter.post(
  "/orders/:id/kitchen-complete",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER, Role.KITCHEN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) throw new HttpError(400, "Identificatorul comenzii nu este valid.");
    res.json(await completeKitchenOrder(id, req.user!.id));
  })
);

ordersRouter.post(
  "/orders/:id/confirm-and-dispatch",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = z.object({ delivererId: z.string().optional() }).parse(req.body ?? {});
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) throw new HttpError(400, "Identificatorul comenzii nu este valid.");
    const order = await confirmAndDispatchOrder(id, req.user!.id, input.delivererId);
    res.json({ order });
  })
);

ordersRouter.patch(
  "/orders/:id/assign",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER),
  asyncHandler(async (req, res) => {
    const input = z.object({ delivererId: z.string() }).parse(req.body);
    const { data: deliverer, error: delivererError } = await getSupabase()
      .from("users")
      .select('id, role, "isActive"')
      .eq("id", input.delivererId)
      .eq("role", Role.DELIVERER)
      .eq("isActive", true)
      .maybeSingle();
    if (delivererError) throw new HttpError(500, "Nu am putut citi livratorul.", delivererError);
    if (!deliverer) throw new HttpError(400, "Deliverer not found.");

    const { error } = await getSupabase()
      .from("orders")
      .update({ assigned_deliverer_id: input.delivererId })
      .eq("id", Number.parseInt(req.params.id, 10));
    if (error) throw new HttpError(500, "Nu am putut asigna livratorul.", error);

    res.json({ order: await serializeOrderWithTracking(await getOrderRecord(Number.parseInt(req.params.id, 10))) });
  })
);

ordersRouter.post(
  "/orders/:id/mark-paid",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = z.object({ note: z.string().optional() }).parse(req.body ?? {});
    const order = await markOrderPaid(Number.parseInt(req.params.id, 10), req, input.note);
    res.json({ order });
  })
);
