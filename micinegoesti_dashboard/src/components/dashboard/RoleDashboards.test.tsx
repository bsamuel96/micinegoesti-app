// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "../../api/types";
import { api } from "../../api/client";
import { DriverDashboard, KitchenDashboard, ManagerDashboard } from "./RoleDashboards";

vi.mock("../../api/client", () => ({
  api: {
    markPaid: vi.fn(() => Promise.resolve({ order: {} })),
    updateOrderStatus: vi.fn(() => Promise.resolve({ order: {} })),
    updateCourierLocation: vi.fn(() => Promise.resolve({ location: {} })),
    updateCourierDeliveryStage: vi.fn((id: number) => Promise.resolve({ order: { id } })),
    confirmAndDispatchOrder: vi.fn(() => Promise.resolve({ order: {} })),
    confirmKitchenOrder: vi.fn((id: number) => Promise.resolve({
      order: { id, orderType: "delivery" },
      customerNotification: {
        channel: "whatsapp",
        status: "sent",
        message: "Comanda a fost confirmată, iar clientul a fost notificat pe WhatsApp."
      }
    })),
    completeKitchenOrder: vi.fn((id: number) => Promise.resolve({
      order: {
        id,
        orderType: "delivery",
        assignedDeliverer: { id: "driver-1", name: "Curier Test", phone: "+40740000000" }
      }
    }))
  }
}));

vi.mock("../LiveDeliveryMap", () => ({
  LiveDeliveryMap: ({ label }: { label?: string }) => <div aria-label={label ?? "Hartă live a livrării"} />
}));

beforeEach(() => {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((success: PositionCallback) => {
        success({
          coords: {
            latitude: 44.4,
            longitude: 26.1,
            accuracy: 12,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON: () => ({})
          },
          timestamp: Date.now(),
          toJSON: () => ({})
        } as GeolocationPosition);
        return 1;
      }),
      clearWatch: vi.fn()
    }
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 1042,
    orderNumber: 1042,
    contactName: "Alexandru Popescu cu un nume foarte lung",
    phone: "+40740111222",
    address: "Strada Exemplului 123, bloc foarte lung, intrarea dinspre parc",
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
    paymentStatus: "pending",
    notes: "Sunați la interfon și așteptați în fața intrării principale.",
    mapPin: { lat: 44.4, lng: 26.1 },
    mapUrl: "https://www.google.com/maps/search/?api=1&query=44.4%2C26.1",
    assignedDeliverer: { id: "driver-1", name: "Curier Test", phone: "+40740000000" },
    steps: [],
    currentStepIndex: 0,
    items: [{ id: "item-1", productId: "product-1", name: "Meniu de mici cu o denumire lungă", quantity: 3, unitPrice: 30, totalPrice: 90 }],
    statusHistory: [],
    statusLog: [],
    createdAt: "2026-07-23T10:00:00.000Z",
    updatedAt: "2026-07-23T10:00:00.000Z",
    ...overrides
  };
}

function renderDashboard(orders: Order[]) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DriverDashboard
        orders={orders}
        driverName="Curier Test"
        onRefresh={vi.fn()}
        refreshing={false}
      />
    </QueryClientProvider>
  );
}

function renderManagerDashboard(orders: Order[], users: Array<{ id: string; phone: string; name?: string | null; role: "deliverer"; isActive: boolean }>) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ManagerDashboard orders={orders} users={users} onSelect={vi.fn()} />
    </QueryClientProvider>
  );
}

function renderKitchenDashboard(orders: Order[]) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <KitchenDashboard orders={orders} onSelect={vi.fn()} />
    </QueryClientProvider>
  );
}

describe("DriverDashboard", () => {
  it("shows all order details before exposing arrival and payment actions", () => {
    renderDashboard([order()]);
    expect(screen.getByText("Alexandru Popescu cu un nume foarte lung")).toBeVisible();
    expect(screen.getByText(/Strada Exemplului 123/)).toBeVisible();
    expect(screen.getByText("Meniu de mici cu o denumire lungă")).toBeVisible();
    expect(screen.getByRole("button", { name: "Începe livrarea" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Marchează plătită" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sună" })).toHaveAttribute("href", "tel:+40740111222");
  });

  it("reveals payment after arrival, then completes the order as a separate action", async () => {
    renderDashboard([order()]);
    fireEvent.click(screen.getByRole("button", { name: "Începe livrarea" }));
    expect(await screen.findByRole("button", { name: "Am ajuns la adresă" })).toBeVisible();
    expect(api.updateCourierDeliveryStage).toHaveBeenCalledWith(1042, "en_route");
    expect(screen.queryByRole("button", { name: "Marchează plătită" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Am ajuns la adresă" }));
    expect(await screen.findByText("Sumă de încasat")).toBeVisible();
    expect(api.updateCourierDeliveryStage).toHaveBeenCalledWith(1042, "arrived");
    expect(screen.getByText("100.00 lei")).toBeVisible();
    expect(screen.getByRole("button", { name: "Finalizează livrarea" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Marchează plătită" }));

    await waitFor(() => expect(api.markPaid).toHaveBeenCalledWith(1042));
    expect(screen.getByRole("button", { name: "Finalizează livrarea" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Finalizează livrarea" }));
    await waitFor(() => expect(api.updateOrderStatus).toHaveBeenCalledWith(1042, "completed"));
  });

  it("focuses the active order closest to the courier", async () => {
    renderDashboard([
      order({ id: 1042, orderNumber: 1042, mapPin: { lat: 45.2, lng: 27.2 } }),
      order({ id: 1043, orderNumber: 1043, contactName: "Client apropiat", mapPin: { lat: 44.401, lng: 26.101 } })
    ]);

    expect(await screen.findByText("Comanda #1043 · cea mai apropiată")).toBeVisible();
    expect(screen.getByText("Client apropiat")).toBeVisible();
  });

  it("restores an arrived delivery after a page refresh", () => {
    renderDashboard([order({
      deliveryStartedAt: "2026-07-23T10:05:00.000Z",
      courierArrivedAt: "2026-07-23T10:15:00.000Z"
    })]);

    expect(screen.getByText("Sosire confirmată")).toBeVisible();
    expect(screen.getByRole("button", { name: "Marchează plătită" })).toBeVisible();
  });

  it("renders a deliberate empty state", () => {
    renderDashboard([]);
    expect(screen.getByText("Nu ai livrări active")).toBeVisible();
    expect(screen.getByRole("button", { name: "Actualizează" })).toBeEnabled();
  });
});

describe("ManagerDashboard", () => {
  it("shows new orders without taking confirmation away from the kitchen", () => {
    const pendingOrder = order({ status: { code: "pending", label: "Comandă plasată" } });
    renderManagerDashboard([pendingOrder], [{ id: "driver-1", phone: "+40740000000", name: "Curier Test", role: "deliverer", isActive: true }]);

    expect(screen.getByRole("heading", { name: "Comenzi noi" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Confirmă/ })).not.toBeInTheDocument();
    expect(api.confirmAndDispatchOrder).not.toHaveBeenCalled();
  });
});

describe("KitchenDashboard", () => {
  it("confirms a pending order and reports the customer notification", async () => {
    const pendingOrder = order({ status: { code: "pending", label: "Comandă plasată" } });
    renderKitchenDashboard([pendingOrder]);

    expect(screen.getByRole("alert")).toHaveTextContent("Comandă nouă în așteptare");
    fireEvent.click(screen.getByRole("button", { name: "Confirmă comanda" }));

    await waitFor(() => expect(api.confirmKitchenOrder).toHaveBeenCalledWith(pendingOrder.id));
    expect(await screen.findByText("Comanda a fost confirmată, iar clientul a fost notificat pe WhatsApp.")).toBeVisible();
  });

  it("marks a prepared delivery as done so it can reach the assigned driver", async () => {
    const preparingOrder = order({ status: { code: "preparing", label: "În preparare" } });
    renderKitchenDashboard([preparingOrder]);

    fireEvent.click(screen.getByRole("button", { name: "Marchează gata" }));

    await waitFor(() => expect(api.completeKitchenOrder).toHaveBeenCalledWith(preparingOrder.id));
    expect(await screen.findByText(/a fost predată curierului Curier Test/)).toBeVisible();
  });
});
