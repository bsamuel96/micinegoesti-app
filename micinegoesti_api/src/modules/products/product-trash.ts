export type ProductMetadata = Record<string, unknown>;

export function isProductTrashed(metadata: ProductMetadata) {
  return typeof metadata.trashed_at === "string" && metadata.trashed_at.length > 0;
}

export function trashProductMetadata(
  metadata: ProductMetadata,
  isPublished: boolean,
  trashedAt = new Date().toISOString()
) {
  if (isProductTrashed(metadata)) return metadata;

  return {
    ...metadata,
    trashed_at: trashedAt,
    trash_previous_is_active: isPublished
  };
}

export function restoreProductMetadata(metadata: ProductMetadata) {
  const restoredIsPublished = metadata.trash_previous_is_active !== false;
  const restoredMetadata = { ...metadata };
  delete restoredMetadata.trashed_at;
  delete restoredMetadata.trash_previous_is_active;

  return { metadata: restoredMetadata, isPublished: restoredIsPublished };
}
