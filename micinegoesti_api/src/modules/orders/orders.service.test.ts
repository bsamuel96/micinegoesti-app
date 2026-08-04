import { describe, expect, it } from "vitest";
import {
  assertMinimumDeliveryOrderAmount,
  buildDeliveryRouteTracking,
  pickLeastBusyDeliverer
} from "./orders.service.js";

const assignedDelivery = {
  id: 42,
  order_type: "delivery",
  status: "out_for_delivery",
  assigned_deliverer_id: "driver-1",
  assignedDeliverer: { id: "driver-1", name: "Curier Test", phone: "+40740000000" },
  updated_at: "2026-07-24T10:00:00.000Z"
};

describe("buildDeliveryRouteTracking", () => {
  it("counts earlier active stops for the same deliverer", () => {
    const tracking = buildDeliveryRouteTracking(assignedDelivery, [
      { id: 40, assigned_deliverer_id: "driver-1", order_type: "delivery", status: "out_for_delivery", created_at: "2026-07-24T09:00:00.000Z" },
      { id: 41, assigned_deliverer_id: "driver-1", order_type: "delivery", status: "out_for_delivery", created_at: "2026-07-24T09:05:00.000Z" },
      { id: 42, assigned_deliverer_id: "driver-1", order_type: "delivery", status: "out_for_delivery", created_at: "2026-07-24T09:10:00.000Z" }
    ]);

    expect(tracking).toMatchObject({
      driverName: "Curier Test",
      locationLabel: "Curierul livrează opririle dinaintea ta.",
      ordersAhead: 2,
      routePosition: 3,
      routeSize: 3,
      isNextStop: false
    });
  });

  it("marks the customer as next when their order is first in route", () => {
    const tracking = buildDeliveryRouteTracking(assignedDelivery, [
      { id: 42, assigned_deliverer_id: "driver-1", order_type: "delivery", status: "out_for_delivery", created_at: "2026-07-24T09:00:00.000Z" }
    ]);

    expect(tracking).toMatchObject({
      locationLabel: "Curierul este pe drum spre tine.",
      ordersAhead: 0,
      routePosition: 1,
      routeSize: 1,
      isNextStop: true
    });
  });

  it("orders active stops by distance when the courier has a live position", () => {
    const tracking = buildDeliveryRouteTracking(
      assignedDelivery,
      [
        {
          id: 41,
          assigned_deliverer_id: "driver-1",
          order_type: "delivery",
          status: "out_for_delivery",
          created_at: "2026-07-24T09:00:00.000Z",
          map_pin_lat: 45.2,
          map_pin_lng: 27.2
        },
        {
          id: 42,
          assigned_deliverer_id: "driver-1",
          order_type: "delivery",
          status: "out_for_delivery",
          created_at: "2026-07-24T09:10:00.000Z",
          map_pin_lat: 44.401,
          map_pin_lng: 26.101
        }
      ],
      {
        lat: 44.4,
        lng: 26.1,
        accuracyMeters: 12,
        heading: null,
        speedMps: null,
        recordedAt: new Date().toISOString()
      }
    );

    expect(tracking).toMatchObject({
      routePosition: 1,
      ordersAhead: 0,
      isNextStop: true,
      courierLocation: { lat: 44.4, lng: 26.1 }
    });
    expect(tracking?.distanceKm).toBeLessThan(0.2);
  });
});

describe("pickLeastBusyDeliverer", () => {
  it("assigns a ready order to the active courier with the shortest route", () => {
    const selected = pickLeastBusyDeliverer(
      [
        { id: "driver-1", name: "Curier Unu" },
        { id: "driver-2", name: "Curier Doi" }
      ],
      [
        { assigned_deliverer_id: "driver-1" },
        { assigned_deliverer_id: "driver-1" },
        { assigned_deliverer_id: "driver-2" }
      ]
    );

    expect(selected?.id).toBe("driver-2");
  });

  it("uses a stable name-based choice when courier loads are equal", () => {
    const selected = pickLeastBusyDeliverer(
      [
        { id: "driver-2", name: "Zamfir" },
        { id: "driver-1", name: "Andrei" }
      ],
      []
    );

    expect(selected?.id).toBe("driver-1");
  });
});

describe("assertMinimumDeliveryOrderAmount", () => {
  it("rejects delivery when the product subtotal is below the configured minimum", () => {
    expect(() => assertMinimumDeliveryOrderAmount("delivery", 49.99, 50)).toThrow(
      "Comanda minimă pentru livrare este 50.00 lei în produse, fără taxa de livrare."
    );
  });

  it("allows an equal subtotal and does not apply the rule to pickup", () => {
    expect(() => assertMinimumDeliveryOrderAmount("delivery", 50, 50)).not.toThrow();
    expect(() => assertMinimumDeliveryOrderAmount("pickup", 1, 50)).not.toThrow();
  });
});
