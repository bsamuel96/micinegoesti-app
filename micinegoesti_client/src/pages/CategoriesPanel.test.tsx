// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { Category } from "../api/types";
import { CategoriesPanel } from "./AdminPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const category: Category = {
  id: "category-1",
  slug: "meniuri-speciale",
  label: "Meniuri speciale pentru familie",
  sortOrder: 4,
  isActive: true
};

function renderPanel(categories: Category[] = [category], onDone = vi.fn()) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <CategoriesPanel categories={categories} onDone={onDone} />
    </QueryClientProvider>
  );
}

describe("CategoriesPanel", () => {
  it("shows existing categories in a horizontal table", () => {
    renderPanel();
    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Categorie" })).toBeVisible();
    expect(screen.getByText(category.label)).toBeVisible();
    expect(screen.getByText(category.slug)).toBeVisible();
    expect(screen.getByText("Activă")).toBeVisible();
  });

  it("keeps category creation separate from the table", () => {
    renderPanel();
    expect(screen.queryByRole("heading", { name: "Categorie nouă" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adaugă categorie" }));
    expect(screen.getByRole("heading", { name: "Categorie nouă" })).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("opens the category editor only on request", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Editează" }));
    expect(screen.getByRole("heading", { name: "Editează categoria" })).toBeVisible();
    expect(screen.getByLabelText("Numele categoriei")).toHaveValue(category.label);
    expect(screen.getByLabelText("Categorie activă")).toBeChecked();
  });

  it("persists category order after dragging a row", async () => {
    const secondCategory: Category = {
      id: "category-2",
      slug: "bauturi",
      label: "Băuturi",
      sortOrder: 5,
      isActive: true
    };
    const reorderCategories = vi.spyOn(api, "reorderCategories").mockResolvedValue();
    renderPanel([category, secondCategory]);
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: vi.fn(),
      getData: vi.fn(() => category.id)
    };

    fireEvent.dragStart(screen.getByRole("button", { name: `Mută ${category.label}` }), { dataTransfer });
    const targetRow = screen.getByText(secondCategory.label).closest("tr");
    expect(targetRow).not.toBeNull();
    fireEvent.dragOver(targetRow!, { dataTransfer });
    fireEvent.drop(targetRow!, { dataTransfer });

    await waitFor(() => expect(reorderCategories).toHaveBeenCalledWith([secondCategory.id, category.id]));
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText(secondCategory.label)).toBeVisible();
    expect(within(rows[1]).getByText(category.label)).toBeVisible();
  });

  it("lets keyboard users move a category with the drag handle", async () => {
    const secondCategory: Category = {
      id: "category-2",
      slug: "bauturi",
      label: "Băuturi",
      sortOrder: 5,
      isActive: true
    };
    const reorderCategories = vi.spyOn(api, "reorderCategories").mockResolvedValue();
    renderPanel([category, secondCategory]);

    fireEvent.keyDown(screen.getByRole("button", { name: `Mută ${category.label}` }), { key: "ArrowDown" });

    await waitFor(() => expect(reorderCategories).toHaveBeenCalledWith([secondCategory.id, category.id]));
  });
});
