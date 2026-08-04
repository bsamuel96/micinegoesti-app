// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { CartLine, Product } from "../api/types";
import { CartUpsellPage } from "./CartUpsellPage";

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

function product(id: string, name: string, category: string, crossSellProductIds: string[] = []): Product {
  return {
    id,
    slug: name.toLowerCase().replace(/ /g, "-"),
    name,
    price: 20,
    isPublished: true,
    isAvailable: true,
    sortOrder: 0,
    crossSellProductIds,
    images: [],
    categories: [{ id: `category-${category}`, slug: category, label: category, sortOrder: 0, isActive: true }]
  };
}

function renderUpsellPage() {
  render(
    <MemoryRouter initialEntries={["/cart/upsell"]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Routes>
          <Route path="/cart/upsell" element={<CartUpsellPage />} />
          <Route path="/cart" element={<h1>Coș test</h1>} />
          <Route path="/checkout" element={<h1>Checkout test</h1>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("CartUpsellPage", () => {
  it("uses the shared recommendation screen with cart-specific context", async () => {
    const drink = product("drink", "Limonadă", "bauturi");
    const fries = product("fries", "Cartofi prăjiți", "garnituri");
    const meal = product("meal", "Meniu mici", "meniuri", [drink.id]);
    cartState.lines = [{ product: meal, quantity: 1 }];
    cartState.subtotal = 20;
    vi.spyOn(api, "products").mockResolvedValue({ products: [meal, drink, fries] });

    renderUpsellPage();

    expect(screen.getByRole("dialog", { name: "Completează comanda" })).toBeVisible();
    expect(screen.getByRole("complementary", { name: "Rezumatul coșului" })).toBeVisible();
    expect(screen.getByText("Recomandările sunt alese după produsele pe care le ai deja în coș.")).toBeVisible();
    const recommendationButtons = await screen.findAllByRole("button", { name: /Adaugă .* în coș/ });
    expect(recommendationButtons[0]).toHaveAccessibleName("Adaugă Limonadă în coș");
    expect(screen.queryByRole("button", { name: "Adaugă Meniu mici în coș" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuă la checkout" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Înapoi la coș" }));
    expect(screen.getByRole("heading", { name: "Coș test" })).toBeVisible();
  });

  it("does not offer a side dish that is already in the cart", async () => {
    const drink = product("drink", "Limonadă", "bauturi");
    const fries = product("fries", "Cartofi prăjiți", "garnituri");
    const meal = product("meal", "Meniu mici", "meniuri", [drink.id, fries.id]);
    cartState.lines = [
      { product: meal, quantity: 1 },
      { product: fries, quantity: 1 }
    ];
    cartState.subtotal = 40;
    vi.spyOn(api, "products").mockResolvedValue({ products: [meal, drink, fries] });

    renderUpsellPage();

    expect(await screen.findByRole("button", { name: "Adaugă Limonadă în coș" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Adaugă Cartofi prăjiți în coș" })).not.toBeInTheDocument();
  });
});
