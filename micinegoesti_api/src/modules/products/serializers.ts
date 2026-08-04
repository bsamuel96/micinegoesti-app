import type { Category, Product, ProductCategory, ProductImage } from "@prisma/client";

export function toNumber(value: unknown) {
  return Number(value ?? 0);
}

export function serializeCategory(category: Category) {
  return {
    id: category.id,
    slug: category.slug,
    label: category.label,
    sortOrder: category.sortOrder,
    isActive: category.isActive
  };
}

type ProductWithCategories = Product & {
  categories?: Array<ProductCategory & { category: Category }>;
  images?: ProductImage[];
};

export function serializeProduct(product: ProductWithCategories) {
  return {
    id: product.id,
    externalId: product.externalId,
    slug: product.slug,
    name: product.name,
    description: product.description,
    shortDescription: product.shortDescription,
    price: toNumber(product.price),
    imageUrl: product.imageUrl,
    legacyImageUrl: product.legacyImageUrl,
    isPublished: product.isPublished,
    isAvailable: product.isAvailable,
    sortOrder: product.sortOrder,
    attributes: product.attributesJson ? JSON.parse(product.attributesJson) : null,
    images:
      product.images?.map((image) => ({
        id: image.id,
        url: image.url,
        thumbnailUrl: image.thumbnailUrl,
        legacyImageUrl: image.legacyImageUrl,
        alt: image.alt,
        sortOrder: image.sortOrder
      })) ?? [],
    categories: product.categories?.map((item) => serializeCategory(item.category)) ?? []
  };
}
