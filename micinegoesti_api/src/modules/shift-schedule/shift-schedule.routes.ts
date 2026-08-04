import { Router } from "express";
import { z } from "zod";
import { Role } from "../../constants.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { getSupabase } from "../../lib/supabase.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";
import { ensureShiftTemplates, getUserShiftProfile } from "../shift-handover/shift-handover.routes.js";

export const shiftScheduleRouter = Router();

const SHIFT_ROLES = [Role.ADMIN, Role.STORE_MANAGER, Role.KITCHEN, Role.SHIFT_STAFF] as const;
const SHIFT_KEYS = ["shift_1", "shift_2"] as const;
const SCHEDULE_STATUSES = ["planned", "confirmed", "completed", "cancelled"] as const;

function isShiftRole(role?: string) {
  return SHIFT_ROLES.includes(role as (typeof SHIFT_ROLES)[number]);
}

function isManagerRole(role?: string) {
  return role === Role.ADMIN || role === Role.STORE_MANAGER;
}

function requireScheduleAccess(req: AuthenticatedRequest) {
  if (!req.user) throw new HttpError(401, "Authentication required.");
  if (!isShiftRole(req.user.role)) throw new HttpError(403, "Nu ai acces la programul turelor.");
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function defaultDateRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { from: toDateOnly(start), to: toDateOnly(end) };
}

function serializeSchedule(row: any) {
  return {
    id: row.id,
    scheduleDate: row.schedule_date,
    shiftKey: row.shift_key,
    assignedUserId: row.assigned_user_id,
    managerUserId: row.manager_user_id,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    notes: row.notes,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const scheduleSchema = z.object({
  scheduleDate: z.string().min(8),
  shiftKey: z.enum(SHIFT_KEYS),
  assignedUserId: z.string().optional().nullable(),
  managerUserId: z.string().optional().nullable(),
  startTime: z.string().trim().max(10).optional().nullable(),
  endTime: z.string().trim().max(10).optional().nullable(),
  status: z.enum(SCHEDULE_STATUSES).default("planned"),
  notes: z.string().trim().max(2000).optional().nullable()
});

async function getScheduleRecord(id: string) {
  const { data, error } = await getSupabase().from("shift_schedules").select("*").eq("id", id).maybeSingle();
  if (error) throw new HttpError(500, "Nu am putut citi programarea.", error);
  if (!data) throw new HttpError(404, "Programarea nu a fost găsită.");
  return data;
}

async function userCanConfirm(req: AuthenticatedRequest, row: any) {
  if (!req.user) return false;
  if (row.assigned_user_id === req.user.id) return true;
  const profile = await getUserShiftProfile(req.user.id);
  return Boolean(profile?.shift_key && profile.shift_key === row.shift_key);
}

shiftScheduleRouter.get(
  "/shift-schedule",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    requireScheduleAccess(req);
    await ensureShiftTemplates();
    const fallback = defaultDateRange();
    const from = typeof req.query.from === "string" && req.query.from ? req.query.from : fallback.from;
    const to = typeof req.query.to === "string" && req.query.to ? req.query.to : fallback.to;

    let query = getSupabase()
      .from("shift_schedules")
      .select("*")
      .gte("schedule_date", from)
      .lte("schedule_date", to)
      .order("schedule_date", { ascending: true })
      .order("shift_key", { ascending: true });

    const profile = req.user ? await getUserShiftProfile(req.user.id) : null;
    if (req.user?.role === Role.SHIFT_STAFF && profile?.shift_key) {
      query = query.eq("shift_key", profile.shift_key);
    }

    if (typeof req.query.shiftKey === "string" && req.query.shiftKey) {
      query = query.eq("shift_key", req.query.shiftKey);
    }

    const { data, error } = await query;
    if (error) throw new HttpError(500, "Nu am putut citi programul.", error);

    let schedules = (data ?? []).map(serializeSchedule);
    if (req.user?.role === Role.SHIFT_STAFF && !profile?.shift_key) {
      schedules = schedules.filter((schedule) => schedule.assignedUserId === req.user?.id);
    }

    res.json({ schedules });
  })
);

shiftScheduleRouter.post(
  "/shift-schedule",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await ensureShiftTemplates();
    const input = scheduleSchema.parse(req.body);
    const { data, error } = await getSupabase()
      .from("shift_schedules")
      .insert({
        schedule_date: input.scheduleDate,
        shift_key: input.shiftKey,
        assigned_user_id: input.assignedUserId ?? null,
        manager_user_id: input.managerUserId ?? req.user?.id ?? null,
        start_time: input.startTime || null,
        end_time: input.endTime || null,
        status: input.status,
        notes: input.notes || null,
        created_by_user_id: req.user?.id ?? null
      })
      .select("*")
      .single();
    if (error) throw new HttpError(500, "Nu am putut salva programarea.", error);
    res.status(201).json({ schedule: serializeSchedule(data) });
  })
);

shiftScheduleRouter.patch(
  "/shift-schedule/:id",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    requireScheduleAccess(req);
    const existing = await getScheduleRecord(req.params.id);
    const input = scheduleSchema.partial().parse(req.body);
    const manager = isManagerRole(req.user?.role);

    if (!manager) {
      if (input.status !== "confirmed" || !(await userCanConfirm(req, existing))) {
        throw new HttpError(403, "Poți doar confirma propria tură.");
      }
    }

    const update = manager
      ? {
          schedule_date: input.scheduleDate,
          shift_key: input.shiftKey,
          assigned_user_id: input.assignedUserId,
          manager_user_id: input.managerUserId,
          start_time: input.startTime,
          end_time: input.endTime,
          status: input.status,
          notes: input.notes
        }
      : {
          status: "confirmed"
        };

    const { data, error } = await getSupabase().from("shift_schedules").update(update).eq("id", req.params.id).select("*").single();
    if (error) throw new HttpError(500, "Nu am putut actualiza programarea.", error);
    res.json({ schedule: serializeSchedule(data) });
  })
);

shiftScheduleRouter.delete(
  "/shift-schedule/:id",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER),
  asyncHandler(async (req, res) => {
    const { error } = await getSupabase().from("shift_schedules").delete().eq("id", req.params.id);
    if (error) throw new HttpError(500, "Nu am putut șterge programarea.", error);
    res.status(204).send();
  })
);
