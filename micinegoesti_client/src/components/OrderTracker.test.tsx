// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Order } from "../api/types";
import { OrderTracker } from "./OrderTracker";

vi.mock("./GrillRunnerGame", () => ({
  GrillRunnerGame: () => <div data-testid="waiting-game" />
}));

vi.mock("./LiveDeliveryMap", () => ({
  LiveDeliveryMap: ({ label }: { label: string }) => <div aria-label={label} />
}));

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 42,
    orderNumber: 42,
    contactName: "Alex Popescu",
    phone: "+40740111222",
    address: "Strada Clientului 10",
    orderType: "delivery",
    deliveryLabel: "Livrare",
    deliveryType: "delivery",
    status: { code: "out_for_delivery", label: "În livrare" },
    subtotal: 90,
    deliveryCost: 10,
    discountAmount: 0,
    voucherCode: null,
    voucher: null,
    total: 100,
    paymentStatus: "unpaid",
    notes: null,
    mapPin: { lat: 44.4, lng: 26.1 },
    mapUrl: "https://www.google.com/maps/search/?api=1&query=44.4%2C26.1",
    deliveryDistanceKm: 2.4,
    isOutsideDeliveryArea: false,
    assignedDeliverer: { id: "driver-1", name: "Curier Test", phone: "+40740000000" },
    deliveryTracking: {
      driverName: "Curier Test",
      driverPhone: "+40740000000",
      locationLabel: "Curierul livrează opririle dinaintea ta.",
      ordersAhead: 2,
      routePosition: 3,
      routeSize: 5,
      isNextStop: false,
      distanceKm: 2.1,
      courierLocation: null,
      updatedAt: "2026-07-24T10:00:00.000Z"
    },
    steps: [
      { code: "pending", label: "Comandă plasată" },
      { code: "confirmed", label: "Confirmată" },
      { code: "preparing", label: "În preparare" },
      { code: "out_for_delivery", label: "În livrare" },
      { code: "completed", label: "Livrată" }
    ],
    currentStepIndex: 3,
    items: [{ id: "item-1", productId: "product-1", name: "Meniu mici", quantity: 2, unitPrice: 45, totalPrice: 90 }],
    statusHistory: [],
    statusLog: [],
    trackingUrl: "/track?token=test-token",
    createdAt: "2026-07-24T09:00:00.000Z",
    updatedAt: "2026-07-24T10:00:00.000Z",
    ...overrides
  };
}

describe("OrderTracker", () => {
  it("shows courier position and how many deliveries are ahead", () => {
    render(<OrderTracker order={order()} />);

    const route = screen.getByRole("region", { name: "Status livrare" });
    expect(within(route).getByText("Curier Test")).toBeVisible();
    expect(within(route).getAllByText("Curierul livrează opririle dinaintea ta.")).toHaveLength(2);
    expect(within(route).getByText("2 comenzi înaintea ta")).toBeVisible();
    expect(within(route).getByText("Oprirea 3 din 5")).toBeVisible();
  });

  it("tells the customer when they are the next delivery", () => {
    render(<OrderTracker order={order({
      deliveryTracking: {
        driverName: "Curier Test",
        driverPhone: "+40740000000",
        locationLabel: "Curierul este pe drum spre tine.",
        ordersAhead: 0,
        routePosition: 1,
        routeSize: 1,
        isNextStop: true,
        distanceKm: 0.8,
        courierLocation: null,
        updatedAt: "2026-07-24T10:00:00.000Z"
      }
    })} />);

    expect(screen.getByText("Tu ești următoarea livrare")).toBeVisible();
    expect(screen.getAllByText("Curierul este pe drum spre tine.")).toHaveLength(2);
  });

  it("shows the courier's fresh live position on the customer map", () => {
    render(<OrderTracker order={order({
      deliveryTracking: {
        driverName: "Curier Test",
        driverPhone: "+40740000000",
        locationLabel: "Curierul este pe drum spre tine.",
        ordersAhead: 0,
        routePosition: 1,
        routeSize: 1,
        isNextStop: true,
        distanceKm: 0.42,
        courierLocation: {
          lat: 44.39,
          lng: 26.09,
          accuracyMeters: 12,
          heading: null,
          speedMps: null,
          recordedAt: "2026-07-24T10:00:00.000Z"
        },
        updatedAt: "2026-07-24T10:00:00.000Z"
      }
    })} />);

    expect(screen.getByText("Curier live pe hartă")).toBeVisible();
    expect(screen.getByLabelText("Poziția live a curierului")).toBeVisible();
    expect(screen.getByText("La aproximativ 420 m în linie dreaptă.")).toBeVisible();
  });
});
