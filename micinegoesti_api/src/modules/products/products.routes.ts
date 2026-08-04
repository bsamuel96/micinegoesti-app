import { Router } from "express";
import { z } from "zod";
import { CATEGORY_SEED, Role } from "../../constants.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { getSupabase } from "../../lib/supabase.js";
import { logWarn } from "../../lib/logger.js";
import { requireRoles, type AuthenticatedRequest } from "../../middleware/auth.js";
import { normalizeAllergenCodes, readAllergenCodes } from "../../shared/allergens.js";
import {
  isProductTrashed,
  restoreProductMetadata,
  trashProductMetadata
} from "./product-trash.js";
import {
  isProductSlugConflict,
  nextAvailableProductSlug,
  slugifyProduct
} from "./product-slug.js";

export const productsRouter = Router();

const productSchema = z.object({
  name: z.string().min(2),
  slug: z.string().optional(),
  description: z.string().optional().nullable(),
  shortDescription: z.string().optional().nullable(),
  productCode: z.string().trim().max(40).optional().nullable(),
  isHouseSpecialty: z.boolean().optional(),
  price: z.number().nonnegative(),
  imageUrl: z.string().optional().nullable(),
  legacyImageUrl: z.string().optional().nullable(),
  isPublished: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  allergenCodes: z.array(z.number().int().min(1).max(14)).optional(),
  crossSellProductIds: z.array(z.string().min(1)).max(50).optional(),
  sortOrder: z.number().int().optional(),
  attributes: z.unknown().optional().nullable(),
  images: z
    .array(
      z.object({
        url: z.string(),
        thumbnailUrl: z.string().optional().nullable(),
        legacyImageUrl: z.string().optional().nullable(),
        alt: z.string().optional().nullable(),
        sortOrder: z.number().int().optional()
      })
    )
    .optional(),
  categorySlugs: z.array(z.string()).default([])
});

const categorySchema = z.object({
  label: z.string().min(2),
  slug: z.string().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional()
});

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function metadataOf(row: any) {
  return row.metadata && typeof row.metadata === "object" ? row.metadata : {};
}

function canManageCatalog(req: AuthenticatedRequest) {
  return req.user?.role === Role.ADMIN || req.user?.role === Role.STORE_MANAGER;
}

function serializeCategory(row: any) {
  const knownIndex = CATEGORY_SEED.findIndex((category) => category.slug === row.slug);
  return {
    id: row.id,
    slug: row.slug,
    label: row.name ?? row.label,
    sortOrder: Number(row.sort_order ?? row.sortOrder ?? (knownIndex >= 0 ? knownIndex : 99)),
    isActive: row.is_active !== false && row.isActive !== false
  };
}

function serializeProduct(row: any, images: any[] = [], categories: any[] = []) {
  const metadata = metadataOf(row);
  const productImages = images.length
    ? images
    : row.image_url
      ? [{ id: `${row.id}:image`, url: row.image_url, alt: row.name, sort_order: 0 }]
      : [];

  return {
    id: row.id,
    externalId: metadata.external_id ?? null,
    slug: row.slug,
    name: row.name,
    description: row.description,
    shortDescription: metadata.short_description ?? row.description ?? null,
    productCode: metadata.product_code ?? null,
    isHouseSpecialty: metadata.is_house_specialty === true,
    price: toNumber(row.price),
    imageUrl: productImages[0]?.url ?? null,
    legacyImageUrl: metadata.legacy_image_url ?? null,
    isPublished: row.is_active !== false,
    isAvailable: row.in_stock !== false,
    isTrashed: isProductTrashed(metadata),
    trashedAt: typeof metadata.trashed_at === "string" ? metadata.trashed_at : null,
    allergenCodes: Object.prototype.hasOwnProperty.call(metadata, "allergen_codes")
      ? readAllergenCodes(metadata.allergen_codes)
      : undefined,
    crossSellProductIds: Array.isArray(metadata.cross_sell_product_ids)
      ? [...new Set(metadata.cross_sell_product_ids.filter((id: unknown): id is string => typeof id === "string" && id.length > 0))]
      : [],
    sortOrder: Number(metadata.sort_order ?? 0),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    attributes: metadata.attributes ?? null,
    images: productImages.map((image) => ({
      id: image.id,
      url: image.url,
      storagePath: image.storage_path ?? null,
      thumbnailUrl: null,
      legacyImageUrl: metadata.legacy_image_url ?? null,
      alt: image.alt,
      sortOrder: Number(image.sort_order ?? 0),
      width: image.width ?? null,
      height: image.height ?? null,
      fileSize: image.file_size ?? null,
      mimeType: image.mime_type ?? null
    })),
    categories: categories.map(serializeCategory)
  };
}

async function loadCategoriesById(ids: string[]) {
  if (!ids.length) return new Map<string, any>();
  const { data, error } = await getSupabase()
    .from("categories")
    .select("id, slug, name, sort_order, is_active")
    .in("id", ids);
  if (error) throw new HttpError(500, "Nu am putut citi categoriile.", error);
  return new Map((data ?? []).map((category) => [category.id, category]));
}

async function loadImagesByProductId(ids: string[]) {
  if (!ids.length) return new Map<string, any[]>();
  const query = getSupabase()
    .from("product_images")
    .select("id, product_id, storage_path, url, alt, sort_order, width, height, file_size, mime_type, created_at, updated_at")
    .in("product_id", ids)
    .order("sort_order", { ascending: true });
  const { data, error } = await query;
  if (error) {
    // Older production databases can still be on the legacy single-image schema.
    // Keep catalog reads available while deployments apply the image migration.
    if ((error as { code?: string }).code === "42P01") {
      logWarn("products:legacy-image-schema", { code: (error as { code?: string }).code });
      return new Map();
    }
    if ((error as { code?: string }).code === "42703") {
      const { data: legacyData, error: legacyError } = await getSupabase()
        .from("product_images")
        .select("id, product_id, url, alt, sort_order, created_at")
        .in("product_id", ids)
        .order("sort_order", { ascending: true });
      if (!legacyError) {
        logWarn("products:legacy-image-columns", { code: (error as { code?: string }).code });
        return groupImagesByProductId(legacyData ?? []);
      }
    }
    throw new HttpError(500, "Nu am putut citi imaginile produselor.", error);
  }

  return groupImagesByProductId(data ?? []);
}

function groupImagesByProductId(images: any[]) {
  return images.reduce<Map<string, any[]>>((map, image) => {
    const list = map.get(image.product_id) ?? [];
    list.push(image);
    map.set(image.product_id, list);
    return map;
  }, new Map());
}

async function hydrateProducts(rows: any[]) {
  const ids = rows.map((row) => row.id);
  const categoryIds = rows.map((row) => row.category_id).filter(Boolean);
  const [imagesByProduct, categoriesById] = await Promise.all([
    loadImagesByProductId(ids),
    loadCategoriesById(categoryIds)
  ]);

  return rows.map((row) => {
    const primary = row.category_id ? categoriesById.get(row.category_id) : null;
    const categories = primary ? [primary] : [];
    return serializeProduct(row, imagesByProduct.get(row.id) ?? [], categories);
  });
}

productsRouter.get(
  "/categories",
  asyncHandler(async (req, res) => {
    const { data, error } = await getSupabase()
      .from("categories")
      .select("id, slug, name, sort_order, is_active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new HttpError(500, "Nu am putut citi categoriile.", error);
    const canManage = canManageCatalog(req as AuthenticatedRequest);
    res.json({
      categories: (data ?? [])
        .map(serializeCategory)
        .filter((category) => canManage || category.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    });
  })
);

productsRouter.post(
  "/categories",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER),
  asyncHandler(async (req, res) => {
    const input = categorySchema.parse(req.body);
    const { data, error } = await getSupabase()
      .from("categories")
      .insert({
        name: input.label,
        slug: input.slug ? slugifyProduct(input.slug) : slugifyProduct(input.label),
        sort_order: input.sortOrder,
        is_active: input.isActive
      })
      .select("id, slug, name, sort_order, is_active")
      .single();
    if (error) throw new HttpError(500, "Nu am putut crea categoria.", error);
    res.status(201).json({ category: serializeCategory(data) });
  })
);

productsRouter.patch(
  "/categories/:id",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER),
  asyncHandler(async (req, res) => {
    const input = categorySchema.partial().parse(req.body);
    const { data, error } = await getSupabase()
      .from("categories")
      .update({
        name: input.label,
        slug: input.slug ? slugifyProduct(input.slug) : undefined,
        sort_order: input.sortOrder,
        is_active: input.isActive
      })
      .eq("id", req.params.id)
      .select("id, slug, name, sort_order, is_active")
      .single();
    if (error) throw new HttpError(500, "Nu am putut actualiza categoria.", error);
    res.json({ category: serializeCategory(data) });
  })
);

productsRouter.delete(
  "/categories/:id",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER),
  asyncHandler(async (_req, res) => {
    res.status(204).send();
  })
);

productsRouter.get(
  "/products",
  asyncHandler(async (req, res) => {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.toLowerCase() : undefined;
    const canManage = canManageCatalog(req as AuthenticatedRequest);
    const includeHidden = canManage && req.query.includeHidden === "true";
    const includeTrashed = canManage && req.query.includeTrashed === "true";

    const { data, error } = await getSupabase()
      .from("products")
      .select("id, slug, name, description, price, category_id, in_stock, is_active, metadata, created_at, updated_at")
      .order("name");
    if (error) throw new HttpError(500, "Nu am putut citi produsele.", error);
    const categoryId = category ? await categoryIdForSlug(category) : null;

    const hydrated = await hydrateProducts(
      (data ?? []).filter((product) => {
        if (!includeTrashed && isProductTrashed(metadataOf(product))) return false;
        if (!includeHidden && product.is_active === false) return false;
        if (search && !product.name.toLowerCase().includes(search)) return false;
        if (category && product.category_id !== categoryId && !(metadataOf(product).category_slugs ?? []).includes(category)) {
          return false;
        }
        return true;
      })
    );

    res.json({
      products: hydrated.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    });
  })
);

productsRouter.get(
  "/products/:id",
  asyncHandler(async (req, res) => {
    const { data, error } = await getSupabase()
      .from("products")
      .select("id, slug, name, description, price, category_id, in_stock, is_active, metadata, created_at, updated_at")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw new HttpError(500, "Nu am putut citi produsul.", error);
    const canManage = canManageCatalog(req as AuthenticatedRequest);
    if (!data || (!canManage && (data.is_active === false || isProductTrashed(metadataOf(data))))) {
      throw new HttpError(404, "Product not found.");
    }
    const [product] = await hydrateProducts([data]);
    res.json({ product });
  })
);

async function categoryIdForSlug(slug?: string) {
  if (!slug) return null;
  const { data, error } = await getSupabase().from("categories").select("id").eq("slug", slug).maybeSingle();
  if (error) throw new HttpError(500, "Nu am putut citi categoria.", error);
  if (!data) throw new HttpError(400, `Unknown category: ${slug}`);
  return data.id;
}

async function availableProductSlug(value: string) {
  const base = slugifyProduct(value) || "produs";
  const { data, error } = await getSupabase()
    .from("products")
    .select("slug")
    .like("slug", `${base}%`);
  if (error) throw new HttpError(500, "Nu am putut verifica adresa produsului.", error);
  return nextAvailableProductSlug(base, (data ?? []).map((row) => row.slug));
}

async function createProductRow(
  input: z.infer<typeof productSchema>,
  categoryId: string | null,
  metadata: Record<string, unknown>
) {
  const requestedSlug = input.slug || input.name;

  // A concurrent request can claim the same candidate after it is read. Retry
  // with the next suffix instead of returning an opaque database 500.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const slug = await availableProductSlug(requestedSlug);
    const result = await getSupabase()
      .from("products")
      .insert({
        name: input.name,
        slug,
        description: input.description,
        price: input.price,
        category_id: categoryId,
        in_stock: input.isAvailable ?? true,
        is_active: input.isPublished ?? true,
        metadata
      })
      .select("id, slug, name, description, price, category_id, in_stock, is_active, metadata, created_at, updated_at")
      .single();

    if (!result.error) return result.data;
    if (!isProductSlugConflict(result.error)) {
      throw new HttpError(500, "Nu am putut crea produsul.", result.error);
    }
  }

  throw new HttpError(
    409,
    "Există deja mai multe produse cu acest nume. Schimbă puțin numele și încearcă din nou."
  );
}

productsRouter.post(
  "/products",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER),
  asyncHandler(async (req, res) => {
    const input = productSchema.parse(req.body);
    const categoryId = await categoryIdForSlug(input.categorySlugs[0]);
    const metadata = {
      short_description: input.shortDescription,
      product_code: input.productCode || undefined,
      is_house_specialty: input.isHouseSpecialty ?? false,
      sort_order: input.sortOrder ?? 0,
      category_slugs: input.categorySlugs,
      allergen_codes: normalizeAllergenCodes(input.allergenCodes ?? []),
      cross_sell_product_ids: [...new Set(input.crossSellProductIds ?? [])],
      attributes: input.attributes ?? undefined,
      legacy_image_url: input.legacyImageUrl ?? undefined
    };
    const data = await createProductRow(input, categoryId, metadata);

    const images = input.images?.length
      ? input.images
      : input.imageUrl
        ? [{ url: input.imageUrl, alt: input.name, sortOrder: 0 }]
        : [];
    if (images.length) {
      const { error: imageError } = await getSupabase().from("product_images").insert(
        images.map((image, index) => ({
          product_id: data.id,
          url: image.url,
          alt: image.alt ?? input.name,
          sort_order: image.sortOrder ?? index
        }))
      );
      if (imageError) throw new HttpError(500, "Nu am putut salva imaginile produsului.", imageError);
    }

    const [product] = await hydrateProducts([data]);
    res.status(201).json({ product });
  })
);

productsRouter.patch(
  "/products/:id",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER),
  asyncHandler(async (req, res) => {
    const input = productSchema.partial().parse(req.body);
    const existing = await getSupabase()
      .from("products")
      .select("metadata")
      .eq("id", req.params.id)
      .maybeSingle();
    if (existing.error) throw new HttpError(500, "Nu am putut citi produsul.", existing.error);

    const metadata = {
      ...metadataOf(existing.data ?? {}),
      ...(input.shortDescription === undefined ? {} : { short_description: input.shortDescription }),
      ...(input.productCode === undefined ? {} : { product_code: input.productCode || null }),
      ...(input.isHouseSpecialty === undefined ? {} : { is_house_specialty: input.isHouseSpecialty }),
      ...(input.sortOrder === undefined ? {} : { sort_order: input.sortOrder }),
      ...(input.categorySlugs === undefined ? {} : { category_slugs: input.categorySlugs }),
      ...(input.allergenCodes === undefined ? {} : { allergen_codes: normalizeAllergenCodes(input.allergenCodes) }),
      ...(input.crossSellProductIds === undefined
        ? {}
        : { cross_sell_product_ids: [...new Set(input.crossSellProductIds)].filter((id) => id !== req.params.id) }),
      ...(input.attributes === undefined ? {} : { attributes: input.attributes }),
      ...(input.legacyImageUrl === undefined ? {} : { legacy_image_url: input.legacyImageUrl })
    };
    const categoryId = input.categorySlugs ? await categoryIdForSlug(input.categorySlugs[0]) : undefined;
    const { data, error } = await getSupabase()
      .from("products")
      .update({
        name: input.name,
        slug: input.slug ? slugifyProduct(input.slug) : undefined,
        description: input.description,
        price: input.price,
        category_id: categoryId,
        in_stock: input.isAvailable,
        is_active: input.isPublished,
        metadata
      })
      .eq("id", req.params.id)
      .select("id, slug, name, description, price, category_id, in_stock, is_active, metadata, created_at, updated_at")
      .single();
    if (error) {
      if (isProductSlugConflict(error)) {
        throw new HttpError(409, "Există deja un produs cu această adresă. Alege o altă adresă.", error);
      }
      throw new HttpError(500, "Nu am putut actualiza produsul.", error);
    }

    if (input.images) {
      await getSupabase().from("product_images").delete().eq("product_id", req.params.id);
      if (input.images.length) {
        const { error: imageError } = await getSupabase().from("product_images").insert(
          input.images.map((image, index) => ({
            product_id: req.params.id,
            url: image.url,
            alt: image.alt ?? input.name ?? data.name,
            sort_order: image.sortOrder ?? index
          }))
        );
        if (imageError) throw new HttpError(500, "Nu am putut salva imaginile produsului.", imageError);
      }
    }

    const [product] = await hydrateProducts([data]);
    res.json({ product });
  })
);

productsRouter.delete(
  "/products/:id",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER),
  asyncHandler(async (req, res) => {
    const existing = await getSupabase()
      .from("products")
      .select("metadata, is_active")
      .eq("id", req.params.id)
      .maybeSingle();
    if (existing.error) throw new HttpError(500, "Nu am putut citi produsul.", existing.error);
    if (!existing.data) throw new HttpError(404, "Produsul nu a fost găsit.");

    const metadata = trashProductMetadata(
      metadataOf(existing.data),
      existing.data.is_active !== false
    );
    const { error } = await getSupabase()
      .from("products")
      .update({ is_active: false, metadata })
      .eq("id", req.params.id);
    if (error) throw new HttpError(500, "Nu am putut muta produsul în coș.", error);
    res.status(204).send();
  })
);

productsRouter.post(
  "/products/:id/restore",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER),
  asyncHandler(async (req, res) => {
    const existing = await getSupabase()
      .from("products")
      .select("id, slug, name, description, price, category_id, in_stock, is_active, metadata, created_at, updated_at")
      .eq("id", req.params.id)
      .maybeSingle();
    if (existing.error) throw new HttpError(500, "Nu am putut citi produsul.", existing.error);
    if (!existing.data) throw new HttpError(404, "Produsul nu a fost găsit.");

    const existingMetadata = metadataOf(existing.data);
    if (!isProductTrashed(existingMetadata)) {
      throw new HttpError(409, "Produsul nu se află în coș.");
    }
    const restored = restoreProductMetadata(existingMetadata);
    const { data, error } = await getSupabase()
      .from("products")
      .update({
        is_active: restored.isPublished,
        metadata: restored.metadata
      })
      .eq("id", req.params.id)
      .select("id, slug, name, description, price, category_id, in_stock, is_active, metadata, created_at, updated_at")
      .single();
    if (error) throw new HttpError(500, "Nu am putut restaura produsul.", error);

    const [product] = await hydrateProducts([data]);
    res.json({ product });
  })
);
