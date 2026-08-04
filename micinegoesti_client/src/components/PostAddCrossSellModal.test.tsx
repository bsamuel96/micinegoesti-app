// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { CartLine, Product } from "../api/types";
import { PostAddCrossSellModal } from "./PostAddCrossSellModal";

const cartState = vi.hoisted(() => ({
  lines: [] as CartLine[],
  subtotal: 0,
  add: vi.fn(),
  update: vi.fn(),
  remove: vi.fn()
}));

vi.mock("../context/CartContext", () => ({
  useCart: () => cartState
}));

function makeProduct(
  id: string,
  name: string,
  categorySlug: string,
  crossSellProductIds: string[] = []
): Product {
  return {
    id,
    slug: id,
    name,
    shortDescription: `${name} porție`,
    price: 10,
    isPublished: true,
    isAvailable: true,
    isTrashed: false,
    sortOrder: 0,
    crossSellProductIds,
    images: [],
    categories: [{
      id: `category-${categorySlug}`,
      slug: categorySlug,
      label: categorySlug,
      sortOrder: 0,
      isActive: true
    }]
  };
}

function renderModal(addedProduct: Product, onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  render(
    <MemoryRouter initialEntries={["/menu"]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route
            path="/menu"
            element={<PostAddCrossSellModal addedProduct={addedProduct} addedQuantity={2} onClose={onClose} />}
          />
          <Route path="/checkout" element={<h1>Checkout test</h1>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );

  return onClose;
}

afterEach(() => {
  cleanup();
  cartState.lines = [];
  cartState.subtotal = 0;
  cartState.add.mockReset();
  cartState.update.mockReset();
  cartState.remove.mockReset();
  document.body.style.overflow = "";
  vi.restoreAllMocks();
});

describe("PostAddCrossSellModal", () => {
  it("shows explicit recommendations first and controls the live order", async () => {
    const drink = makeProduct("drink", "Limonadă", "bauturi");
    const fries = makeProduct("fries", "Cartofi prăjiți", "garnituri");
    const meal = makeProduct("meal", "Meniu mici", "meniuri", [drink.id]);
    cartState.lines = [{ product: meal, quantity: 2 }];
    cartState.subtotal = 20;
    cartState.add.mockImplementation((product: Product, quantity = 1) => {
      cartState.lines = [...cartState.lines, { product, quantity }];
      cartState.subtotal += product.price * quantity;
    });
    vi.spyOn(api, "products").mockResolvedValue({ products: [meal, fries, drink] });

    renderModal(meal);

    expect(screen.getByRole("dialog", { name: "Adăugat în coș!" })).toBeVisible();
    expect(screen.getByText("Adăugat × 2")).toBeVisible();
    expect(screen.getAllByText("20.00 lei", { selector: ".post-add-order-totals strong" })).toHaveLength(2);
    const recommendationButtons = await screen.findAllByRole("button", { name: /Adaugă .* în coș/ });
    expect(recommendationButtons[0]).toHaveAccessibleName("Adaugă Limonadă în coș");
    expect(screen.getByRole("button", { name: "Adaugă Cartofi prăjiți în coș" })).toBeVisible();

    fireEvent.click(recommendationButtons[0]);
    expect(cartState.add).toHaveBeenCalledWith(drink, 1);
    expect(screen.getByText("Produsul Limonadă a fost adăugat în coș.")).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Adaugă Limonadă în coș" })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Crește cantitatea pentru Meniu mici" }));
    expect(cartState.update).toHaveBeenCalledWith(meal.id, 3);
    fireEvent.click(screen.getByRole("button", { name: "Șterge Meniu mici din coș" }));
    expect(cartState.remove).toHaveBeenCalledWith(meal.id);
  });

  it("closes with Escape and can continue directly to checkout", async () => {
    const meal = makeProduct("meal", "Meniu mici", "meniuri");
    cartState.lines = [{ product: meal, quantity: 1 }];
    cartState.subtotal = 10;
    vi.spyOn(api, "products").mockResolvedValue({ products: [meal] });
    const onClose = renderModal(meal);

    expect(screen.getByRole("button", { name: "Închide recomandările" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Vezi coșul și finalizează" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Checkout test" })).toBeVisible());
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
