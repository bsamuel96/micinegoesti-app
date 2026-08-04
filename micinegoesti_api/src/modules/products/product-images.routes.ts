import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "../../config.js";
import { Role } from "../../constants.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { getSupabase } from "../../lib/supabase.js";
import { requireRoles } from "../../middleware/auth.js";
import { removeProductObjects, uploadProductImage } from "./product-image.service.js";

export const productImagesRouter = Router();
const adminOnly = requireRoles(Role.ADMIN, Role.STORE_MANAGER);
const upload = multer({ storage: multer.memoryStorage(), limits: { files: config.productImages.maxImages, fileSize: config.productImages.maxFileSize } });

async function orderedImages(productId: string) {
  const { data, error } = await getSupabase().from("product_images").select("*").eq("product_id", productId).order("sort_order");
  if (error) throw new HttpError(500, "Nu am putut citi imaginile produsului.", error);
  return data ?? [];
}

productImagesRouter.post("/products/:productId/images", adminOnly, upload.array("images", config.productImages.maxImages) as never, asyncHandler(async (req, res) => {
  const { data: product, error } = await getSupabase().from("products").select("id, name").eq("id", req.params.productId).maybeSingle();
  if (error) throw new HttpError(500, "Nu am putut citi produsul.", error);
  if (!product) throw new HttpError(404, "Produsul nu a fost găsit.");
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw new HttpError(400, "Selectează cel puțin o imagine.");
  if ((await orderedImages(product.id)).length + files.length > config.productImages.maxImages) throw new HttpError(400, "Poți încărca maximum 8 imagini.");
  for (const file of files) await uploadProductImage(product.id, file, String(req.body.altText || product.name));
  res.status(201).json({ images: await orderedImages(product.id) });
}));

productImagesRouter.patch("/products/:productId/images/reorder", adminOnly, asyncHandler(async (req, res) => {
  const { imageIds } = z.object({ imageIds: z.array(z.string()).min(1).max(config.productImages.maxImages) }).parse(req.body);
  const rows = await orderedImages(req.params.productId);
  if (rows.length !== imageIds.length || imageIds.some((id) => !rows.some((row) => row.id === id))) throw new HttpError(400, "Ordinea imaginilor nu este validă.");
  for (const [sortOrder, id] of imageIds.entries()) {
    const { error } = await getSupabase().from("product_images").update({ sort_order: sortOrder }).eq("id", id).eq("product_id", req.params.productId);
    if (error) throw new HttpError(500, "Nu am putut reordona imaginile.", error);
  }
  res.json({ images: await orderedImages(req.params.productId) });
}));

productImagesRouter.patch("/products/:productId/images/:imageId", adminOnly, asyncHandler(async (req, res) => {
  const { altText } = z.object({ altText: z.string().max(180).nullable() }).parse(req.body);
  const { data, error } = await getSupabase().from("product_images").update({ alt: altText }).eq("id", req.params.imageId).eq("product_id", req.params.productId).select("*").maybeSingle();
  if (error) throw new HttpError(500, "Nu am putut actualiza textul alternativ.", error);
  if (!data) throw new HttpError(404, "Imaginea nu a fost găsită.");
  res.json({ image: data });
}));

productImagesRouter.delete("/products/:productId/images/:imageId", adminOnly, asyncHandler(async (req, res) => {
  const { data: image, error } = await getSupabase().from("product_images").select("id, storage_path").eq("id", req.params.imageId).eq("product_id", req.params.productId).maybeSingle();
  if (error) throw new HttpError(500, "Nu am putut citi imaginea.", error);
  if (!image) throw new HttpError(404, "Imaginea nu a fost găsită.");
  const deletion = await getSupabase().from("product_images").delete().eq("id", image.id).eq("product_id", req.params.productId);
  if (deletion.error) throw new HttpError(500, "Nu am putut șterge imaginea.", deletion.error);
  if (image.storage_path) await removeProductObjects([image.storage_path]);
  const remaining = await orderedImages(req.params.productId);
  for (const [sortOrder, row] of remaining.entries()) await getSupabase().from("product_images").update({ sort_order: sortOrder }).eq("id", row.id).eq("product_id", req.params.productId);
  res.status(204).send();
}));
