// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { Product } from "../api/types";
import { ProductImageManager } from "./ProductImageManager";

vi.mock("../api/client", () => ({
  api: {
    uploadProductImages: vi.fn(() => Promise.resolve({ images: [] })),
    reorderProductImages: vi.fn(() => Promise.resolve({ images: [] })),
    updateProductImage: vi.fn(() => Promise.resolve({ image: {} })),
    deleteProductImage: vi.fn(() => Promise.resolve())
  }
}));

const product: Product = {
  id: "product-1",
  slug: "meniul-casei",
  name: "Meniul casei",
  shortDescription: "Mici, cartofi și muștar",
  price: 34.5,
  imageUrl: null,
  legacyImageUrl: null,
  isPublished: true,
  isAvailable: true,
  sortOrder: 1,
  images: [
    { id: "image-1", url: "/images/main.jpg", alt: "Meniul casei", sortOrder: 0 },
    { id: "image-2", url: "/images/second.jpg", alt: null, sortOrder: 1 }
  ],
  categories: []
};

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL });
});

describe("ProductImageManager", () => {
  it("renders upload guidance, primary image badge, and image actions", () => {
    render(<ProductImageManager product={product} onDone={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Imagini produs" })).toBeVisible();
    expect(screen.getByText("Click pentru upload")).toBeVisible();
    expect(screen.getByText("Imagine principală")).toBeVisible();
    expect(screen.getByRole("button", { name: "Șterge imaginea 1" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Principală" })).toBeVisible();
  });

  it("previews selected files and uploads valid images", async () => {
    const onDone = vi.fn();
    const { container } = render(<ProductImageManager product={{ ...product, images: [] }} onDone={onDone} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["image"], "produs.png", { type: "image/png" });

    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText("Pregătită")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Încarcă 1 imagine" }));

    await waitFor(() => expect(api.uploadProductImages).toHaveBeenCalledWith(product.id, [file]));
    expect(onDone).toHaveBeenCalled();
  });
});
