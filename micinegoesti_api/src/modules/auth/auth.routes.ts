import { Router } from "express";
import { z } from "zod";
import { config } from "../../config.js";
import { Role } from "../../constants.js";
import { comparePlainSecret, compareSecret, generateCode, generateOpaqueToken, hashSecret, hashToken, signAccessToken } from "../../lib/auth.js";
import { HttpError, asyncHandler } from "../../lib/http.js";
import { logError, logWarn } from "../../lib/logger.js";
import { isValidNormalizedPhone, normalizePhone } from "../../lib/phone.js";
import { getSupabase } from "../../lib/supabase.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { requireAuth } from "../../middleware/auth.js";
import { GreenApiError } from "../../services/greenApi.js";
import { isWhatsAppApiConfigured, sendVerificationCode } from "../../services/whatsapp.js";

export const authRouter = Router();

const sendCodeSchema = z.object({
  phone: z.string().min(6)
});

const verifySchema = z.object({
  phone: z.string().min(6),
  code: z.string().min(4),
  profile: z
    .object({
      name: z.string().min(2).optional()
    })
    .optional()
});

const adminLoginSchema = z.object({
  login: z.string().min(3),
  password: z.string().min(1)
});

const sessionTokenSchema = z.object({
  sessionToken: z.string().min(32).max(256)
});

function normalizeAuthPhone(input: string) {
  const phone = normalizePhone(input);
  if (!isValidNormalizedPhone(phone)) {
    throw new HttpError(400, "Numărul de telefon nu este complet. Verifică prefixul de țară.");
  }
  return phone;
}

async function createSessionResponse(user: any) {
  const token = signAccessToken(user);
  const sessionToken = generateOpaqueToken();
  const { error } = await getSupabase().from("sessions").insert({
    userId: user.id,
    tokenHash: hashToken(sessionToken),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  });
  if (error) throw new HttpError(500, "Nu am putut crea sesiunea.", error);

  return { token, sessionToken, user };
}

function adminLoginMatches(login: string) {
  const normalizedLogin = login.trim().toLowerCase();
  const acceptedLogins = [config.admin.login, config.admin.email].filter(Boolean).map((value) => value.trim().toLowerCase());

  if (acceptedLogins.includes(normalizedLogin)) return true;

  try {
    return normalizePhone(login) === normalizePhone(config.admin.phone);
  } catch {
    return false;
  }
}

async function adminPasswordMatches(password: string) {
  if (config.admin.passwordHash) return compareSecret(password, config.admin.passwordHash);
  if (config.admin.password) return comparePlainSecret(password, config.admin.password);
  return false;
}

function serializeUser(user: any) {
  return {
    id: user.id,
    phone: user.phone?.startsWith("staff-no-phone:") ? "" : user.phone,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive
  };
}

async function upsertDummyCustomer() {
  const phone = normalizePhone(config.dummyCustomer.phone);
  const { data: existing, error: findError } = await getSupabase()
    .from("users")
    .select('id, phone, email, name, role, "isActive"')
    .eq("phone", phone)
    .maybeSingle();
  if (findError) throw new HttpError(500, "Nu am putut citi utilizatorul demo.", findError);

  const payload = {
    phone,
    name: config.dummyCustomer.name,
    role: Role.CUSTOMER,
    isActive: true
  };

  const { data, error } = existing
    ? await getSupabase().from("users").update(payload).eq("id", existing.id).select('id, phone, email, name, role, "isActive"').single()
    : await getSupabase().from("users").insert(payload).select('id, phone, email, name, role, "isActive"').single();
  if (error) throw new HttpError(500, "Nu am putut salva utilizatorul demo.", error);
  return data;
}

async function findStaffByLogin(login: string) {
  const normalizedLogin = login.trim().toLowerCase();
  const phone = (() => {
    try {
      return normalizePhone(login);
    } catch {
      return null;
    }
  })();

  let query = getSupabase()
    .from("users")
    .select('id, phone, email, name, role, "isActive", password_hash')
    .neq("role", Role.CUSTOMER)
    .eq("isActive", true);
  if (phone) {
    query = query.or(`email.eq.${normalizedLogin},phone.eq.${phone}`);
  } else {
    query = query.eq("email", normalizedLogin);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new HttpError(500, "Nu am putut citi utilizatorul.", error);
  return data;
}

async function upsertEnvAdmin() {
  const phone = normalizePhone(config.admin.phone);
  const { data: existing, error: findError } = await getSupabase()
    .from("users")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (findError) throw new HttpError(500, "Nu am putut citi adminul.", findError);

  const payload = {
    phone,
    email: config.admin.email,
    name: config.admin.name,
    role: Role.ADMIN,
    isActive: true
  };
  const { data, error } = existing
    ? await getSupabase().from("users").update(payload).eq("id", existing.id).select('id, phone, email, name, role, "isActive"').single()
    : await getSupabase().from("users").insert(payload).select('id, phone, email, name, role, "isActive"').single();
  if (error) throw new HttpError(500, "Nu am putut salva adminul.", error);
  return data;
}

authRouter.post(
  "/auth/send-code",
  asyncHandler(async (req, res) => {
    const input = sendCodeSchema.parse(req.body);
    const phone = normalizeAuthPhone(input.phone);
    const requesterIp = req.ip;
    const windowStart = new Date(Date.now() - config.otpRateLimitWindowMinutes * 60 * 1000).toISOString();
    const { count, error: countError } = await getSupabase()
      .from("otp_challenges")
      .select("id", { count: "exact", head: true })
      .eq("phone", phone)
      .gte("createdAt", windowStart);
    if (countError) throw new HttpError(500, "Nu am putut verifica limita OTP.", countError);

    if ((count ?? 0) >= config.otpRateLimitMax) {
      throw new HttpError(429, "Ai cerut prea multe coduri. Încearcă din nou peste câteva minute.");
    }

    const expiresAt = new Date(Date.now() + config.verifyCodeTtlMinutes * 60 * 1000).toISOString();
    const code = generateCode();
    const devCode = isWhatsAppApiConfigured() || config.nodeEnv === "production" ? undefined : code;

    const { data: challenge, error } = await getSupabase()
      .from("otp_challenges")
      .insert({
        phone,
        codeHash: await hashSecret(code),
        requesterIp,
        expiresAt
      })
      .select("id")
      .single();
    if (error || !challenge) throw new HttpError(500, "Nu am putut crea codul OTP.", error);

    try {
      await sendVerificationCode(phone, code);
    } catch (error) {
      const { error: cleanupError } = await getSupabase().from("otp_challenges").delete().eq("id", challenge.id);
      if (cleanupError) {
        logWarn("whatsapp:otp:challenge-cleanup-failed", {
          challengeId: challenge.id,
          cleanupError
        });
      }
      logError("whatsapp:otp:send-failed", error, {
        provider: config.whatsapp.provider,
        phoneSuffix: phone.slice(-4),
        challengeId: challenge.id
      });
      const providerQuotaExceeded = error instanceof GreenApiError && error.status === 466;
      throw new HttpError(
        502,
        providerQuotaExceeded
          ? "Serviciul WhatsApp a atins limita de destinatari a abonamentului. Administratorul trebuie să mărească limita Green API."
          : "WhatsApp nu a acceptat trimiterea. Verifică numărul și prefixul de țară, apoi încearcă din nou.",
        {
          event: "whatsapp:otp:send-failed",
          provider: config.whatsapp.provider,
          reason: providerQuotaExceeded ? "provider_correspondent_quota_exceeded" : "provider_send_failed"
        }
      );
    }

    res.json({
      ok: true,
      expiresAt,
      channel: isWhatsAppApiConfigured() ? config.whatsapp.provider : "local",
      devCode
    });
  })
);

authRouter.post(
  "/auth/admin-login",
  asyncHandler(async (req, res) => {
    const input = adminLoginSchema.parse(req.body);

    if (adminLoginMatches(input.login) && (await adminPasswordMatches(input.password))) {
      const user = await upsertEnvAdmin();
      res.json(await createSessionResponse(serializeUser(user)));
      return;
    }

    const staff = await findStaffByLogin(input.login);
    if (!staff?.password_hash || !(await compareSecret(input.password, staff.password_hash))) {
      throw new HttpError(401, "Credentiale admin invalide.");
    }

    res.json(await createSessionResponse(serializeUser(staff)));
  })
);

authRouter.post(
  "/auth/dummy-customer",
  asyncHandler(async (_req, res) => {
    if (!config.dummyCustomer.enabled) {
      throw new HttpError(404, "Contul demo nu este activ.");
    }

    const user = await upsertDummyCustomer();
    res.json(await createSessionResponse(serializeUser(user)));
  })
);

authRouter.post(
  "/auth/verify-code",
  asyncHandler(async (req, res) => {
    const input = verifySchema.parse(req.body);
    const phone = normalizeAuthPhone(input.phone);
    const { data: verification, error: verificationError } = await getSupabase()
      .from("otp_challenges")
      .select("*")
      .eq("phone", phone)
      .is("consumedAt", null)
      .gt("expiresAt", new Date().toISOString())
      .order("createdAt", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (verificationError) throw new HttpError(500, "Nu am putut verifica OTP.", verificationError);

    if (!verification) {
      throw new HttpError(400, "Codul a expirat sau nu există.");
    }

    if (verification.attempts >= 5) {
      throw new HttpError(429, "Prea multe încercări. Cere un cod nou.");
    }

    const valid = await compareSecret(input.code, verification.codeHash);
    if (!valid) {
      await getSupabase()
        .from("otp_challenges")
        .update({ attempts: verification.attempts + 1 })
        .eq("id", verification.id);
      throw new HttpError(400, "Cod invalid.");
    }

    const { data: existing, error: existingError } = await getSupabase()
      .from("users")
      .select('id, phone, email, name, role, "isActive"')
      .eq("phone", phone)
      .maybeSingle();
    if (existingError) throw new HttpError(500, "Nu am putut citi utilizatorul.", existingError);

    const payload = {
      phone,
      name: input.profile?.name ?? existing?.name ?? null,
      isActive: true
    };
    const { data: user, error: userError } = existing
      ? await getSupabase()
          .from("users")
          .update(payload)
          .eq("id", existing.id)
          .select('id, phone, email, name, role, "isActive"')
          .single()
      : await getSupabase()
          .from("users")
          .insert({ ...payload, role: Role.CUSTOMER })
          .select('id, phone, email, name, role, "isActive"')
          .single();
    if (userError) throw new HttpError(500, "Nu am putut salva utilizatorul.", userError);

    await getSupabase()
      .from("otp_challenges")
      .update({ consumedAt: new Date().toISOString() })
      .eq("id", verification.id);

    res.json(await createSessionResponse(serializeUser(user)));
  })
);

authRouter.get(
  "/auth/me",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  })
);

authRouter.post(
  "/auth/refresh",
  asyncHandler(async (req, res) => {
    const { sessionToken } = sessionTokenSchema.parse(req.body);
    const tokenHash = hashToken(sessionToken);
    const { data: session, error: sessionError } = await getSupabase()
      .from("sessions")
      .select('id, "userId", "expiresAt", "revokedAt"')
      .eq("tokenHash", tokenHash)
      .maybeSingle();

    if (sessionError) throw new HttpError(500, "Nu am putut reînnoi sesiunea.", sessionError);
    if (
      !session ||
      session.revokedAt ||
      new Date(session.expiresAt).getTime() <= Date.now()
    ) {
      throw new HttpError(401, "Sesiunea nu mai este validă. Autentifică-te din nou.");
    }

    const { data: user, error: userError } = await getSupabase()
      .from("users")
      .select('id, phone, email, name, role, "isActive"')
      .eq("id", session.userId)
      .maybeSingle();
    if (userError) throw new HttpError(500, "Nu am putut reînnoi sesiunea.", userError);
    if (!user?.isActive) {
      await getSupabase().from("sessions").update({ revokedAt: new Date().toISOString() }).eq("id", session.id);
      throw new HttpError(401, "Sesiunea nu mai este validă. Autentifică-te din nou.");
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error: updateError } = await getSupabase()
      .from("sessions")
      .update({ expiresAt })
      .eq("id", session.id)
      .eq("tokenHash", tokenHash);
    if (updateError) throw new HttpError(500, "Nu am putut reînnoi sesiunea.", updateError);

    const serializedUser = serializeUser(user);
    res.json({
      token: signAccessToken(serializedUser),
      sessionToken,
      user: serializedUser
    });
  })
);

authRouter.post(
  "/auth/logout",
  asyncHandler(async (req, res) => {
    const parsed = sessionTokenSchema.safeParse(req.body);
    if (parsed.success) {
      const { error } = await getSupabase()
        .from("sessions")
        .update({ revokedAt: new Date().toISOString() })
        .eq("tokenHash", hashToken(parsed.data.sessionToken))
        .is("revokedAt", null);
      if (error) throw new HttpError(500, "Nu am putut închide sesiunea.", error);
    }
    res.status(204).send();
  })
);
