import type { Product } from "../api/types";

const CATEGORY_PRIORITY = [
  "garnituri",
  "salate",
  "bauturi",
  "băuturi",
  "racoritoare",
  "sosuri",
  "desert"
] as const;

function productCategoryPriority(product: Product) {
  const categoryText = product.categories
    .map((category) => `${category.slug} ${category.label}`.toLowerCase())
    .join(" ");
  const index = CATEGORY_PRIORITY.findIndex((keyword) => categoryText.includes(keyword));
  return index === -1 ? CATEGORY_PRIORITY.length : index;
}

export function selectCrossSellProducts({
  catalog,
  sourceProducts,
  cartProductIds,
  maximum = 4
}: {
  catalog: Product[];
  sourceProducts: Product[];
  cartProductIds: Set<string>;
  maximum?: number;
}) {
  const eligible = catalog.filter(
    (product) =>
      product.isPublished &&
      product.isAvailable &&
      !product.isTrashed &&
      !cartProductIds.has(product.id)
  );
  const productsById = new Map(eligible.map((product) => [product.id, product]));
  const selectedIds = new Set(sourceProducts.flatMap((product) => product.crossSellProductIds ?? []));
  const explicitProducts = [...selectedIds]
    .map((id) => productsById.get(id))
    .filter((product): product is Product => Boolean(product));
  const explicitProductIds = new Set(explicitProducts.map((product) => product.id));
  const fallbackProducts = eligible
    .filter((product) => !explicitProductIds.has(product.id))
    .sort((first, second) =>
      productCategoryPriority(first) - productCategoryPriority(second)
      || first.sortOrder - second.sortOrder
      || first.name.localeCompare(second.name, "ro")
    );

  return [...explicitProducts, ...fallbackProducts].slice(0, Math.max(0, maximum));
}
