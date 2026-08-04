// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Header } from "./Layout";

const authState = vi.hoisted(() => ({ user: null as null | { role: string } }));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => authState
}));

vi.mock("../context/CartContext", () => ({
  useCart: () => ({ count: 0, subtotal: 0 })
}));

afterEach(() => {
  cleanup();
  authState.user = null;
});

describe("public header administration link", () => {
  it("opens admin login for visitors", () => {
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Panou administrare" })).toHaveAttribute("href", "/admin-login");
  });

  it("opens the dashboard directly for staff", () => {
    authState.user = { role: "admin" };
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Panou administrare" })).toHaveAttribute("href", "/admin");
  });

  it("exposes the complete navigation through the compact menu", () => {
    render(<MemoryRouter><Header /></MemoryRouter>);

    const toggle = screen.getByRole("button", { name: "Deschide meniul" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);

    const mobileNavigation = screen.getByRole("navigation", { name: "Navigare principală mobilă" });
    expect(mobileNavigation).toBeVisible();
    expect(within(mobileNavigation).getByRole("link", { name: "Despre noi" })).toHaveAttribute("href", "/about");
    expect(within(mobileNavigation).getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/contact");
    expect(screen.getByRole("button", { name: "Închide meniul" })).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("navigation", { name: "Navigare principală mobilă" })).not.toBeInTheDocument();
  });
});
