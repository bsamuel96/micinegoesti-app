// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./context/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false })
}));

vi.mock("./components/Layout", () => ({
  Layout: () => <div>Layout</div>
}));

vi.mock("./pages/ComingSoonPage", () => ({
  ComingSoonPage: () => <div>Coming soon</div>
}));

vi.mock("./pages/LoginPage", () => ({
  LoginPage: ({ mode }: { mode?: "login" | "register" }) => (
    <div>{mode === "register" ? "Create customer account" : "Customer login"}</div>
  )
}));

afterEach(cleanup);

describe("customer authentication routes during coming-soon mode", () => {
  it("opens the customer login page", () => {
    render(
      <MemoryRouter initialEntries={["/login?returnTo=%2F"]}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText("Customer login")).toBeVisible();
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
  });

  it("opens the customer account creation page", () => {
    render(
      <MemoryRouter initialEntries={["/register?returnTo=%2F"]}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText("Create customer account")).toBeVisible();
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
  });
});
