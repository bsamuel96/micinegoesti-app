import { randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { config } from "../../config.js";
import { HttpError } from "../../lib/http.js";
import { logError } from "../../lib/logger.js";
import { getSupabase } from "../../lib/supabase.js";

export const PRODUCT_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateProductImage(file: Pick<Express.Multer.File, "size" | "mimetype" | "originalname" | "buffer">) {
  if (!file.buffer?.length) throw new HttpError(400, "Imaginea este goală.");
  if (file.size > config.productImages.maxFileSize) throw new HttpError(413, "Imaginea depășește limita de 10 MB.");
  if (!PRODUCT_IMAGE_MIMES.has(file.mimetype.toLowerCase())) throw new HttpError(415, "Formatul imaginii nu este acceptat.");
  const extension = path.extname(file.originalname).toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp"].includes(extension)) throw new HttpError(415, "Formatul imaginii nu este acceptat.");
}

function safeFilename(filename: string) {
  const base = path.basename(filename, path.extname(filename))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "imagine";
}

export async function processProductImage(file: Express.Multer.File) {
  validateProductImage(file);
  try {
    const data = await sharp(file.buffer)
      .rotate()
      .resize({ width: config.productImages.maxDimension, height: config.productImages.maxDimension, fit: "inside", withoutEnlargement: true })
      .webp({ quality: config.productImages.quality })
      .toBuffer({ resolveWithObject: true });
    return {
      buffer: data.data,
      width: data.info.width,
      height: data.info.height,
      size: data.info.size,
      mimeType: "image/webp",
      objectName: `${randomUUID()}-${safeFilename(file.originalname)}.webp`
    };
  } catch {
    throw new HttpError(400, "Imaginea nu a putut fi procesată.");
  }
}

export function publicProductImageUrl(storagePath: string) {
  return getSupabase().storage.from(config.productImages.bucket).getPublicUrl(storagePath).data.publicUrl;
}

export async function removeProductObjects(paths: string[]) {
  if (!paths.length) return;
  const { error } = await getSupabase().storage.from(config.productImages.bucket).remove(paths);
  if (error) throw new HttpError(502, "Imaginea a fost eliminată din produs, dar ștergerea din storage a eșuat.", error);
}

export async function uploadProductImage(productId: string, file: Express.Multer.File, altText?: string) {
  const processed = await processProductImage(file);
  const storagePath = `products/${productId}/${processed.objectName}`;
  const storage = getSupabase().storage.from(config.productImages.bucket);
  const upload = await storage.upload(storagePath, processed.buffer, { contentType: processed.mimeType, upsert: false });
  if (upload.error) throw new HttpError(502, "Încărcarea imaginii a eșuat. Încearcă din nou.", upload.error);

  try {
    const countResult = await getSupabase().from("product_images").select("id", { count: "exact", head: true }).eq("product_id", productId);
    if (countResult.error) throw countResult.error;
    const { data, error } = await getSupabase()
      .from("product_images")
      .insert({
        product_id: productId,
        storage_path: storagePath,
        url: publicProductImageUrl(storagePath),
        alt: altText?.trim() || null,
        sort_order: countResult.count ?? 0,
        width: processed.width,
        height: processed.height,
        file_size: processed.size,
        mime_type: processed.mimeType
      })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    const cleanup = await storage.remove([storagePath]);
    if (cleanup.error) logError("product-image:rollback-failed", cleanup.error, { productId, storagePath });
    throw new HttpError(500, "Imaginea a fost procesată, dar nu a putut fi salvată.", error);
  }
}

