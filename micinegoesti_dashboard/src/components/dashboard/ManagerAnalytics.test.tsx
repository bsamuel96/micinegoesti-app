// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Order } from "../../api/types";
import {
  buildManagerDashboardMetrics,
  filterOrdersByDashboardPeriod,
  ManagerAnalytics
} from "./ManagerAnalytics";

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    orderNumber: 1,
    contactName: "Client",
    phone: "+40740000000",
    orderType: "delivery",
    deliveryLabel: "Livrare",
    deliveryType: "delivery",
    status: { code: "completed", label: "Finalizată" },
    subtotal: 90,
    deliveryCost: 10,
    discountAmount: 0,
    total: 100,
    paymentStatus: "paid",
    steps: [],
    currentStepIndex: 0,
    items: [{ id: "item-1", name: "Mici", quantity: 3, unitPrice: 30, totalPrice: 90 }],
    statusHistory: [],
    statusLog: [],
    createdAt: "2026-07-30T10:00:00.000Z",
    updatedAt: "2026-07-30T10:30:00.000Z",
    ...overrides
  };
}

afterEach(cleanup);

describe("manager dashboard analytics", () => {
  it("filters orders using inclusive local calendar periods", () => {
    const orders = [
      order({ id: 1, createdAt: "2026-07-30T10:00:00.000Z" }),
      order({ id: 2, createdAt: "2026-07-24T10:00:00.000Z" }),
      order({ id: 3, createdAt: "2026-07-23T10:00:00.000Z" })
    ];

    expect(filterOrdersByDashboardPeriod(
      orders,
      { preset: "7days" },
      new Date("2026-07-30T12:00:00")
    ).map((item) => item.id)).toEqual([1, 2]);
  });

  it("separates completed orders, delivered orders, order value and collected money", () => {
    const metrics = buildManagerDashboardMetrics([
      order(),
      order({
        id: 2,
        orderType: "pickup",
        deliveryType: "pickup",
        total: 60,
        paymentStatus: "pending"
      }),
      order({
        id: 3,
        status: { code: "cancelled", label: "Anulată" },
        total: 500,
        paymentStatus: "pending"
      })
    ]);

    expect(metrics.totalOrders).toBe(3);
    expect(metrics.completedOrders).toBe(2);
    expect(metrics.deliveredOrders).toBe(1);
    expect(metrics.revenue).toBe(160);
    expect(metrics.collectedRevenue).toBe(100);
    expect(metrics.averageOrder).toBe(80);
    expect(metrics.cancelledOrders).toBe(1);
  });

  it("allows the manager to change the period and visible indicators", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    render(
      <ManagerAnalytics
        orders={[
          order({ id: 1, createdAt: new Date().toISOString() }),
          order({ id: 2, createdAt: yesterday.toISOString() })
        ]}
      />
    );

    expect(screen.getByText(/1 comandă/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Perioadă"), { target: { value: "7days" } });
    expect(screen.getByText(/2 comenzi/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Personalizează" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Anulate / eșuate" }));
    expect(screen.getByText("inclusiv rambursări")).toBeVisible();
  });
});
