// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardShell } from "./DashboardShell";

const deliverer = {
  id: "driver-1",
  phone: "+40740000000",
  name: "Curier Test",
  role: "deliverer" as const,
  isActive: true
};

afterEach(cleanup);

describe("DashboardShell", () => {
  it("shows the restaurant logo instead of the MDN initials", () => {
    render(
      <DashboardShell
        sections={[{ key: "dashboard", label: "Panou", group: "Operațiuni" }]}
        activeSection="dashboard"
        user={deliverer}
        onSectionChange={vi.fn()}
        onLogout={vi.fn()}
      >
        <p>Conținut</p>
      </DashboardShell>
    );

    expect(screen.getByRole("img", { name: "Logo Mici de Negoești" })).toHaveAttribute(
      "src",
      "/assets/brand/cropped-LogoWebsite.png"
    );
    expect(screen.queryByText("MDN")).not.toBeInTheDocument();
  });

  it("links back to the homepage from the account actions", () => {
    render(
      <DashboardShell
        sections={[{ key: "dashboard", label: "Panou", group: "Operațiuni" }]}
        activeSection="dashboard"
        user={deliverer}
        onSectionChange={vi.fn()}
        onLogout={vi.fn()}
      >
        <p>Conținut</p>
      </DashboardShell>
    );

    expect(screen.getByRole("link", { name: "Pagina principală" })).toHaveAttribute("href", "http://localhost:5173");
  });

  it("opens mobile navigation, selects a section and closes it", () => {
    const onSectionChange = vi.fn();
    render(
      <DashboardShell
        sections={[
          { key: "dashboard", label: "Panou", group: "Operațiuni" },
          { key: "orders", label: "Comenzi", group: "Operațiuni" }
        ]}
        activeSection="dashboard"
        user={deliverer}
        onSectionChange={onSectionChange}
        onLogout={vi.fn()}
      >
        <p>Conținut</p>
      </DashboardShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "Deschide navigarea" }));
    expect(screen.getByRole("dialog", { name: "Navigare operațională" })).toHaveClass("is-open");
    fireEvent.click(screen.getByRole("button", { name: "Comenzi" }));
    expect(onSectionChange).toHaveBeenCalledWith("orders");
    expect(screen.queryByRole("dialog", { name: "Navigare operațională" })).not.toBeInTheDocument();
  });

  it("closes navigation with Escape", () => {
    render(
      <DashboardShell
        sections={[{ key: "dashboard", label: "Panou", group: "Operațiuni" }]}
        activeSection="dashboard"
        user={deliverer}
        onSectionChange={vi.fn()}
        onLogout={vi.fn()}
      >
        <p>Conținut</p>
      </DashboardShell>
    );
    fireEvent.click(screen.getByRole("button", { name: "Deschide navigarea" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Navigare operațională" })).not.toBeInTheDocument();
  });
});
