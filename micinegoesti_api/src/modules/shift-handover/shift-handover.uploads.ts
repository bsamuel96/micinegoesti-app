import type { Request } from "express";
import crypto from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";
import { HttpError } from "../../lib/http.js";
import { logInfo, logWarn } from "../../lib/logger.js";
import { getSupabase } from "../../lib/supabase.js";

export type ParsedMultipartFile = {
  fieldName: string;
  originalFilename?: string | null;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
};

export type ParsedMultipartForm = {
  fields: Record<string, string[]>;
  files: ParsedMultipartFile[];
};

export type StoredHandoverFile = {
  originalFilename?: string | null;
  storedFilename: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};

const HEADER_SEPARATOR = Buffer.from("\r\n\r\n");
const LINE_BREAK = Buffer.from("\r\n");

function boundaryFromContentType(contentType?: string) {
  const match = contentType?.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return match?.[1] ?? match?.[2] ?? null;
}

function splitBuffer(buffer: Buffer, separator: Buffer) {
  const parts: Buffer[] = [];
  let start = 0;
  let index = buffer.indexOf(separator, start);

  while (index !== -1) {
    parts.push(buffer.subarray(start, index));
    start = index + separator.length;
    index = buffer.indexOf(separator, start);
  }

  parts.push(buffer.subarray(start));
  return parts;
}

function trimMultipartPart(part: Buffer) {
  let value = part;
  if (value.subarray(0, 2).equals(LINE_BREAK)) value = value.subarray(2);
  if (value.subarray(value.length - 2).equals(LINE_BREAK)) value = value.subarray(0, value.length - 2);
  if (value.subarray(value.length - 2).toString("utf8") === "--") value = value.subarray(0, value.length - 2);
  if (value.subarray(value.length - 2).equals(LINE_BREAK)) value = value.subarray(0, value.length - 2);
  return value;
}

function parseDisposition(value?: string) {
  const params: Record<string, string> = {};
  if (!value) return params;

  for (const part of value.split(";").slice(1)) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey || !rawValue.length) continue;
    const joined = rawValue.join("=").trim();
    params[rawKey.toLowerCase()] = joined.replace(/^"|"$/g, "").replace(/\\"/g, "\"");
  }

  return params;
}

function readRequestBody(req: Request, limitBytes: number) {
  const contentLength = Number(req.header("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > limitBytes) {
    throw new HttpError(413, "Fișierele sunt prea mari pentru încărcare.");
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    req.on("data", (chunk: Buffer) => {
      if (settled) return;
      total += chunk.length;
      if (total > limitBytes) {
        settled = true;
        reject(new HttpError(413, "Fișierele sunt prea mari pentru încărcare."));
        req.destroy();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });

    req.on("end", () => {
      if (!settled) resolve(Buffer.concat(chunks));
    });

    req.on("error", (error) => {
      if (!settled) reject(error);
    });
  });
}

function detectImageMime(buffer: Buffer, declaredMime: string) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }

  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii").toLowerCase();
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (["heif", "mif1", "msf1"].includes(brand)) return "image/heif";
  }

  return declaredMime;
}

function validateFile(file: ParsedMultipartFile) {
  if (!config.shiftHandover.allowedMimes.includes(file.mimeType)) {
    throw new HttpError(415, `Tipul de fișier nu este permis: ${file.mimeType}`);
  }

  if (file.sizeBytes <= 0) {
    throw new HttpError(400, "Fișierul încărcat este gol.");
  }

  if (file.sizeBytes > config.shiftHandover.uploadMaxSize) {
    throw new HttpError(413, "O poză depășește limita de dimensiune permisă.");
  }

  const detectedMime = detectImageMime(file.buffer, file.mimeType);
  const compatible =
    detectedMime === file.mimeType ||
    (["image/heic", "image/heif"].includes(detectedMime) && ["image/heic", "image/heif"].includes(file.mimeType));

  if (!compatible || !config.shiftHandover.allowedMimes.includes(detectedMime)) {
    throw new HttpError(415, "Fișierul nu pare să fie o imagine validă.");
  }
}

export function isMultipartRequest(req: Request) {
  return req.header("content-type")?.toLowerCase().startsWith("multipart/form-data") ?? false;
}

export async function parseMultipartRequest(req: Request): Promise<ParsedMultipartForm> {
  const boundary = boundaryFromContentType(req.header("content-type"));
  if (!boundary) throw new HttpError(400, "Boundary multipart lipsă.");

  const totalLimit = config.shiftHandover.uploadMaxFiles * config.shiftHandover.uploadMaxSize + 1024 * 1024;
  const body = await readRequestBody(req, totalLimit);
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const rawParts = splitBuffer(body, boundaryBuffer).slice(1);
  const fields: Record<string, string[]> = {};
  const files: ParsedMultipartFile[] = [];

  for (const rawPart of rawParts) {
    const part = trimMultipartPart(rawPart);
    if (!part.length || part.equals(Buffer.from("--"))) continue;

    const headerEnd = part.indexOf(HEADER_SEPARATOR);
    if (headerEnd < 0) continue;

    const headerLines = part.subarray(0, headerEnd).toString("utf8").split("\r\n");
    const headers = new Map<string, string>();
    for (const line of headerLines) {
      const separator = line.indexOf(":");
      if (separator < 0) continue;
      headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
    }

    const disposition = parseDisposition(headers.get("content-disposition"));
    const fieldName = disposition.name;
    if (!fieldName) continue;

    const content = part.subarray(headerEnd + HEADER_SEPARATOR.length);
    if (disposition.filename != null && disposition.filename !== "") {
      const mimeType = (headers.get("content-type") ?? "application/octet-stream").toLowerCase();
      files.push({
        fieldName,
        originalFilename: disposition.filename,
        mimeType,
        sizeBytes: content.length,
        buffer: Buffer.from(content)
      });
    } else {
      fields[fieldName] ??= [];
      fields[fieldName].push(content.toString("utf8"));
    }
  }

  if (files.length > config.shiftHandover.uploadMaxFiles) {
    throw new HttpError(413, `Poți încărca maximum ${config.shiftHandover.uploadMaxFiles} poze.`);
  }

  for (const file of files) validateFile(file);
  return { fields, files };
}

function extensionForMime(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/heic":
      return ".heic";
    case "image/heif":
      return ".heif";
    default:
      return ".bin";
  }
}

export function resolveUploadPath(relativePath: string) {
  if (path.isAbsolute(relativePath) || relativePath.includes("..")) {
    throw new HttpError(400, "Calea fișierului nu este validă.");
  }

  const root = path.resolve(config.shiftHandover.uploadDir);
  const absolutePath = path.resolve(root, relativePath);
  if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new HttpError(400, "Calea fișierului nu este validă.");
  }

  return absolutePath;
}

export async function storeHandoverFile(file: ParsedMultipartFile): Promise<StoredHandoverFile> {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const storedFilename = `${crypto.randomBytes(18).toString("hex")}${extensionForMime(file.mimeType)}`;
  const relativePath = path.posix.join(year, month, day, storedFilename);
  const absolutePath = resolveUploadPath(relativePath);
  const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, file.buffer, { flag: "wx" });

  return {
    originalFilename: file.originalFilename,
    storedFilename,
    relativePath,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    sha256
  };
}

export async function deleteStoredHandoverFile(relativePath: string) {
  const absolutePath = resolveUploadPath(relativePath);

  try {
    await unlink(absolutePath);
    return "deleted" as const;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing" as const;
    throw error;
  }
}

export function attachmentIsExpired(attachment: { expires_at?: string | null; expiresAt?: string | null }) {
  const raw = attachment.expires_at ?? attachment.expiresAt;
  return Boolean(raw && new Date(raw).getTime() <= Date.now());
}

export async function cleanupExpiredShiftHandoverUploads() {
  const now = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from("shift_handover_attachments")
    .select("id, relative_path")
    .is("deleted_at", null)
    .lt("expires_at", now);
  if (error) throw new HttpError(500, "Nu am putut citi pozele expirate.", error);

  let deleted = 0;
  let missing = 0;
  let failed = 0;

  for (const attachment of data ?? []) {
    try {
      const result = await deleteStoredHandoverFile(attachment.relative_path);
      if (result === "deleted") deleted += 1;
      if (result === "missing") missing += 1;

      const { error: updateError } = await getSupabase()
        .from("shift_handover_attachments")
        .update({
          deleted_at: now,
          delete_reason: "retention_expired"
        })
        .eq("id", attachment.id);
      if (updateError) throw updateError;
    } catch (error) {
      failed += 1;
      logWarn("shift-handover:cleanup-file-failed", {
        attachmentId: attachment.id,
        relativePath: attachment.relative_path,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const result = { checked: data?.length ?? 0, deleted, missing, failed };
  logInfo("shift-handover:cleanup-complete", result);
  return result;
}
