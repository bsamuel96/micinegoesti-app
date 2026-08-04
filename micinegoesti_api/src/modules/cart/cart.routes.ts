import { Router } from "express";
import { z } from "zod";
import { generateOpaqueToken } from "../../lib/auth.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { getSupabase } from "../../lib/supabase.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { readAllergenCodes } from "../../shared/allergens.js";

export const cartRouter = Router();

type CartItemInput = {
  productId: string;
  quantity: number;
};

type ReplaceItemsInput = {
  items: CartItemInput[];
};

const createCartSchema = z.object({
  sessionId: z.string().trim().min(8).max(160).optional()
});

const itemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1)
});

const replaceItemsSchema = z.object({
  items: z.array(itemSchema).max(100)
});

const lastOrderItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1)
});

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function metadataOf(row: any) {
  return row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
}

function serializeCategory(row: any) {
  return {
    id: row.id,
    slug: row.slug,
    label: row.name,
    sortOrder: 99,
    isActive: true
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
    price: toNumber(row.price),
    imageUrl: productImages[0]?.url ?? null,
    legacyImageUrl: metadata.legacy_image_url ?? null,
    isPublished: row.is_active !== false,
    isAvailable: row.in_stock !== false,
    allergenCodes: Object.prototype.hasOwnProperty.call(metadata, "allergen_codes")
      ? readAllergenCodes(metadata.allergen_codes)
      : undefined,
    crossSellProductIds: Array.isArray(metadata.cross_sell_product_ids)
      ? [...new Set(metadata.cross_sell_product_ids.filter((id: unknown): id is string => typeof id === "string" && id.length > 0))]
      : [],
    sortOrder: Number(metadata.sort_order ?? 0),
    attributes: metadata.attributes ?? null,
    images: productImages.map((image) => ({
      id: image.id,
      url: image.url,
      thumbnailUrl: null,
      legacyImageUrl: metadata.legacy_image_url ?? null,
      alt: image.alt,
      sortOrder: Number(image.sort_order ?? 0)
    })),
    categories: categories.map(serializeCategory)
  };
}

function normalizeCartItems(items: CartItemInput[]) {
  const merged = new Map<string, number>();
  for (const item of items) {
    merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
  }

  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

async function productRows(productIds: string[]) {
  if (!productIds.length) return new Map<string, any>();
  const { data, error } = await getSupabase()
    .from("products")
    .select("id, slug, name, description, price, category_id, in_stock, is_active, metadata")
    .in("id", productIds);
  if (error) throw new HttpError(500, "Nu am putut citi produsele.", error);
  return new Map((data ?? []).map((product) => [product.id, product]));
}

async function productImages(productIds: string[]) {
  if (!productIds.length) return new Map<string, any[]>();
  const { data, error } = await getSupabase()
    .from("product_images")
    .select("id, product_id, url, alt, sort_order")
    .in("product_id", productIds)
    .order("sort_order", { ascending: true });
  if (error) throw new HttpError(500, "Nu am putut citi imaginile produselor.", error);

  return (data ?? []).reduce<Map<string, any[]>>((map, image) => {
    const list = map.get(image.product_id) ?? [];
    list.push(image);
    map.set(image.product_id, list);
    return map;
  }, new Map());
}

async function productCategories(products: any[]) {
  const ids = products.map((product) => product.category_id).filter(Boolean);
  if (!ids.length) return new Map<string, any>();
  const { data, error } = await getSupabase().from("categories").select("id, slug, name").in("id", ids);
  if (error) throw new HttpError(500, "Nu am putut citi categoriile.", error);
  return new Map((data ?? []).map((category) => [category.id, category]));
}

async function serializeCart(cartId: string) {
  const { data: cart, error: cartError } = await getSupabase()
    .from("app_carts")
    .select("id, session_key, user_id")
    .eq("id", cartId)
    .maybeSingle();
  if (cartError) throw new HttpError(500, "Nu am putut citi coșul.", cartError);
  if (!cart) throw new HttpError(404, "Cart not found.");

  const { data: items, error: itemsError } = await getSupabase()
    .from("app_cart_items")
    .select("id, product_id, quantity, unit_price")
    .eq("cart_id", cartId);
  if (itemsError) throw new HttpError(500, "Nu am putut citi produsele din coș.", itemsError);

  const productIds = (items ?? []).map((item) => item.product_id);
  const products = await productRows(productIds);
  const images = await productImages(productIds);
  const categories = await productCategories([...products.values()]);
  const serializedItems = (items ?? [])
    .map((item) => {
      const product = products.get(item.product_id);
      if (!product) return null;
      const category = product.category_id ? categories.get(product.category_id) : null;
      const unitPrice = toNumber(item.unit_price);
      return {
        id: item.id,
        productId: item.product_id,
        quantity: item.quantity,
        unitPrice,
        totalPrice: unitPrice * item.quantity,
        product: serializeProduct(product, images.get(item.product_id) ?? [], category ? [category] : [])
      };
    })
    .filter(Boolean);
  const subtotal = serializedItems.reduce((sum, item: any) => sum + item.totalPrice, 0);

  return {
    id: cart.id,
    sessionId: cart.session_key,
    items: serializedItems,
    totals: {
      subtotal,
      total: subtotal
    }
  };
}

async function assertProductAvailable(productId: string) {
  const { data, error } = await getSupabase()
    .from("products")
    .select("id, name, price, is_active, in_stock")
    .eq("id", productId)
    .maybeSingle();
  if (error) throw new HttpError(500, "Nu am putut citi produsul.", error);
  if (!data || data.is_active === false) throw new HttpError(404, "Product not found.");
  if (data.in_stock === false) throw new HttpError(409, `${data.name} nu mai este disponibil momentan.`);
  return data;
}

async function replaceCartItems(cartId: string, itemsInput: CartItemInput[]) {
  const items = normalizeCartItems(itemsInput);
  const products = await Promise.all(items.map((item) => assertProductAvailable(item.productId)));

  const { error: deleteError } = await getSupabase().from("app_cart_items").delete().eq("cart_id", cartId);
  if (deleteError) throw new HttpError(500, "Nu am putut actualiza coșul.", deleteError);

  if (!items.length) return;
  const { error } = await getSupabase().from("app_cart_items").insert(
    items.map((item) => {
      const product = products.find((candidate) => candidate.id === item.productId)!;
      return {
        cart_id: cartId,
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: product.price
      };
    })
  );
  if (error) throw new HttpError(500, "Nu am putut salva coșul.", error);
}

cartRouter.post(
  "/cart",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = createCartSchema.parse(req.body ?? {});
    const sessionKey = input.sessionId ?? `server-${generateOpaqueToken(18)}`;
    const { data, error } = await getSupabase()
      .from("app_carts")
      .upsert({ session_key: sessionKey, user_id: req.user?.id ?? null }, { onConflict: "session_key" })
      .select("id")
      .single();
    if (error) throw new HttpError(500, "Nu am putut crea coșul.", error);
    res.status(201).json({ cart: await serializeCart(data.id) });
  })
);

cartRouter.get(
  "/cart/last-order/:sessionId",
  asyncHandler(async (req, res) => {
    const sessionId = z.string().trim().min(8).max(160).parse(req.params.sessionId);
    const { data, error } = await getSupabase()
      .from("last_orders")
      .select("items")
      .eq("session_key", sessionId)
      .maybeSingle();
    if (error) throw new HttpError(500, "Nu am putut citi ultima comandă.", error);
    if (!data) {
      res.json({ lines: [] });
      return;
    }

    const parsed = z.array(lastOrderItemSchema).safeParse(data.items);
    if (!parsed.success) {
      res.json({ lines: [] });
      return;
    }

    const items = normalizeCartItems(parsed.data as CartItemInput[]);
    const products = await productRows(items.map((item) => item.productId));
    const images = await productImages(items.map((item) => item.productId));
    const categories = await productCategories([...products.values()]);
    res.json({
      lines: items
        .map((item) => {
          const product = products.get(item.productId);
          if (!product || product.is_active === false || product.in_stock === false) return null;
          const category = product.category_id ? categories.get(product.category_id) : null;
          return { product: serializeProduct(product, images.get(item.productId) ?? [], category ? [category] : []), quantity: item.quantity };
        })
        .filter(Boolean)
    });
  })
);

cartRouter.get(
  "/cart/:id",
  asyncHandler(async (req, res) => {
    res.json({ cart: await serializeCart(req.params.id) });
  })
);

cartRouter.post(
  "/cart/:id/items",
  asyncHandler(async (req, res) => {
    const input = itemSchema.parse(req.body);
    const product = await assertProductAvailable(input.productId);
    const { data: existing } = await getSupabase()
      .from("app_cart_items")
      .select("id, quantity")
      .eq("cart_id", req.params.id)
      .eq("product_id", input.productId)
      .maybeSingle();

    const { error } = existing
      ? await getSupabase()
          .from("app_cart_items")
          .update({ quantity: existing.quantity + input.quantity, unit_price: product.price })
          .eq("id", existing.id)
      : await getSupabase()
          .from("app_cart_items")
          .insert({ cart_id: req.params.id, product_id: input.productId, quantity: input.quantity, unit_price: product.price });
    if (error) throw new HttpError(500, "Nu am putut actualiza coșul.", error);
    res.json({ cart: await serializeCart(req.params.id) });
  })
);

cartRouter.put(
  "/cart/:id/items",
  asyncHandler(async (req, res) => {
    const input = replaceItemsSchema.parse(req.body) as ReplaceItemsInput;
    await replaceCartItems(req.params.id, input.items);
    res.json({ cart: await serializeCart(req.params.id) });
  })
);

cartRouter.patch(
  "/cart/:id/items/:itemId",
  asyncHandler(async (req, res) => {
    const input = z.object({ quantity: z.number().int().min(1) }).parse(req.body);
    const { error } = await getSupabase().from("app_cart_items").update({ quantity: input.quantity }).eq("id", req.params.itemId);
    if (error) throw new HttpError(500, "Nu am putut actualiza coșul.", error);
    res.json({ cart: await serializeCart(req.params.id) });
  })
);

cartRouter.patch(
  "/cart/:id/items/by-product/:productId",
  asyncHandler(async (req, res) => {
    const input = z.object({ quantity: z.number().int().min(0) }).parse(req.body);

    if (input.quantity === 0) {
      await getSupabase().from("app_cart_items").delete().eq("cart_id", req.params.id).eq("product_id", req.params.productId);
      res.json({ cart: await serializeCart(req.params.id) });
      return;
    }

    const product = await assertProductAvailable(req.params.productId);
    const { data: existing } = await getSupabase()
      .from("app_cart_items")
      .select("id")
      .eq("cart_id", req.params.id)
      .eq("product_id", req.params.productId)
      .maybeSingle();
    const { error } = existing
      ? await getSupabase().from("app_cart_items").update({ quantity: input.quantity, unit_price: product.price }).eq("id", existing.id)
      : await getSupabase().from("app_cart_items").insert({ cart_id: req.params.id, product_id: req.params.productId, quantity: input.quantity, unit_price: product.price });
    if (error) throw new HttpError(500, "Nu am putut actualiza coșul.", error);

    res.json({ cart: await serializeCart(req.params.id) });
  })
);

cartRouter.delete(
  "/cart/:id/items/:itemId",
  asyncHandler(async (req, res) => {
    await getSupabase().from("app_cart_items").delete().eq("id", req.params.itemId);
    res.json({ cart: await serializeCart(req.params.id) });
  })
);

cartRouter.delete(
  "/cart/:id/items/by-product/:productId",
  asyncHandler(async (req, res) => {
    await getSupabase().from("app_cart_items").delete().eq("cart_id", req.params.id).eq("product_id", req.params.productId);
    res.json({ cart: await serializeCart(req.params.id) });
  })
);

cartRouter.delete(
  "/cart/:id",
  asyncHandler(async (req, res) => {
    const { error } = await getSupabase().from("app_cart_items").delete().eq("cart_id", req.params.id);
    if (error) throw new HttpError(500, "Nu am putut goli coșul.", error);
    res.json({ cart: await serializeCart(req.params.id) });
  })
);
