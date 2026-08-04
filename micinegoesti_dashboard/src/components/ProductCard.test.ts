import { describe, expect, it } from "vitest";
import type { Product } from "../api/types";
import { getAllergensLabel, getProductAllergenInfo } from "./ProductCard";

const product: Product = {
  id: "product-1",
  slug: "meniul-casei",
  name: "Meniul casei",
  price: 34.5,
  isPublished: true,
  isAvailable: true,
  sortOrder: 1,
  images: [],
  categories: []
};

describe("product allergen label", () => {
  it("shows explicit allergen names for the codes saved in the dashboard", () => {
    expect(getAllergensLabel({ ...product, allergenCodes: [1, 7, 10] })).toBe("Alergeni (UE): Gluten, Lapte, Muștar");
  });

  it("shows an explicit empty selection after all checkboxes are cleared", () => {
    expect(getAllergensLabel({ ...product, allergenCodes: [] })).toBe("Alergeni (UE): niciunul selectat");
  });

  it("returns the complete details needed on the back of the card", () => {
    expect(getProductAllergenInfo({ ...product, allergenCodes: [1, 7, 10] })).toEqual({
      specified: true,
      allergens: [
        { code: 1, label: "Gluten", description: "cereale care conțin gluten" },
        { code: 7, label: "Lapte", description: "lapte și produse derivate, inclusiv lactoză" },
        { code: 10, label: "Muștar", description: "muștar și produse derivate" }
      ]
    });
  });
});
