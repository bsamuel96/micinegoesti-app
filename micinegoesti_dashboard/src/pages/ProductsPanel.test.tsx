// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { Category, Product } from "../api/types";
import { ProductsPanel } from "./AdminPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const product: Product = {
  id: "product-1",
  slug: "meniul-casei",
  name: "Meniul casei cu o denumire lungă",
  description: null,
  shortDescription: "Mici, cartofi și muștar",
  productCode: "MDN-MENIU-01",
  isHouseSpecialty: true,
  price: 34.5,
  imageUrl: null,
  legacyImageUrl: null,
  isPublished: true,
  isAvailable: true,
  isTrashed: false,
  allergenCodes: [1, 7],
  sortOrder: 1,
  createdAt: "2026-07-27T09:00:00.000Z",
  updatedAt: "2026-07-27T10:00:00.000Z",
  images: [],
  categories: [{ id: "category-1", slug: "meniuri", label: "Meniuri", sortOrder: 1, isActive: true }]
};

function renderPanel(
  products: Product[] = [product],
  categoryOverrides?: Category[],
  initialEntry = "/admin?section=products"
) {
  const client = new QueryClient();
  const categories = categoryOverrides
    ?? [...new Map(products.flatMap((item) => item.categories).map((category) => [category.slug, category])).values()];
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={client}>
        <ProductsPanel
          products={products}
          categories={categories}
          search=""
          onSearch={vi.fn()}
          onDone={vi.fn()}
        />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("ProductsPanel", () => {
  it("shows existing products as cards grouped by category", () => {
    renderPanel();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Meniuri" })).toBeVisible();
    const card = screen.getByRole("article", { name: product.name });
    expect(within(card).getByText(product.name)).toBeVisible();
    expect(within(card).getByText("34.50 lei")).toBeVisible();
    expect(within(card).getByText("Disponibil")).toBeVisible();
  });

  it("opens new-product creation in a modal window", () => {
    renderPanel();
    expect(screen.queryByRole("tab", { name: "Informații de bază" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adaugă produs" }));
    const dialog = screen.getByRole("dialog", { name: "Adaugă produs nou" });
    expect(dialog).toBeVisible();
    expect(dialog.querySelector(".product-editor")).toHaveClass("product-details-shell");
    expect(dialog.querySelector("form")).toHaveClass("product-editor-form");
    expect(within(dialog).getByRole("tab", { name: "Informații de bază" })).toHaveAttribute("aria-selected", "true");
    expect(within(dialog).getByRole("heading", { name: "Informații de bază" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Înapoi la produse" })).toBeVisible();
    expect(within(dialog).getByRole("complementary", { name: "Previzualizare produs" })).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("starts a new product with the selected category from its category button", () => {
    renderPanel();

    const addProduct = screen.getByRole("button", { name: "Adaugă produs în Meniuri" });
    expect(addProduct).toHaveClass("product-add-card");
    expect(addProduct.parentElement?.lastElementChild).toBe(addProduct);
    fireEvent.click(addProduct);

    expect(screen.getByLabelText("Categorie *")).toHaveValue("meniuri");
    expect(screen.getByRole("heading", { name: "Adaugă produs nou" })).toBeVisible();
  });

  it("adds explicit cross-sells while creating a product", async () => {
    const drink: Product = {
      ...product,
      id: "product-2",
      slug: "limonada",
      name: "Limonadă",
      categories: [{ id: "category-2", slug: "bauturi", label: "Băuturi", sortOrder: 2, isActive: true }]
    };
    const createProduct = vi.spyOn(api, "createProduct").mockResolvedValue({
      product: { ...product, id: "product-created", name: "Meniu nou", crossSellProductIds: [drink.id] }
    });
    const emptyCategory: Category = {
      id: "category-3",
      slug: "deserturi",
      label: "Deserturi",
      sortOrder: 3,
      isActive: true
    };
    renderPanel([product, drink], [...product.categories, ...drink.categories, emptyCategory]);

    fireEvent.click(screen.getByRole("button", { name: "Adaugă produs" }));
    const dialog = screen.getByRole("dialog", { name: "Adaugă produs nou" });
    fireEvent.change(within(dialog).getByLabelText("Nume produs *"), { target: { value: "Meniu nou" } });
    fireEvent.change(within(dialog).getByLabelText("Categorie *"), { target: { value: "meniuri" } });
    fireEvent.change(within(dialog).getByLabelText("Preț *"), { target: { value: "39.5" } });
    fireEvent.change(within(dialog).getByLabelText(/Cod produs \(opțional\)/), { target: { value: "MDN-NOU-01" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Marchează produsul ca specialitatea casei" }));
    const preview = within(dialog).getByRole("complementary", { name: "Previzualizare produs" });
    expect(within(preview).getByRole("heading", { name: "Meniu nou" })).toBeVisible();
    expect(within(preview).getByText("39,50 lei")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("tab", { name: "Recomandări" }));
    expect(within(dialog).getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent))
      .toEqual(["Meniuri", "Băuturi", "Deserturi"]);
    expect(within(dialog).getByRole("checkbox", { name: /Meniul casei/i })).toBeVisible();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Limonadă/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Adaugă produs" }));

    await waitFor(() => expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        productCode: "MDN-NOU-01",
        isHouseSpecialty: true,
        crossSellProductIds: [drink.id]
      })
    ));
  });

  it("persists card order after dragging within a category", async () => {
    const secondProduct: Product = {
      ...product,
      id: "product-2",
      slug: "meniul-zilei",
      name: "Meniul zilei",
      sortOrder: 2
    };
    const reorderProducts = vi.spyOn(api, "reorderProducts").mockResolvedValue();
    renderPanel([product, secondProduct]);
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: vi.fn(),
      getData: vi.fn(() => product.id)
    };

    fireEvent.dragStart(screen.getByRole("button", { name: `Mută ${product.name}` }), { dataTransfer });
    const target = screen.getByRole("article", { name: secondProduct.name });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => expect(reorderProducts).toHaveBeenCalledWith([secondProduct.id, product.id]));
  });

  it("opens editing only when requested", () => {
    renderPanel();
    expect(screen.queryByRole("tab", { name: "Informații de bază" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editează" }));
    expect(screen.getByRole("dialog", { name: product.name })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Informații de bază" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Nume produs *")).toHaveValue(product.name);
    expect(screen.getByLabelText(/Cod produs \(opțional\)/)).toHaveValue(product.productCode);
    expect(screen.getByRole("checkbox", { name: "Marchează produsul ca specialitatea casei" })).toBeChecked();
  });

  it("restores the selected product editor from the URL after refresh", () => {
    renderPanel([product], undefined, `/admin?section=products&product=${product.id}`);

    expect(screen.getByRole("dialog", { name: product.name })).toBeVisible();
    expect(screen.getByLabelText("Nume produs *")).toHaveValue(product.name);
  });

  it("filters the catalog by category", () => {
    const drinks: Product = {
      ...product,
      id: "product-2",
      slug: "limonada",
      name: "Limonadă",
      categories: [{ id: "category-2", slug: "bauturi", label: "Băuturi", sortOrder: 2, isActive: true }]
    };
    renderPanel([product, drinks]);

    fireEvent.change(screen.getByLabelText("Filtrează după categorie"), { target: { value: "bauturi" } });

    expect(screen.getByRole("article", { name: drinks.name })).toBeVisible();
    expect(screen.queryByRole("article", { name: product.name })).not.toBeInTheDocument();
    expect(screen.getByText("1 produs afișat")).toBeVisible();
  });

  it("adds and removes allergens through the edit checkboxes", async () => {
    const updateProduct = vi.spyOn(api, "updateProduct").mockResolvedValue({ product });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Editează" }));
    fireEvent.click(screen.getByRole("tab", { name: "Ingrediente & alergeni" }));

    const gluten = screen.getByRole("checkbox", { name: /1\. Gluten/i });
    const milk = screen.getByRole("checkbox", { name: /7\. Lapte/i });
    const mustard = screen.getByRole("checkbox", { name: /10\. Muștar/i });
    expect(gluten).toBeChecked();
    expect(milk).toBeChecked();
    expect(mustard).not.toBeChecked();

    fireEvent.click(gluten);
    fireEvent.click(mustard);
    fireEvent.click(screen.getByRole("button", { name: "Salvează modificările" }));

    await waitFor(() => expect(updateProduct).toHaveBeenCalledWith(
      product.id,
      expect.objectContaining({ allergenCodes: [7, 10] })
    ));
  });

  it("closes the viewport editor with Escape", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Editează" }));
    expect(screen.getByRole("dialog", { name: product.name })).toBeVisible();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: product.name })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps duplicated gramaj copy out of the detailed description field", () => {
    renderPanel([{ ...product, description: product.shortDescription }]);
    fireEvent.click(screen.getByRole("button", { name: "Editează" }));
    expect(screen.getByLabelText("Descriere scurtă / gramaj")).toHaveValue(product.shortDescription);
    expect(screen.getByLabelText("Descriere detaliată")).toHaveValue("");
  });

  it("shows images as a tab for new and existing products", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Adaugă produs" }));
    fireEvent.click(screen.getByRole("tab", { name: "Imagini & publicare" }));
    expect(screen.getByRole("heading", { name: "Imagini produs" })).toBeVisible();
    expect(screen.getByText("Click pentru upload")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Produse existente" }));
    fireEvent.click(screen.getByRole("button", { name: "Editează" }));
    fireEvent.click(screen.getByRole("tab", { name: "Imagini & publicare" }));
    expect(screen.getByRole("heading", { name: "Imagini produs" })).toBeVisible();
  });

  it("moves a product to the recoverable trash after confirmation", async () => {
    const trashProduct = vi.spyOn(api, "trashProduct").mockResolvedValue();
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: `Șterge ${product.name}` }));
    expect(screen.getByRole("alertdialog", { name: `Ștergi produsul „${product.name}”?` })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Mută în coș" }));

    await waitFor(() => expect(trashProduct).toHaveBeenCalledWith(product.id));
  });

  it("shows the deletion API error inside the active confirmation dialog", async () => {
    vi.spyOn(api, "trashProduct").mockRejectedValue(new Error("Supabase indisponibil"));
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: `Șterge ${product.name}` }));
    fireEvent.click(screen.getByRole("button", { name: "Mută în coș" }));

    const dialog = await screen.findByRole("alertdialog", { name: `Ștergi produsul „${product.name}”?` });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Ștergerea a eșuat: Supabase indisponibil"
    );
  });

  it("shows deleted products in the trash and restores them", async () => {
    const deletedProduct: Product = {
      ...product,
      isPublished: false,
      isTrashed: true,
      trashedAt: "2026-07-27T10:00:00.000Z"
    };
    const restoreProduct = vi.spyOn(api, "restoreProduct").mockResolvedValue({
      product: { ...deletedProduct, isPublished: true, isTrashed: false, trashedAt: null }
    });
    renderPanel([deletedProduct]);

    expect(screen.queryByRole("article", { name: deletedProduct.name })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Coș produse (1)" }));

    const card = screen.getByRole("article", { name: deletedProduct.name });
    expect(within(card).getByText("În coș")).toBeVisible();
    fireEvent.click(within(card).getByRole("button", { name: "Restaurează" }));

    await waitFor(() => expect(restoreProduct).toHaveBeenCalledWith(deletedProduct.id));
  });
});
