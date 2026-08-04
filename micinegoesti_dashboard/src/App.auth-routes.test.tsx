// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./context/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false })
}));

vi.mock("./pages/AdminLoginPage", () => ({
  AdminLoginPage: () => <div>Staff login</div>
}));

vi.mock("./pages/AdminPage", () => ({
  AdminPage: () => <div>Staff dashboard</div>
}));

vi.mock("./pages/OfflinePage", () => ({
  OfflinePage: () => <div>Offline</div>
}));

afterEach(cleanup);

describe("dashboard authentication routes", () => {
  it("opens the staff login page", () => {
    render(
      <MemoryRouter initialEntries={["/admin-login"]}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText("Staff login")).toBeVisible();
  });

  it("protects the operations dashboard", async () => {
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("Staff login")).toBeVisible();
    expect(screen.queryByText("Staff dashboard")).not.toBeInTheDocument();
  });
});
