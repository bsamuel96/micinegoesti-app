import type { Product } from "../api/types";

export const PRODUCT_IMAGE_FALLBACK = "/assets/brand/dark.png";

export function getProductCoverImage(product: Pick<Product, "images" | "imageUrl" | "legacyImageUrl">) {
  const candidates = [
    ...[...(product.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder).map((image) => image.url),
    product.imageUrl,
    product.legacyImageUrl
  ];

  return candidates.find((candidate): candidate is string => Boolean(candidate?.trim()))?.trim()
    ?? PRODUCT_IMAGE_FALLBACK;
}
