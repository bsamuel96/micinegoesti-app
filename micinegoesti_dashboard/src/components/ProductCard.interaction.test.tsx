// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "../api/types";
import { ProductCard } from "./ProductCard";

const cart = vi.hoisted(() => ({
  add: vi.fn()
}));

vi.mock("../context/CartContext", () => ({
  useCart: () => cart
}));

vi.mock("./PostAddCrossSellModal", () => ({
  PostAddCrossSellModal: ({
    addedProduct,
    addedQuantity,
    onClose
  }: {
    addedProduct: Product;
    addedQuantity: number;
    onClose: () => void;
  }) => (
    <section role="dialog" aria-label="Recomandări după adăugare">
      <h2>Adăugat în coș!</h2>
      <p>{addedProduct.name} × {addedQuantity}</p>
      <button type="button" onClick={onClose}>Continuă cumpărăturile</button>
    </section>
  )
}));

const product: Product = {
  id: "product-1",
  slug: "meniul-casei",
  name: "Meniul casei",
  shortDescription: "Mici, cartofi și sos",
  description: "O porție generoasă, pregătită proaspăt la comandă.",
  price: 34.5,
  isPublished: true,
  isAvailable: true,
  allergenCodes: [1, 7, 10],
  sortOrder: 1,
  images: [],
  categories: []
};

beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("ProductCard information view", () => {
  it("flips from the information button and shows description plus explicit allergens", () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>
    );

    const infoButton = screen.getByRole("button", { name: "Informații despre Meniul casei" });
    expect(infoButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(infoButton);

    expect(infoButton.closest("article")).toHaveClass("is-flipped");
    expect(infoButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("O porție generoasă, pregătită proaspăt la comandă.")).toBeVisible();
    expect(screen.getByText("1. Gluten")).toBeVisible();
    expect(screen.getByText("cereale care conțin gluten")).toBeVisible();
    expect(screen.getByText("7. Lapte")).toBeVisible();
    expect(screen.getByText("lapte și produse derivate, inclusiv lactoză")).toBeVisible();
    expect(screen.getByText("10. Muștar")).toBeVisible();
    expect(screen.getByText("muștar și produse derivate")).toBeVisible();
    expect(screen.queryByText("Alergeni (UE): 1, 7, 10")).not.toBeInTheDocument();
  });

  it("adds the selected quantity when the cart button is pressed", () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>
    );

    const decrease = screen.getByRole("button", { name: "Elimină o porție de Meniul casei" });
    const increase = screen.getByRole("button", { name: "Adaugă o porție de Meniul casei" });
    const addToCart = screen.getByRole("button", { name: "Adaugă în coș Meniul casei" });
    expect(decrease).toBeDisabled();
    expect(addToCart).toBeDisabled();
    expect(screen.getByLabelText("Cantitate selectată: 0")).toHaveTextContent("0");

    fireEvent.click(increase);
    fireEvent.click(increase);
    expect(screen.getByLabelText("Cantitate selectată: 2")).toHaveTextContent("2");
    expect(cart.add).not.toHaveBeenCalled();

    fireEvent.click(addToCart);

    expect(cart.add).toHaveBeenCalledWith(product, 2);
    expect(screen.getByLabelText("Cantitate selectată: 0")).toHaveTextContent("0");
    expect(addToCart).toBeDisabled();
    expect(addToCart.closest("article")).not.toHaveClass("is-flipped");
    expect(screen.getByRole("dialog", { name: "Recomandări după adăugare" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Adăugat în coș!" })).toBeVisible();
    expect(screen.getByText("Meniul casei × 2")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Continuă cumpărăturile" }));

    expect(screen.queryByRole("dialog", { name: "Recomandări după adăugare" })).not.toBeInTheDocument();
  });

  it("does not add or flip when the cart quantity is zero", () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>
    );

    const addToCart = screen.getByRole("button", { name: "Adaugă în coș Meniul casei" });
    const card = addToCart.closest("article");
    expect(addToCart).toBeDisabled();

    fireEvent.click(addToCart);

    expect(cart.add).not.toHaveBeenCalled();
    expect(card).not.toHaveClass("is-flipped");
    expect(screen.queryByRole("dialog", { name: "Recomandări după adăugare" })).not.toBeInTheDocument();
  });

  it("opens the post-add cross-sell modal immediately", () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Adaugă o porție de Meniul casei" }));
    fireEvent.click(screen.getByRole("button", { name: "Adaugă în coș Meniul casei" }));

    expect(screen.getByRole("dialog", { name: "Recomandări după adăugare" })).toBeVisible();
  });

  it("does not restart the confirmation prompt inside the cross-sell journey", () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} promptAfterAdd={false} />
      </MemoryRouter>
    );

    const card = screen.getByRole("button", { name: "Adaugă în coș Meniul casei" }).closest("article");
    fireEvent.click(screen.getByRole("button", { name: "Adaugă o porție de Meniul casei" }));
    fireEvent.click(screen.getByRole("button", { name: "Adaugă în coș Meniul casei" }));

    expect(card).not.toHaveClass("is-flipped");
    expect(screen.queryByRole("dialog", { name: "Recomandări după adăugare" })).not.toBeInTheDocument();
  });

  it("closes the information side after an outside click", () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>
    );

    const infoButton = screen.getByRole("button", { name: "Informații despre Meniul casei" });
    fireEvent.click(infoButton);
    expect(infoButton.closest("article")).toHaveClass("is-flipped");

    fireEvent.pointerDown(document.body);

    expect(infoButton.closest("article")).not.toHaveClass("is-flipped");
    expect(infoButton).toHaveAttribute("aria-expanded", "false");
  });
});
