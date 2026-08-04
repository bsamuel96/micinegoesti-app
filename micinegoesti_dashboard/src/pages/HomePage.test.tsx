// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { HomePage } from "./HomePage";

vi.mock("../components/ProductCard", () => ({
  ProductCard: () => <article>Produs</article>
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("homepage team carousel", () => {
  it("loops cloned cards and keeps arrows, keyboard controls, and dots synchronized", () => {
    vi.spyOn(api, "categories").mockResolvedValue({ categories: [] });
    vi.spyOn(api, "products").mockResolvedValue({ products: [] });

    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <HomePage />
        </QueryClientProvider>
      </MemoryRouter>
    );

    const carousel = screen.getByLabelText("Carusel echipă");
    const cards = within(carousel).getAllByRole("article");
    const dots = within(screen.getByLabelText("Navigare carusel")).getAllByRole("button");
    const track = carousel.querySelector(".emp3__track");

    expect(cards).toHaveLength(15);
    expect(track).not.toBeNull();
    expect(cards.filter((card) => card.classList.contains("is-active"))).toHaveLength(1);
    expect(dots[0]).toHaveAttribute("aria-current", "true");

    fireEvent.click(screen.getByRole("button", { name: "Înainte" }));
    expect(dots[1]).toHaveAttribute("aria-current", "true");
    fireEvent.transitionEnd(track!);

    fireEvent.keyDown(carousel, { key: "ArrowLeft" });
    expect(dots[0]).toHaveAttribute("aria-current", "true");
    fireEvent.transitionEnd(track!);

    fireEvent.click(dots[4]);
    expect(dots[4]).toHaveAttribute("aria-current", "true");
  });

  it("stays inside the cloned rail when the next control is clicked repeatedly", () => {
    vi.spyOn(api, "categories").mockResolvedValue({ categories: [] });
    vi.spyOn(api, "products").mockResolvedValue({ products: [] });

    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <HomePage />
        </QueryClientProvider>
      </MemoryRouter>
    );

    const carousel = screen.getByLabelText("Carusel echipă");
    const cards = within(carousel).getAllByRole("article");
    const dots = within(screen.getByLabelText("Navigare carusel")).getAllByRole("button");
    const next = screen.getByRole("button", { name: "Înainte" });
    const track = carousel.querySelector(".emp3__track");

    expect(track).not.toBeNull();

    for (let index = 0; index < 20; index += 1) {
      fireEvent.click(next);
    }

    expect(dots[1]).toHaveAttribute("aria-current", "true");
    expect(cards[6]).toHaveClass("is-active");

    fireEvent.transitionEnd(track!);
    fireEvent.click(next);

    expect(dots[2]).toHaveAttribute("aria-current", "true");
    expect(cards[7]).toHaveClass("is-active");
  });

  it("unlocks navigation when the browser does not emit transitionend", () => {
    vi.useFakeTimers();
    vi.spyOn(api, "categories").mockResolvedValue({ categories: [] });
    vi.spyOn(api, "products").mockResolvedValue({ products: [] });

    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <HomePage />
        </QueryClientProvider>
      </MemoryRouter>
    );

    const dots = within(screen.getByLabelText("Navigare carusel")).getAllByRole("button");
    const next = screen.getByRole("button", { name: "Înainte" });

    fireEvent.click(next);
    expect(dots[1]).toHaveAttribute("aria-current", "true");

    act(() => {
      vi.advanceTimersByTime(700);
    });
    fireEvent.click(next);

    expect(dots[2]).toHaveAttribute("aria-current", "true");
  });
});
