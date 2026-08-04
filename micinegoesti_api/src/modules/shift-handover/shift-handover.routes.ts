import type { Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { config } from "../../config.js";
import { Role } from "../../constants.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { logWarn } from "../../lib/logger.js";
import { getSupabase } from "../../lib/supabase.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";
import {
  attachmentIsExpired,
  cleanupExpiredShiftHandoverUploads,
  deleteStoredHandoverFile,
  isMultipartRequest,
  parseMultipartRequest,
  resolveUploadPath,
  storeHandoverFile,
  type ParsedMultipartForm,
  type StoredHandoverFile
} from "./shift-handover.uploads.js";
import { sendShiftHandoverNotifications } from "./shift-handover.whatsapp.js";

export const shiftHandoverRouter = Router();

const SHIFT_ROLES = [Role.ADMIN, Role.STORE_MANAGER, Role.KITCHEN, Role.SHIFT_STAFF] as const;
const MANAGER_ROLES = [Role.ADMIN, Role.STORE_MANAGER] as const;
const SHIFT_KEYS = ["shift_1", "shift_2"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const STATUSES = ["new", "seen", "in_progress", "resolved", "archived"] as const;
const CATEGORIES = ["cleaning", "stock", "equipment", "customer_issue", "food_quality", "safety", "handover", "staff", "other"] as const;

const shiftKeySchema = z.enum(SHIFT_KEYS);
const optionalShiftKeySchema = z.preprocess((value) => (value === "" || value == null ? null : value), shiftKeySchema.nullable());

function isShiftRole(role?: string) {
  return SHIFT_ROLES.includes(role as (typeof SHIFT_ROLES)[number]);
}

function isManagerRole(role?: string) {
  return MANAGER_ROLES.includes(role as (typeof MANAGER_ROLES)[number]);
}

function requireShiftAccess(req: AuthenticatedRequest) {
  if (!req.user) throw new HttpError(401, "Authentication required.");
  if (!isShiftRole(req.user.role)) throw new HttpError(403, "Nu ai acces la predarea de ture.");
}

function firstField(fields: Record<string, string[]>, name: string) {
  return fields[name]?.[0];
}

function fieldsFromBody(body: unknown) {
  if (!body || typeof body !== "object") return {};
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).map(([key, value]) => [key, Array.isArray(value) ? value.map(String) : [String(value ?? "")]])
  );
}

function parseCaptions(raw: unknown) {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function parseItemRequest(req: AuthenticatedRequest) {
  if (isMultipartRequest(req)) {
    return parseMultipartRequest(req);
  }

  return {
    fields: fieldsFromBody(req.body),
    files: []
  } satisfies ParsedMultipartForm;
}

export async function ensureShiftTemplates() {
  const { error } = await getSupabase().from("shift_templates").upsert(
    [
      { shift_key: "shift_1", label: "Tura 1", default_start_time: "09:00", default_end_time: "17:00", color: "#ff4d00" },
      { shift_key: "shift_2", label: "Tura 2", default_start_time: "17:00", default_end_time: "21:00", color: "#ffd446" }
    ],
    { onConflict: "shift_key", ignoreDuplicates: true }
  );
  if (error) throw new HttpError(500, "Nu am putut inițializa turele.", error);
}

export async function getUserShiftProfile(userId: string) {
  const { data, error } = await getSupabase().from("user_shift_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new HttpError(500, "Nu am putut citi profilul de tură.", error);
  return data;
}

async function writeAudit(actorUserId: string | undefined, action: string, entityType: string, entityId?: string | null, metadata?: unknown) {
  const { error } = await getSupabase().from("shift_audit_logs").insert({
    actor_user_id: actorUserId ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId ?? null,
    metadata: metadata == null ? null : JSON.stringify(metadata)
  });

  if (error) {
    logWarn("shift-handover:audit-failed", { action, entityType, entityId, error });
  }
}

function serializeTemplate(row: any) {
  return {
    id: row.id,
    shiftKey: row.shift_key,
    label: row.label,
    defaultStartTime: row.default_start_time,
    defaultEndTime: row.default_end_time,
    color: row.color,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializeProfile(row: any | null) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    shiftKey: row.shift_key,
    displayName: row.display_name,
    whatsappNumber: row.whatsapp_number,
    notificationsEnabled: row.notifications_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializeAttachment(row: any) {
  const expired = attachmentIsExpired(row);
  return {
    id: row.id,
    handoverItemId: row.handover_item_id,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes ?? 0),
    sha256: row.sha256,
    caption: row.caption,
    expiresAt: row.expires_at,
    deletedAt: row.deleted_at,
    deleteReason: row.delete_reason,
    createdAt: row.created_at,
    isDeleted: Boolean(row.deleted_at),
    isExpired: expired,
    isAvailable: !row.deleted_at && !expired
  };
}

function serializeComment(row: any) {
  return {
    id: row.id,
    handoverItemId: row.handover_item_id,
    createdByUserId: row.created_by_user_id,
    body: row.body,
    createdAt: row.created_at
  };
}

function serializeNotification(row: any) {
  return {
    id: row.id,
    handoverItemId: row.handover_item_id,
    subscriberId: row.subscriber_id,
    toNumber: row.to_number,
    provider: row.provider,
    status: row.status,
    messagePreview: row.message_preview,
    providerMessageId: row.provider_message_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    sentAt: row.sent_at
  };
}

function serializeItem(row: any, options: { attachments?: any[]; comments?: any[]; notifications?: any[] } = {}) {
  const attachments = options.attachments?.map(serializeAttachment) ?? [];
  const comments = options.comments?.map(serializeComment) ?? [];
  return {
    id: row.id,
    code: row.code,
    createdByUserId: row.created_by_user_id,
    sourceShiftKey: row.source_shift_key,
    targetShiftKey: row.target_shift_key,
    category: row.category,
    priority: row.priority,
    locationLabel: row.location_label,
    title: row.title,
    description: row.description,
    status: row.status,
    acknowledgedByUserId: row.acknowledged_by_user_id,
    acknowledgedAt: row.acknowledged_at,
    resolvedByUserId: row.resolved_by_user_id,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photoCount: row.photo_count ?? attachments.length,
    commentCount: row.comment_count ?? comments.length,
    attachments,
    comments,
    notifications: options.notifications?.map(serializeNotification) ?? []
  };
}

async function getHandoverItemRecord(id: string) {
  const { data, error } = await getSupabase().from("shift_handover_items").select("*").eq("id", id).maybeSingle();
  if (error) throw new HttpError(500, "Nu am putut citi predarea.", error);
  if (!data) throw new HttpError(404, "Predarea nu a fost găsită.");
  return data;
}

async function getHandoverItemWithDetails(id: string) {
  const item = await getHandoverItemRecord(id);
  const [attachmentsResult, commentsResult, notificationsResult] = await Promise.all([
    getSupabase().from("shift_handover_attachments").select("*").eq("handover_item_id", id).order("created_at", { ascending: true }),
    getSupabase().from("shift_handover_comments").select("*").eq("handover_item_id", id).order("created_at", { ascending: true }),
    getSupabase().from("shift_whatsapp_notifications").select("*").eq("handover_item_id", id).order("created_at", { ascending: false }).limit(20)
  ]);
  if (attachmentsResult.error) throw new HttpError(500, "Nu am putut citi pozele.", attachmentsResult.error);
  if (commentsResult.error) throw new HttpError(500, "Nu am putut citi comentariile.", commentsResult.error);
  if (notificationsResult.error) throw new HttpError(500, "Nu am putut citi notificările.", notificationsResult.error);
  return serializeItem(item, {
    attachments: attachmentsResult.data ?? [],
    comments: commentsResult.data ?? [],
    notifications: notificationsResult.data ?? []
  });
}

async function nextHandoverCode() {
  const year = new Date().getFullYear();
  const start = new Date(Date.UTC(year, 0, 1)).toISOString();
  const { count, error } = await getSupabase()
    .from("shift_handover_items")
    .select("id", { count: "exact", head: true })
    .gte("created_at", start);
  if (error) throw new HttpError(500, "Nu am putut genera codul predării.", error);
  return `SH-${year}-${String((count ?? 0) + 1).padStart(6, "0")}`;
}

async function insertItemWithRetry(payload: Record<string, unknown>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await getSupabase()
      .from("shift_handover_items")
      .insert({ ...payload, code: attempt === 0 ? await nextHandoverCode() : `SH-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}` })
      .select("*")
      .single();
    if (!error) return data;
    lastError = error;
  }

  throw new HttpError(500, "Nu am putut salva predarea.", lastError);
}

async function saveAttachments(itemId: string, userId: string | undefined, files: ParsedMultipartForm["files"], captions: string[]) {
  const storedFiles: StoredHandoverFile[] = [];
  if (!files.length) return [];

  try {
    for (const file of files) {
      storedFiles.push(await storeHandoverFile(file));
    }

    const expiresAt = new Date(Date.now() + config.shiftHandover.uploadRetentionDays * 24 * 60 * 60 * 1000).toISOString();
    const payload = storedFiles.map((file, index) => ({
      handover_item_id: itemId,
      uploaded_by_user_id: userId ?? null,
      original_filename: file.originalFilename ?? null,
      stored_filename: file.storedFilename,
      relative_path: file.relativePath,
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes,
      sha256: file.sha256,
      caption: captions[index]?.trim() || null,
      expires_at: expiresAt
    }));

    const { data, error } = await getSupabase().from("shift_handover_attachments").insert(payload).select("*");
    if (error) throw new HttpError(500, "Nu am putut salva pozele predării.", error);
    return data ?? [];
  } catch (error) {
    await Promise.all(
      storedFiles.map((file) =>
        deleteStoredHandoverFile(file.relativePath).catch((caught) => {
          logWarn("shift-handover:upload-rollback-failed", {
            relativePath: file.relativePath,
            error: caught instanceof Error ? caught.message : String(caught)
          });
        })
      )
    );
    throw error;
  }
}

const createItemSchema = z.object({
  sourceShiftKey: shiftKeySchema.optional(),
  targetShiftKey: optionalShiftKeySchema.default(null),
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES).default("normal"),
  locationLabel: z.string().trim().max(120).optional().nullable(),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().max(4000).optional().nullable(),
  notifyWhatsAppNumber: z.string().trim().max(40).optional().nullable(),
  captions: z.unknown().optional()
});

const patchItemSchema = z.object({
  sourceShiftKey: shiftKeySchema.optional(),
  targetShiftKey: optionalShiftKeySchema.optional(),
  category: z.enum(CATEGORIES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  locationLabel: z.string().trim().max(120).optional().nullable(),
  title: z.string().trim().min(3).max(180).optional(),
  description: z.string().trim().max(4000).optional().nullable(),
  status: z.enum(STATUSES).optional()
});

function itemInputFromFields(fields: Record<string, string[]>) {
  return {
    sourceShiftKey: firstField(fields, "sourceShiftKey") || undefined,
    targetShiftKey: firstField(fields, "targetShiftKey") ?? null,
    category: firstField(fields, "category"),
    priority: firstField(fields, "priority") || "normal",
    locationLabel: firstField(fields, "locationLabel") || null,
    title: firstField(fields, "title"),
    description: firstField(fields, "description") || null,
    notifyWhatsAppNumber: firstField(fields, "notifyWhatsAppNumber") || null,
    captions: firstField(fields, "captions")
  };
}

function statusUpdateFor(nextStatus: string, userId?: string) {
  if (nextStatus === "resolved") {
    return { status: "resolved", resolved_by_user_id: userId ?? null, resolved_at: new Date().toISOString() };
  }
  if (nextStatus !== "archived") {
    return { status: nextStatus, resolved_by_user_id: null, resolved_at: null };
  }
  return { status: nextStatus };
}

shiftHandoverRouter.get(
  "/shift-handover/health",
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, service: "shift-handover" });
  })
);

shiftHandoverRouter.get(
  "/shift-handover/me",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    requireShiftAccess(req);
    await ensureShiftTemplates();
    const [profile, templatesResult] = await Promise.all([
      getUserShiftProfile(req.user!.id),
      getSupabase().from("shift_templates").select("*").order("shift_key")
    ]);
    if (templatesResult.error) throw new HttpError(500, "Nu am putut citi turele.", templatesResult.error);

    res.json({
      user: req.user,
      profile: serializeProfile(profile),
      templates: (templatesResult.data ?? []).map(serializeTemplate),
      permissions: {
        canManage: isManagerRole(req.user?.role),
        canDelete: req.user?.role === Role.ADMIN,
        canManageSubscribers: isManagerRole(req.user?.role),
        canManageSchedule: isManagerRole(req.user?.role)
      }
    });
  })
);

shiftHandoverRouter.get(
  "/shift-handover/items",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    requireShiftAccess(req);
    let query = getSupabase().from("shift_handover_items").select("*").order("created_at", { ascending: false }).limit(200);

    for (const [param, column] of [
      ["priority", "priority"],
      ["category", "category"],
      ["status", "status"],
      ["sourceShiftKey", "source_shift_key"]
    ] as const) {
      if (typeof req.query[param] === "string" && req.query[param]) query = query.eq(column, req.query[param]);
    }

    if (typeof req.query.targetShiftKey === "string" && req.query.targetShiftKey) {
      if (req.query.targetShiftKey === "general") query = query.is("target_shift_key", null);
      else query = query.eq("target_shift_key", req.query.targetShiftKey);
    }

    if (typeof req.query.dateFrom === "string" && req.query.dateFrom) query = query.gte("created_at", req.query.dateFrom);
    if (typeof req.query.dateTo === "string" && req.query.dateTo) query = query.lte("created_at", req.query.dateTo);

    const { data, error } = await query;
    if (error) throw new HttpError(500, "Nu am putut citi predările.", error);

    const ids = (data ?? []).map((item) => item.id);
    const [attachmentsResult, commentsResult] = await Promise.all([
      ids.length ? getSupabase().from("shift_handover_attachments").select("id, handover_item_id").in("handover_item_id", ids) : Promise.resolve({ data: [], error: null }),
      ids.length ? getSupabase().from("shift_handover_comments").select("id, handover_item_id").in("handover_item_id", ids) : Promise.resolve({ data: [], error: null })
    ]);
    if (attachmentsResult.error) throw new HttpError(500, "Nu am putut citi numărul de poze.", attachmentsResult.error);
    if (commentsResult.error) throw new HttpError(500, "Nu am putut citi numărul de comentarii.", commentsResult.error);

    const photoCounts = new Map<string, number>();
    const commentCounts = new Map<string, number>();
    for (const attachment of attachmentsResult.data ?? []) photoCounts.set(attachment.handover_item_id, (photoCounts.get(attachment.handover_item_id) ?? 0) + 1);
    for (const comment of commentsResult.data ?? []) commentCounts.set(comment.handover_item_id, (commentCounts.get(comment.handover_item_id) ?? 0) + 1);

    let items = (data ?? []).map((item) => serializeItem({ ...item, photo_count: photoCounts.get(item.id) ?? 0, comment_count: commentCounts.get(item.id) ?? 0 }));
    if (req.query.hasPhotos === "true") items = items.filter((item) => item.photoCount > 0);
    res.json({ items });
  })
);

shiftHandoverRouter.post(
  "/shift-handover/items",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    requireShiftAccess(req);
    await ensureShiftTemplates();
    const parsed = await parseItemRequest(req);
    const input = createItemSchema.parse(itemInputFromFields(parsed.fields));
    const profile = await getUserShiftProfile(req.user!.id);
    const isManager = isManagerRole(req.user?.role);

    if (!isManager && profile?.shift_key && input.sourceShiftKey && input.sourceShiftKey !== profile.shift_key) {
      throw new HttpError(403, "Nu poți trimite predarea din altă tură.");
    }

    const sourceShiftKey = isManager ? input.sourceShiftKey : profile?.shift_key ?? input.sourceShiftKey;
    if (!sourceShiftKey) throw new HttpError(400, "Alege tura sursă pentru predare.");

    const item = await insertItemWithRetry({
      created_by_user_id: req.user?.id ?? null,
      source_shift_key: sourceShiftKey,
      target_shift_key: input.targetShiftKey,
      category: input.category,
      priority: input.priority,
      location_label: input.locationLabel || null,
      title: input.title,
      description: input.description || null,
      status: "new"
    });

    const attachments = await saveAttachments(item.id, req.user?.id, parsed.files, parseCaptions(input.captions));
    await writeAudit(req.user?.id, "create", "shift_handover_item", item.id, { code: item.code, photoCount: attachments.length });

    let whatsapp = null;
    if (["high", "urgent"].includes(item.priority) || input.notifyWhatsAppNumber) {
      whatsapp = await sendShiftHandoverNotifications(item, {
        includeSubscribers: ["high", "urgent"].includes(item.priority),
        oneTimeNumbers: input.notifyWhatsAppNumber ? [input.notifyWhatsAppNumber] : []
      });
    }

    res.status(201).json({ item: await getHandoverItemWithDetails(item.id), whatsapp });
  })
);

shiftHandoverRouter.get(
  "/shift-handover/items/:id",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    requireShiftAccess(req);
    res.json({ item: await getHandoverItemWithDetails(req.params.id) });
  })
);

shiftHandoverRouter.patch(
  "/shift-handover/items/:id",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    requireShiftAccess(req);
    const item = await getHandoverItemRecord(req.params.id);
    const input = patchItemSchema.parse(req.body);
    const isManager = isManagerRole(req.user?.role);
    const update: Record<string, unknown> = {};

    if (isManager) {
      if (input.sourceShiftKey !== undefined) update.source_shift_key = input.sourceShiftKey;
      if (input.targetShiftKey !== undefined) update.target_shift_key = input.targetShiftKey;
      if (input.category !== undefined) update.category = input.category;
      if (input.priority !== undefined) update.priority = input.priority;
      if (input.locationLabel !== undefined) update.location_label = input.locationLabel || null;
      if (input.title !== undefined) update.title = input.title;
      if (input.description !== undefined) update.description = input.description || null;
      if (input.status !== undefined) Object.assign(update, statusUpdateFor(input.status, req.user?.id));
    } else {
      if (!input.status || !["seen", "in_progress", "resolved"].includes(input.status)) {
        throw new HttpError(403, "Poți actualiza doar statusul predării.");
      }
      if (req.user?.role === Role.SHIFT_STAFF && input.status === "resolved" && item.created_by_user_id !== req.user.id) {
        throw new HttpError(403, "Poți marca drept corectate doar predările tale.");
      }
      Object.assign(update, statusUpdateFor(input.status, req.user?.id));
    }

    if (!Object.keys(update).length) throw new HttpError(400, "Nu există modificări de salvat.");

    const { data, error } = await getSupabase().from("shift_handover_items").update(update).eq("id", req.params.id).select("*").single();
    if (error) throw new HttpError(500, "Nu am putut actualiza predarea.", error);
    await writeAudit(req.user?.id, "update", "shift_handover_item", req.params.id, update);
    res.json({ item: await getHandoverItemWithDetails(data.id) });
  })
);

shiftHandoverRouter.post(
  "/shift-handover/items/:id/comments",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    requireShiftAccess(req);
    await getHandoverItemRecord(req.params.id);
    const input = z.object({ body: z.string().trim().min(1).max(2000) }).parse(req.body);
    const { error } = await getSupabase().from("shift_handover_comments").insert({
      handover_item_id: req.params.id,
      created_by_user_id: req.user?.id ?? null,
      body: input.body
    });
    if (error) throw new HttpError(500, "Nu am putut salva comentariul.", error);
    await writeAudit(req.user?.id, "comment", "shift_handover_item", req.params.id);
    res.status(201).json({ item: await getHandoverItemWithDetails(req.params.id) });
  })
);

shiftHandoverRouter.post(
  "/shift-handover/items/:id/acknowledge",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    requireShiftAccess(req);
    const item = await getHandoverItemRecord(req.params.id);
    const update = {
      acknowledged_by_user_id: req.user?.id ?? null,
      acknowledged_at: new Date().toISOString(),
      status: item.status === "new" ? "seen" : item.status
    };
    const { error } = await getSupabase().from("shift_handover_items").update(update).eq("id", req.params.id);
    if (error) throw new HttpError(500, "Nu am putut confirma predarea.", error);
    await writeAudit(req.user?.id, "acknowledge", "shift_handover_item", req.params.id);
    res.json({ item: await getHandoverItemWithDetails(req.params.id) });
  })
);

shiftHandoverRouter.post(
  "/shift-handover/items/:id/resolve",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    requireShiftAccess(req);
    const item = await getHandoverItemRecord(req.params.id);
    if (req.user?.role === Role.SHIFT_STAFF && item.created_by_user_id !== req.user.id) {
      throw new HttpError(403, "Poți marca drept corectate doar predările tale.");
    }
    const { error } = await getSupabase()
      .from("shift_handover_items")
      .update(statusUpdateFor("resolved", req.user?.id))
      .eq("id", req.params.id);
    if (error) throw new HttpError(500, "Nu am putut rezolva predarea.", error);
    await writeAudit(req.user?.id, "resolve", "shift_handover_item", req.params.id);
    res.json({ item: await getHandoverItemWithDetails(req.params.id) });
  })
);

shiftHandoverRouter.post(
  "/shift-handover/items/:id/notify",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    requireShiftAccess(req);
    const item = await getHandoverItemRecord(req.params.id);
    const input = z.object({ whatsappNumber: z.string().trim().optional(), subscribers: z.boolean().optional() }).parse(req.body ?? {});
    const whatsapp = await sendShiftHandoverNotifications(item, {
      includeSubscribers: input.subscribers ?? !input.whatsappNumber,
      oneTimeNumbers: input.whatsappNumber ? [input.whatsappNumber] : []
    });
    await writeAudit(req.user?.id, "notify", "shift_handover_item", req.params.id, { count: whatsapp.results.length });
    res.json({ whatsapp, item: await getHandoverItemWithDetails(req.params.id) });
  })
);

shiftHandoverRouter.delete(
  "/shift-handover/items/:id",
  requireRoles(Role.ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { error } = await getSupabase().from("shift_handover_items").update({ status: "archived" }).eq("id", req.params.id);
    if (error) throw new HttpError(500, "Nu am putut arhiva predarea.", error);
    await writeAudit(req.user?.id, "archive", "shift_handover_item", req.params.id);
    res.status(204).send();
  })
);

shiftHandoverRouter.get(
  "/shift-handover/attachments/:attachmentId/file",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response, next) => {
    requireShiftAccess(req);
    const { data, error } = await getSupabase()
      .from("shift_handover_attachments")
      .select("*")
      .eq("id", req.params.attachmentId)
      .maybeSingle();
    if (error) throw new HttpError(500, "Nu am putut citi poza.", error);
    if (!data) throw new HttpError(404, "Poza nu a fost găsită.");
    if (data.deleted_at || attachmentIsExpired(data)) {
      res.status(410).json({
        message: "Poza a fost ștearsă automat după 7 zile. Înregistrarea a fost păstrată."
      });
      return;
    }

    const absolutePath = resolveUploadPath(data.relative_path);
    res.type(data.mime_type);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.sendFile(absolutePath, (sendError) => {
      if (sendError) next(new HttpError(404, "Fișierul pozei nu mai există pe server."));
    });
  })
);

shiftHandoverRouter.delete(
  "/shift-handover/attachments/:attachmentId",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { data, error } = await getSupabase()
      .from("shift_handover_attachments")
      .select("*")
      .eq("id", req.params.attachmentId)
      .maybeSingle();
    if (error) throw new HttpError(500, "Nu am putut citi poza.", error);
    if (!data) throw new HttpError(404, "Poza nu a fost găsită.");

    if (!data.deleted_at) {
      await deleteStoredHandoverFile(data.relative_path).catch((caught) => {
        if ((caught as NodeJS.ErrnoException).code !== "ENOENT") throw caught;
      });
      const { error: updateError } = await getSupabase()
        .from("shift_handover_attachments")
        .update({ deleted_at: new Date().toISOString(), delete_reason: "manual_deleted" })
        .eq("id", data.id);
      if (updateError) throw new HttpError(500, "Nu am putut marca poza ștearsă.", updateError);
      await writeAudit(req.user?.id, "delete_attachment", "shift_handover_attachment", data.id);
    }

    res.status(204).send();
  })
);

shiftHandoverRouter.get(
  "/shift-handover/subscribers",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER),
  asyncHandler(async (_req, res) => {
    const { data, error } = await getSupabase().from("shift_whatsapp_subscribers").select("*").order("created_at", { ascending: false });
    if (error) throw new HttpError(500, "Nu am putut citi abonații.", error);
    res.json({
      subscribers: (data ?? []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        displayName: row.display_name,
        whatsappNumber: row.whatsapp_number,
        shiftFilter: row.shift_filter,
        priorityFilter: row.priority_filter,
        enabled: row.enabled,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    });
  })
);

const subscriberSchema = z.object({
  userId: z.string().optional().nullable(),
  displayName: z.string().trim().min(2).max(120),
  whatsappNumber: z.string().trim().min(6).max(40),
  shiftFilter: z.enum(["all", ...SHIFT_KEYS]).default("all"),
  priorityFilter: z.enum(["all", "high_urgent", "urgent_only"]).default("all"),
  enabled: z.boolean().default(true)
});

shiftHandoverRouter.post(
  "/shift-handover/subscribers",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER),
  asyncHandler(async (req, res) => {
    const input = subscriberSchema.parse(req.body);
    const { data, error } = await getSupabase()
      .from("shift_whatsapp_subscribers")
      .insert({
        user_id: input.userId ?? null,
        display_name: input.displayName,
        whatsapp_number: input.whatsappNumber,
        shift_filter: input.shiftFilter,
        priority_filter: input.priorityFilter,
        enabled: input.enabled
      })
      .select("*")
      .single();
    if (error) throw new HttpError(500, "Nu am putut salva abonatul.", error);
    res.status(201).json({ subscriber: data });
  })
);

shiftHandoverRouter.patch(
  "/shift-handover/subscribers/:id",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER),
  asyncHandler(async (req, res) => {
    const input = subscriberSchema.partial().parse(req.body);
    const { data, error } = await getSupabase()
      .from("shift_whatsapp_subscribers")
      .update({
        user_id: input.userId,
        display_name: input.displayName,
        whatsapp_number: input.whatsappNumber,
        shift_filter: input.shiftFilter,
        priority_filter: input.priorityFilter,
        enabled: input.enabled
      })
      .eq("id", req.params.id)
      .select("*")
      .single();
    if (error) throw new HttpError(500, "Nu am putut actualiza abonatul.", error);
    res.json({ subscriber: data });
  })
);

shiftHandoverRouter.delete(
  "/shift-handover/subscribers/:id",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER),
  asyncHandler(async (req, res) => {
    const { error } = await getSupabase().from("shift_whatsapp_subscribers").delete().eq("id", req.params.id);
    if (error) throw new HttpError(500, "Nu am putut șterge abonatul.", error);
    res.status(204).send();
  })
);

shiftHandoverRouter.get(
  "/shift-handover/templates",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    requireShiftAccess(req);
    await ensureShiftTemplates();
    const { data, error } = await getSupabase().from("shift_templates").select("*").order("shift_key");
    if (error) throw new HttpError(500, "Nu am putut citi turele.", error);
    res.json({ templates: (data ?? []).map(serializeTemplate) });
  })
);

shiftHandoverRouter.patch(
  "/shift-handover/templates/:id",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        label: z.string().trim().min(2).max(80).optional(),
        defaultStartTime: z.string().trim().max(10).optional().nullable(),
        defaultEndTime: z.string().trim().max(10).optional().nullable(),
        color: z.string().trim().max(40).optional().nullable(),
        isActive: z.boolean().optional()
      })
      .parse(req.body);
    const { data, error } = await getSupabase()
      .from("shift_templates")
      .update({
        label: input.label,
        default_start_time: input.defaultStartTime,
        default_end_time: input.defaultEndTime,
        color: input.color,
        is_active: input.isActive
      })
      .eq("id", req.params.id)
      .select("*")
      .single();
    if (error) throw new HttpError(500, "Nu am putut actualiza tura.", error);
    res.json({ template: serializeTemplate(data) });
  })
);

shiftHandoverRouter.post(
  "/shift-handover/cleanup-uploads",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const providedSecret = req.header("x-shift-cleanup-secret") ?? (typeof req.query.secret === "string" ? req.query.secret : "");
    const validSecret =
      config.shiftHandover.cleanupSecret &&
      config.shiftHandover.cleanupSecret !== "replace-with-secret" &&
      providedSecret === config.shiftHandover.cleanupSecret;
    const validAdmin = req.user?.role === Role.ADMIN;

    if (!validSecret && !validAdmin) {
      throw new HttpError(403, "Nu ai permisiune pentru curățarea pozelor.");
    }

    const result = await cleanupExpiredShiftHandoverUploads();
    await writeAudit(req.user?.id, "cleanup_uploads", "shift_handover_attachment", null, result);
    res.json(result);
  })
);
