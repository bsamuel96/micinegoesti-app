// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { CheckoutPage } from "./CheckoutPage";

vi.mock("../components/OrderTracker", () => ({ OrderTracker: () => <div /> }));
vi.mock("../components/DeliveryLocationMap", () => ({
  default: ({
    onLocationChange,
    onAddressResolved,
    onAddressResolutionChange
  }: {
    onLocationChange: (coordinates: { lat: number; lng: number }) => void;
    onAddressResolved: (address: string) => void;
    onAddressResolutionChange: (resolving: boolean) => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        onLocationChange({ lat: 44.4, lng: 26.1 });
        onAddressResolutionChange(true);
        onAddressResolved("Strada Exemplului 12, București 030000, România");
        onAddressResolutionChange(false);
      }}
    >
      Selectează pin test
    </button>
  )
}));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1", name: "Ana", phone: "+40740000000", role: "customer" } })
}));
vi.mock("../context/CartContext", () => ({
  useCart: () => ({
    lines: [{ product: { id: "product-1", name: "Meniu mici", price: 100 }, quantity: 1 }],
    cartId: "cart-1",
    sessionId: "session-123456",
    subtotal: 100,
    clear: vi.fn(),
    refreshLastOrder: vi.fn(() => Promise.resolve())
  })
}));
vi.mock("../api/client", () => ({
  api: {
    publicSettings: vi.fn(() => Promise.resolve({
      settings: {
        deliveryFee: 10,
        minimumDeliveryOrderAmount: 0,
        pickupEnabled: true,
        deliveryEnabled: true,
        deliveryZones: [{ id: "zona-1", name: "Zona 1", price: 10, isActive: true, sortOrder: 0 }],
        whatsappStoreNumber: "+40740000000",
        storeLocation: { lat: 44.4, lng: 26.1 },
        maxDeliveryRadiusKm: 15,
        pwaInstallPrompt: true
      }
    })),
    validateVoucher: vi.fn(),
    checkout: vi.fn()
  }
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderCheckout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CheckoutPage />
    </QueryClientProvider>
  );
}

describe("CheckoutPage voucher flow", () => {
  it("fills the complete address from the selected map pin before enabling checkout", async () => {
    renderCheckout();

    const submit = await screen.findByRole("button", { name: "Trimite comanda" });
    expect(submit).toBeDisabled();
    fireEvent.click(await screen.findByRole("button", { name: "Selectează pin test" }));

    expect(screen.getByLabelText(/Adresă completă/)).toHaveValue(
      "Strada Exemplului 12, București 030000, România"
    );
    expect(submit).toBeEnabled();
  });

  it("displays validated discount and final total", async () => {
    vi.mocked(api.validateVoucher).mockResolvedValueOnce({
      voucher: {
        code: "MICI-TEST10",
        status: "active",
        discountType: "percentage",
        discountValue: 15,
        maximumDiscount: null,
        minimumSubtotal: 0,
        subtotal: 100,
        discountAmount: 15,
        deliveryCost: 10,
        finalTotal: 95,
        expiresAt: null,
        message: "Voucherul MICI-TEST10 a fost aplicat."
      }
    });

    renderCheckout();
    fireEvent.change(await screen.findByPlaceholderText("MICI-AB12CD34"), { target: { value: "mici-test10" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplică" }));

    expect(await screen.findByText("Voucher MICI-TEST10")).toBeVisible();
    expect(screen.getByText("-15.00 lei")).toBeVisible();
    expect(screen.getByText("95.00 lei")).toBeVisible();
  });

  it("shows invalid voucher errors", async () => {
    vi.mocked(api.validateVoucher).mockRejectedValueOnce(new Error("Voucherul nu a fost găsit."));

    renderCheckout();
    fireEvent.change(await screen.findByPlaceholderText("MICI-AB12CD34"), { target: { value: "NU-EXISTA" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplică" }));

    await waitFor(() => expect(screen.getByText("Voucherul nu a fost găsit.")).toBeVisible());
  });

  it("blocks delivery below the dashboard-configured minimum", async () => {
    vi.mocked(api.publicSettings).mockResolvedValueOnce({
      settings: {
        deliveryFee: 10,
        minimumDeliveryOrderAmount: 150,
        pickupEnabled: true,
        deliveryEnabled: true,
        deliveryZones: [{ id: "zona-1", name: "Zona 1", price: 10, isActive: true, sortOrder: 0 }],
        whatsappStoreNumber: "+40740000000",
        storeLocation: { lat: 44.4, lng: 26.1 },
        maxDeliveryRadiusKm: 20,
        pwaInstallPrompt: true
      }
    });

    renderCheckout();
    fireEvent.click(await screen.findByRole("button", { name: "Selectează pin test" }));

    expect(screen.getByText("Comanda minimă pentru livrare este 150.00 lei. Mai adaugă 50.00 lei în produse.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Trimite comanda" })).toBeDisabled();
  });
});
