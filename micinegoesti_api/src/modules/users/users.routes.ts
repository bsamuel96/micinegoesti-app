import { Router } from "express";
import { z } from "zod";
import { ROLE_VALUES, Role } from "../../constants.js";
import { hashSecret } from "../../lib/auth.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { normalizePhone } from "../../lib/phone.js";
import { getSupabase } from "../../lib/supabase.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { requireRoles } from "../../middleware/auth.js";

export const usersRouter = Router();

const INTERNAL_STAFF_PHONE_PREFIX = "staff-no-phone:";

function isStaffRole(role: string) {
  return role !== Role.CUSTOMER;
}

function isInternalStaffPhone(phone: string) {
  return phone.startsWith(INTERNAL_STAFF_PHONE_PREFIX);
}

function serializeUser(user: any) {
  return {
    id: user.id,
    phone: isInternalStaffPhone(user.phone) ? "" : user.phone,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    shiftProfile: user.shiftProfile
      ? {
          id: user.shiftProfile.id,
          userId: user.shiftProfile.user_id,
          shiftKey: user.shiftProfile.shift_key,
          displayName: user.shiftProfile.display_name,
          whatsappNumber: user.shiftProfile.whatsapp_number,
          notificationsEnabled: user.shiftProfile.notifications_enabled,
          createdAt: user.shiftProfile.created_at,
          updatedAt: user.shiftProfile.updated_at
        }
      : null
  };
}

async function profilesByUserId(userIds: string[]) {
  if (!userIds.length) return new Map<string, any>();
  const { data, error } = await getSupabase().from("user_shift_profiles").select("*").in("user_id", userIds);
  if (error) throw new HttpError(500, "Nu am putut citi profilurile de tură.", error);
  return new Map((data ?? []).map((profile) => [profile.user_id, profile]));
}

async function upsertShiftProfile(
  userId: string,
  input: {
    shiftKey?: string | null;
    displayName?: string | null;
    whatsappNumber?: string | null;
    notificationsEnabled?: boolean;
  }
) {
  const hasProfileInput = Object.values(input).some((value) => value !== undefined);
  if (!hasProfileInput) return;

  const payload: Record<string, unknown> = { user_id: userId };
  if (input.shiftKey !== undefined) payload.shift_key = input.shiftKey || null;
  if (input.displayName !== undefined) payload.display_name = input.displayName || null;
  if (input.whatsappNumber !== undefined) payload.whatsapp_number = input.whatsappNumber || null;
  if (input.notificationsEnabled !== undefined) payload.notifications_enabled = input.notificationsEnabled;

  const { error } = await getSupabase().from("user_shift_profiles").upsert(payload, { onConflict: "user_id" });
  if (error) throw new HttpError(500, "Nu am putut salva profilul de tură.", error);
}

usersRouter.get(
  "/users",
  requireRoles(Role.ADMIN, Role.STORE_MANAGER),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.toLowerCase() : undefined;
    let query = getSupabase()
      .from("users")
      .select('id, phone, email, name, role, "isActive", "createdAt"')
      .order("createdAt", { ascending: false });

    if (req.user?.role === Role.STORE_MANAGER) {
      query = query.in("role", [Role.DELIVERER, Role.KITCHEN, Role.SHIFT_STAFF]).eq("isActive", true);
    }

    const { data, error } = await query;
    if (error) throw new HttpError(500, "Nu am putut citi utilizatorii.", error);
    const profileMap = await profilesByUserId((data ?? []).map((user) => user.id));
    const users = (data ?? []).filter((user) => {
      if (!search) return true;
      return [user.phone, user.email, user.name].some((value) => String(value ?? "").toLowerCase().includes(search));
    });

    res.json({ users: users.map((user) => serializeUser({ ...user, shiftProfile: profileMap.get(user.id) ?? null })) });
  })
);

usersRouter.post(
  "/users",
  requireRoles(Role.ADMIN),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        phone: z.preprocess((value) => {
          if (typeof value !== "string") return value;
          const trimmed = value.trim();
          return trimmed ? trimmed : undefined;
        }, z.string().min(6).optional()),
        email: z.preprocess((value) => {
          if (typeof value !== "string") return value;
          const trimmed = value.trim();
          return trimmed ? trimmed : undefined;
        }, z.string().email().optional()),
        name: z.string().optional(),
        role: z.enum(ROLE_VALUES).default(Role.CUSTOMER),
        password: z.string().min(6).optional(),
        shiftKey: z.enum(["shift_1", "shift_2"]).optional().nullable(),
        shiftDisplayName: z.string().optional().nullable(),
        shiftWhatsappNumber: z.string().optional().nullable(),
        shiftNotificationsEnabled: z.boolean().optional(),
        isActive: z.boolean().optional()
      })
      .superRefine((value, ctx) => {
        if (isStaffRole(value.role) && !value.email) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["email"],
            message: "Email is required for staff users."
          });
        }

        if (isStaffRole(value.role) && !value.password) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["password"],
            message: "Password is required for staff users."
          });
        }

        if (value.role === Role.CUSTOMER && !value.phone) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["phone"],
            message: "Phone is required for customer users."
          });
        }
      })
      .parse(req.body);

    const phone = input.phone ? normalizePhone(input.phone) : `${INTERNAL_STAFF_PHONE_PREFIX}${(input.email || "").toLowerCase()}`;
    const payload = {
      phone,
      email: input.email,
      name: input.name,
      role: input.role,
      isActive: input.isActive ?? true,
      password_hash: input.password ? await hashSecret(input.password) : null
    };
    const { data: existing, error: existingError } = await getSupabase().from("users").select("id").eq("phone", phone).maybeSingle();
    if (existingError) throw new HttpError(500, "Nu am putut citi utilizatorul.", existingError);

    const { data, error } = existing
      ? await getSupabase()
          .from("users")
          .update(payload)
          .eq("id", existing.id)
          .select('id, phone, email, name, role, "isActive", "createdAt"')
          .single()
      : await getSupabase()
          .from("users")
          .insert(payload)
          .select('id, phone, email, name, role, "isActive", "createdAt"')
          .single();
    if (error) throw new HttpError(500, "Nu am putut salva utilizatorul.", error);
    await upsertShiftProfile(data.id, {
      shiftKey: input.shiftKey,
      displayName: input.shiftDisplayName ?? input.name ?? null,
      whatsappNumber: input.shiftWhatsappNumber ?? input.phone ?? null,
      notificationsEnabled: input.shiftNotificationsEnabled
    });

    const profileMap = await profilesByUserId([data.id]);
    res.status(201).json({ user: serializeUser({ ...data, shiftProfile: profileMap.get(data.id) ?? null }) });
  })
);

usersRouter.patch(
  "/users/:id",
  requireRoles(Role.ADMIN),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        email: z.string().email().optional().nullable(),
        name: z.string().optional().nullable(),
        role: z.enum(ROLE_VALUES).optional(),
        password: z.string().min(6).optional(),
        shiftKey: z.enum(["shift_1", "shift_2"]).optional().nullable(),
        shiftDisplayName: z.string().optional().nullable(),
        shiftWhatsappNumber: z.string().optional().nullable(),
        shiftNotificationsEnabled: z.boolean().optional(),
        isActive: z.boolean().optional()
      })
      .parse(req.body);

    const { data, error } = await getSupabase()
      .from("users")
      .update({
        email: input.email,
        name: input.name,
        role: input.role,
        isActive: input.isActive,
        ...(input.password ? { password_hash: await hashSecret(input.password) } : {})
      })
      .eq("id", req.params.id)
      .select('id, phone, email, name, role, "isActive", "createdAt"')
      .single();
    if (error) throw new HttpError(500, "Nu am putut actualiza utilizatorul.", error);
    await upsertShiftProfile(data.id, {
      shiftKey: input.shiftKey,
      displayName: input.shiftDisplayName,
      whatsappNumber: input.shiftWhatsappNumber,
      notificationsEnabled: input.shiftNotificationsEnabled
    });
    const profileMap = await profilesByUserId([data.id]);
    res.json({ user: serializeUser({ ...data, shiftProfile: profileMap.get(data.id) ?? null }) });
  })
);
