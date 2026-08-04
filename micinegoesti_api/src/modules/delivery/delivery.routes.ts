import { Router } from "express";
import { z } from "zod";
import { Role } from "../../constants.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { requireRoles } from "../../middleware/auth.js";
import {
  getDeliveryFee,
  getDeliveryZones,
  getMinimumDeliveryOrderAmount,
  getSetting,
  upsertSetting
} from "../settings/settings.routes.js";
import { isValidCoordinates } from "./delivery-location.js";
import { reverseGeocode } from "./reverse-geocoding.js";

export const deliveryRouter = Router();

deliveryRouter.get(
  "/delivery/reverse-geocode",
  asyncHandler(async (req, res) => {
    const coordinates = {
      lat: Number(req.query.lat),
      lng: Number(req.query.lng)
    };
    if (!isValidCoordinates(coordinates)) throw new HttpError(400, "Coordonatele selectate nu sunt valide.");
    res.json({ address: await reverseGeocode(coordinates) });
  })
);

deliveryRouter.get(
  "/delivery-settings",
  asyncHandler(async (_req, res) => {
    res.json({
      settings: {
        deliveryFee: await getDeliveryFee(),
        minimumDeliveryOrderAmount: await getMinimumDeliveryOrderAmount(),
        deliveryEnabled: (await getSetting("deliveryEnabled")) === "true",
        pickupEnabled: (await getSetting("pickupEnabled")) === "true",
        deliveryZones: await getDeliveryZones()
      }
    });
  })
);

deliveryRouter.patch(
  "/delivery-settings",
  requireRoles(Role.ADMIN),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        deliveryFee: z.number().nonnegative().optional(),
        minimumDeliveryOrderAmount: z.number().nonnegative().optional(),
        deliveryZones: z.string().optional(),
        deliveryEnabled: z.boolean().optional(),
        pickupEnabled: z.boolean().optional()
      })
      .parse(req.body);

    const entries = Object.entries(input).filter(([, value]) => value !== undefined);
    for (const [key, value] of entries) {
      await upsertSetting(key, value);
    }

    res.json({
      settings: {
        deliveryFee: await getDeliveryFee(),
        minimumDeliveryOrderAmount: await getMinimumDeliveryOrderAmount(),
        deliveryEnabled: (await getSetting("deliveryEnabled")) === "true",
        pickupEnabled: (await getSetting("pickupEnabled")) === "true",
        deliveryZones: await getDeliveryZones()
      }
    });
  })
);
