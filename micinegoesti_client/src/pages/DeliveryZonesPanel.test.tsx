// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { DeliveryZonesPanel } from "./AdminPage";

vi.mock("../api/client", () => ({
  api: {
    updateSettings: vi.fn(() => Promise.resolve({ settings: {} }))
  }
}));

afterEach(cleanup);

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DeliveryZonesPanel
        settings={{
          minimumDeliveryOrderAmount: "50",
          deliveryZones: JSON.stringify([{
            id: "zona-lunga",
            name: "Negoești și localitățile învecinate",
            price: 12.5,
            description: "Include toate străzile și reperele cunoscute.",
            sortOrder: 1,
            isActive: true
          }])
        }}
        onDone={vi.fn()}
      />
    </QueryClientProvider>
  );
}

describe("DeliveryZonesPanel", () => {
  it("shows existing zones in a horizontal table", () => {
    renderPanel();
    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Zonă" })).toBeVisible();
    expect(screen.getByText("Negoești și localitățile învecinate")).toBeVisible();
    expect(screen.getByText("12.50 lei")).toBeVisible();
    expect(screen.getByText("Activă")).toBeVisible();
  });

  it("keeps zone creation separate from the table", () => {
    renderPanel();
    expect(screen.queryByLabelText("Numele zonei")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adaugă zonă" }));
    expect(screen.getByRole("heading", { name: "Adaugă zonă" })).toBeVisible();
    expect(screen.getByLabelText("Numele zonei")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("opens the zone editor only on request", () => {
    renderPanel();
    expect(screen.queryByLabelText("Numele zonei")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editează" }));
    expect(screen.getByRole("heading", { name: "Editează zona" })).toBeVisible();
    expect(screen.getByLabelText("Numele zonei")).toHaveValue("Negoești și localitățile învecinate");
    expect(screen.getByLabelText("Activă")).toBeChecked();
  });

  it("requires confirmation before deletion", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Șterge" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Ștergi zona de livrare?");
  });

  it("updates the delivery minimum from the zones panel", async () => {
    renderPanel();
    const input = screen.getByRole("spinbutton", { name: /Comandă minimă pentru livrare/ });
    expect(input).toHaveValue(50);

    fireEvent.change(input, { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvează pragul" }));

    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledWith({ minimumDeliveryOrderAmount: "75" });
    });
  });
});
