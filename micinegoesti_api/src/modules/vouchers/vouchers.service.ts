import { randomBytes } from "node:crypto";
import { Role } from "../../constants.js";
import { HttpError } from "../../lib/http.js";
import { logWarn } from "../../lib/logger.js";
import { getSupabase } from "../../lib/supabase.js";
import type { AuthenticatedRequest, AuthUser } from "../../middleware/auth.js";
import {
  getPublicGameCampaignState,
  saveActiveCampaignScore
} from "../game/game-campaigns.service.js";
import {
  assertVoucherUsable,
  finalTotalAfterVoucher,
  isValidVoucherCode,
  normalizeVoucherCode,
  roundMoney,
  VoucherValidationError,
  type VoucherDiscountType,
  type VoucherStatus
} from "./voucher-calculation.js";

type RawVoucher = Record<string, any>;
type RawVoucherRule = Record<string, any>;
type RawUser = Pick<AuthUser, "id" | "name" | "phone" | "email">;

export type GameRecordRuleInput = {
  enabled: boolean;
  name: string;
  discountType: VoucherDiscountType;
  discountValue: number;
  maximumDiscount?: number | null;
  minimumSubtotal: number;
  validityDays?: number | null;
  codePrefix: string;
};

export type ManualVoucherInput = {
  code?: string | null;
  name: string;
  description?: string | null;
  recipientType: "public" | "customer" | "current_record_holder";
  userId?: string | null;
  discountType: VoucherDiscountType;
  discountValue: number;
  maximumDiscount?: number | null;
  minimumSubtotal: number;
  validFrom?: string | null;
  expiresAt?: string | null;
  maxRedemptions: number;
  activeImmediately: boolean;
};

export type CheckoutVoucherValidationInput = {
  code: string;
  subtotal: number;
  deliveryCost: number;
  userId?: string | null;
  sessionId?: string | null;
};

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function toNullableNumber(value: unknown) {
  return value == null ? null : Number(value);
}

function cleanPrefix(value: string) {
  const prefix = normalizeVoucherCode(value).replace(/[^A-Z0-9-]/g, "").slice(0, 16);
  return prefix.length >= 2 ? prefix : "MICI";
}

export function generateVoucherCode(prefix = "MICI") {
  return `${cleanPrefix(prefix)}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

async function generateUniqueVoucherCode(prefix?: string | null) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateVoucherCode(prefix ?? "MICI");
    const existing = await getSupabase().from("vouchers").select("id").eq("code", code).maybeSingle();
    if (existing.error) throw new HttpError(500, "Nu am putut verifica voucherul.", existing.error);
    if (!existing.data) return code;
  }
  throw new HttpError(500, "Nu am putut genera un cod unic de voucher.");
}

function effectiveVoucherStatus(voucher: RawVoucher): VoucherStatus {
  if (voucher.status === "active" && voucher.expires_at && new Date(voucher.expires_at) < new Date()) return "expired";
  return voucher.status;
}

function serializeUser(user?: RawUser | null) {
  return user
    ? {
        id: user.id,
        name: user.name ?? null,
        phone: user.phone,
        email: user.email ?? null
      }
    : null;
}

export function serializeVoucherRule(rule: RawVoucherRule | null) {
  if (!rule) return null;
  return {
    id: rule.id,
    name: rule.name,
    triggerType: rule.trigger_type,
    discountType: rule.discount_type as VoucherDiscountType,
    discountValue: toNumber(rule.discount_value),
    maximumDiscount: toNullableNumber(rule.maximum_discount),
    minimumSubtotal: toNumber(rule.minimum_subtotal),
    validityDays: rule.validity_days == null ? null : Number(rule.validity_days),
    codePrefix: rule.code_prefix,
    requiresApproval: Boolean(rule.requires_approval),
    isActive: Boolean(rule.is_active),
    createdAt: rule.created_at,
    updatedAt: rule.updated_at
  };
}

export function serializeVoucher(
  voucher: RawVoucher,
  options: {
    recipient?: RawUser | null;
    redemptions?: Array<Record<string, any>>;
    exposePendingCode?: boolean;
  } = {}
) {
  const status = effectiveVoucherStatus(voucher);
  const exposeCode = status === "active" || status === "redeemed" || options.exposePendingCode === true;

  return {
    id: voucher.id,
    ruleId: voucher.rule_id ?? null,
    code: exposeCode ? voucher.code : null,
    name: voucher.name,
    description: voucher.description ?? null,
    status,
    sourceType: voucher.source_type,
    recipient: voucher.user_id
      ? serializeUser(options.recipient) ?? { id: voucher.user_id, name: null, phone: "", email: null }
      : voucher.session_key
        ? { type: "session", label: "Sesiune anonimă", sessionKey: voucher.session_key }
        : { type: "public", label: "Public" },
    discountType: voucher.discount_type as VoucherDiscountType,
    discountValue: toNumber(voucher.discount_value),
    maximumDiscount: toNullableNumber(voucher.maximum_discount),
    minimumSubtotal: toNumber(voucher.minimum_subtotal),
    validFrom: voucher.valid_from,
    expiresAt: voucher.expires_at ?? null,
    maxRedemptions: Number(voucher.max_redemptions ?? 1),
    redemptionCount: Number(voucher.redemption_count ?? 0),
    redemptions: (options.redemptions ?? []).map((redemption) => ({
      id: redemption.id,
      orderId: Number(redemption.order_id),
      discountAmount: toNumber(redemption.discount_amount),
      finalTotal: toNumber(redemption.final_total),
      redeemedAt: redemption.redeemed_at
    })),
    gameScoreId: voucher.game_score_id ?? null,
    campaignId: voucher.campaign_id ?? null,
    campaignScoreId: voucher.campaign_score_id ?? null,
    campaignRank: voucher.campaign_rank == null ? null : Number(voucher.campaign_rank),
    sourceScore: voucher.source_score == null ? null : Number(voucher.source_score),
    previousRecordScore: voucher.previous_record_score == null ? null : Number(voucher.previous_record_score),
    approvedAt: voucher.approved_at ?? null,
    revokedAt: voucher.revoked_at ?? null,
    createdAt: voucher.created_at,
    updatedAt: voucher.updated_at
  };
}

async function writeVoucherAudit(actorUserId: string | null | undefined, action: string, entityId: string | null, metadata?: Record<string, unknown>) {
  const { error } = await getSupabase().from("audit_logs").insert({
    actor_user_id: actorUserId ?? null,
    action,
    entity_type: "voucher",
    entity_id: entityId,
    metadata: metadata ?? null
  });
  if (error) logWarn("vouchers:audit-failed", { action, entityId, error });
}

export async function currentGameRecordHolder() {
  const { data: score, error } = await getSupabase()
    .from("game_scores")
    .select("id, player_name, best_score, user_id, session_key, updated_at")
    .order("best_score", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new HttpError(500, "Nu am putut citi recordul jocului.", error);
  if (!score) return null;

  let user: RawUser | null = null;
  if (score.user_id) {
    const userResult = await getSupabase().from("users").select("id, name, phone, email").eq("id", score.user_id).maybeSingle();
    if (userResult.error) throw new HttpError(500, "Nu am putut citi utilizatorul recordului.", userResult.error);
    user = userResult.data as RawUser | null;
  }

  return {
    id: score.id,
    playerName: score.player_name,
    bestScore: Number(score.best_score ?? 0),
    user: serializeUser(user),
    isAnonymousSession: !score.user_id && Boolean(score.session_key),
    sessionKey: score.user_id ? null : score.session_key ?? null,
    updatedAt: score.updated_at
  };
}

export async function getGameRecordRuleWithRecord() {
  const { data, error } = await getSupabase()
    .from("voucher_rules")
    .select("*")
    .eq("trigger_type", "game_record")
    .order("is_active", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new HttpError(500, "Nu am putut citi regula voucherului de record.", error);

  return {
    rule: serializeVoucherRule(data),
    currentRecord: await currentGameRecordHolder()
  };
}

export async function upsertGameRecordRule(input: GameRecordRuleInput, actorUserId: string) {
  const payload = {
    name: input.name.trim(),
    trigger_type: "game_record",
    discount_type: input.discountType,
    discount_value: roundMoney(input.discountValue),
    maximum_discount: input.discountType === "percentage" ? input.maximumDiscount ?? null : null,
    minimum_subtotal: roundMoney(input.minimumSubtotal),
    validity_days: input.validityDays ?? null,
    code_prefix: cleanPrefix(input.codePrefix),
    requires_approval: true,
    is_active: input.enabled,
    updated_by_user_id: actorUserId
  };

  const existing = await getSupabase()
    .from("voucher_rules")
    .select("*")
    .eq("trigger_type", "game_record")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new HttpError(500, "Nu am putut citi regula existentă.", existing.error);

  if (payload.is_active) {
    const deactivated = await getSupabase()
      .from("voucher_rules")
      .update({ is_active: false, updated_by_user_id: actorUserId })
      .eq("trigger_type", "game_record");
    if (deactivated.error) throw new HttpError(500, "Nu am putut dezactiva regulile vechi.", deactivated.error);
  }

  const result = existing.data
    ? await getSupabase().from("voucher_rules").update(payload).eq("id", existing.data.id).select("*").single()
    : await getSupabase()
        .from("voucher_rules")
        .insert({ ...payload, created_by_user_id: actorUserId })
        .select("*")
        .single();
  if (result.error) throw new HttpError(500, "Nu am putut salva regula voucherului.", result.error);

  await writeVoucherAudit(actorUserId, "voucher_rule.upsert_game_record", result.data.id, {
    enabled: input.enabled,
    requiresApproval: true
  });

  return serializeVoucherRule(result.data);
}

export async function listAdminVouchers(filters: { search?: string; status?: string; source?: string; recipient?: string }) {
  const { data, error } = await getSupabase().from("vouchers").select("*").order("created_at", { ascending: false });
  if (error) throw new HttpError(500, "Nu am putut citi voucherele.", error);
  const vouchers = data ?? [];
  const userIds = [...new Set(vouchers.map((voucher) => voucher.user_id).filter(Boolean))];
  const voucherIds = vouchers.map((voucher) => voucher.id);

  const [usersResult, redemptionsResult] = await Promise.all([
    userIds.length
      ? getSupabase().from("users").select("id, name, phone, email").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    voucherIds.length
      ? getSupabase().from("voucher_redemptions").select("*").in("voucher_id", voucherIds).order("redeemed_at", { ascending: false })
      : Promise.resolve({ data: [], error: null })
  ]);
  if (usersResult.error) throw new HttpError(500, "Nu am putut citi destinatarii voucherelor.", usersResult.error);
  if (redemptionsResult.error) throw new HttpError(500, "Nu am putut citi folosirile voucherelor.", redemptionsResult.error);

  const usersById = new Map((usersResult.data ?? []).map((user: any) => [user.id, user as RawUser]));
  const redemptionsByVoucher = new Map<string, any[]>();
  for (const redemption of redemptionsResult.data ?? []) {
    const list = redemptionsByVoucher.get(redemption.voucher_id) ?? [];
    list.push(redemption);
    redemptionsByVoucher.set(redemption.voucher_id, list);
  }

  const search = filters.search?.trim().toLowerCase();
  return vouchers
    .map((voucher) =>
      serializeVoucher(voucher, {
        recipient: voucher.user_id ? usersById.get(voucher.user_id) : null,
        redemptions: redemptionsByVoucher.get(voucher.id) ?? [],
        exposePendingCode: true
      })
    )
    .filter((voucher) => !filters.status || filters.status === "all" || voucher.status === filters.status)
    .filter((voucher) => !filters.source || filters.source === "all" || voucher.sourceType === filters.source)
    .filter((voucher) => {
      if (!search) return true;
      const recipient =
        "phone" in voucher.recipient
          ? `${voucher.recipient.name ?? ""} ${voucher.recipient.phone} ${voucher.recipient.email ?? ""}`
          : voucher.recipient.label;
      return [voucher.code, voucher.name, voucher.status, voucher.sourceType, recipient]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    })
    .filter((voucher) => {
      const recipientFilter = filters.recipient?.trim().toLowerCase();
      if (!recipientFilter) return true;
      const recipient =
        "phone" in voucher.recipient
          ? `${voucher.recipient.name ?? ""} ${voucher.recipient.phone} ${voucher.recipient.email ?? ""}`
          : voucher.recipient.label;
      return recipient.toLowerCase().includes(recipientFilter);
    });
}

export async function createManualVoucher(input: ManualVoucherInput, actorUserId: string) {
  const code = input.code ? normalizeVoucherCode(input.code) : await generateUniqueVoucherCode("MICI");
  if (!isValidVoucherCode(code)) {
    throw new HttpError(400, "Codul poate conține doar litere mari, cifre și cratime, între 4 și 40 de caractere.");
  }

  const existing = await getSupabase().from("vouchers").select("id").eq("code", code).maybeSingle();
  if (existing.error) throw new HttpError(500, "Nu am putut verifica voucherul.", existing.error);
  if (existing.data) throw new HttpError(409, "Există deja un voucher cu acest cod.");

  let userId: string | null = null;
  let sessionKey: string | null = null;
  let gameScoreId: string | null = null;
  let sourceScore: number | null = null;

  if (input.recipientType === "customer") {
    if (!input.userId) throw new HttpError(400, "Selectează clientul pentru voucher.");
    userId = input.userId;
  }

  if (input.recipientType === "current_record_holder") {
    const record = await currentGameRecordHolder();
    if (!record || record.bestScore <= 0) throw new HttpError(400, "Nu există încă un record eligibil.");
    userId = record.user?.id ?? null;
    sessionKey = userId ? null : record.sessionKey;
    gameScoreId = record.id;
    sourceScore = record.bestScore;
  }

  const status = input.activeImmediately ? "active" : "pending";
  const { data, error } = await getSupabase()
    .from("vouchers")
    .insert({
      code,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      status,
      source_type: "manual",
      user_id: userId,
      session_key: sessionKey,
      game_score_id: gameScoreId,
      source_score: sourceScore,
      discount_type: input.discountType,
      discount_value: roundMoney(input.discountValue),
      maximum_discount: input.discountType === "percentage" ? input.maximumDiscount ?? null : null,
      minimum_subtotal: roundMoney(input.minimumSubtotal),
      valid_from: input.validFrom || new Date().toISOString(),
      expires_at: input.expiresAt || null,
      max_redemptions: input.maxRedemptions,
      created_by_user_id: actorUserId,
      approved_by_user_id: status === "active" ? actorUserId : null,
      approved_at: status === "active" ? new Date().toISOString() : null
    })
    .select("*")
    .single();
  if (error) throw new HttpError(500, "Nu am putut crea voucherul.", error);

  await writeVoucherAudit(actorUserId, "voucher.create_manual", data.id, { status, recipientType: input.recipientType });
  return serializeVoucher(data, { exposePendingCode: true });
}

export async function approveVoucher(id: string, actorUserId: string) {
  const { data, error } = await getSupabase()
    .from("vouchers")
    .update({ status: "active", approved_by_user_id: actorUserId, approved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw new HttpError(500, "Nu am putut aproba voucherul.", error);
  if (!data) throw new HttpError(409, "Doar voucherele în așteptare pot fi aprobate.");
  await writeVoucherAudit(actorUserId, "voucher.approve", id);
  return serializeVoucher(data, { exposePendingCode: true });
}

export async function revokeVoucher(id: string, actorUserId: string) {
  const { data, error } = await getSupabase()
    .from("vouchers")
    .update({ status: "revoked", revoked_by_user_id: actorUserId, revoked_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["pending", "active"])
    .select("*")
    .maybeSingle();
  if (error) throw new HttpError(500, "Nu am putut revoca voucherul.", error);
  if (!data) throw new HttpError(409, "Doar voucherele active sau în așteptare pot fi revocate.");
  await writeVoucherAudit(actorUserId, "voucher.revoke", id);
  return serializeVoucher(data, { exposePendingCode: true });
}

function voucherSnapshotFromRow(voucher: RawVoucher) {
  return {
    status: effectiveVoucherStatus(voucher),
    discountType: voucher.discount_type as VoucherDiscountType,
    discountValue: toNumber(voucher.discount_value),
    maximumDiscount: toNullableNumber(voucher.maximum_discount),
    minimumSubtotal: toNumber(voucher.minimum_subtotal),
    validFrom: voucher.valid_from,
    expiresAt: voucher.expires_at,
    maxRedemptions: Number(voucher.max_redemptions ?? 1),
    redemptionCount: Number(voucher.redemption_count ?? 0),
    userId: voucher.user_id ?? null,
    sessionKey: voucher.session_key ?? null
  };
}

export async function validateVoucherForCheckout(input: CheckoutVoucherValidationInput) {
  const code = normalizeVoucherCode(input.code);
  if (!isValidVoucherCode(code)) throw new HttpError(404, "Voucherul nu a fost găsit.");

  const { data, error } = await getSupabase().from("vouchers").select("*").eq("code", code).maybeSingle();
  if (error) throw new HttpError(500, "Nu am putut verifica voucherul.", error);
  if (!data) throw new HttpError(404, "Voucherul nu a fost găsit.");

  try {
    const discountAmount = assertVoucherUsable(voucherSnapshotFromRow(data), {
      subtotal: input.subtotal,
      userId: input.userId ?? null,
      sessionId: input.sessionId ?? null
    });
    const finalTotal = finalTotalAfterVoucher(input.subtotal, discountAmount, input.deliveryCost);
    return {
      code: data.code,
      status: "active" as const,
      discountType: data.discount_type as VoucherDiscountType,
      discountValue: toNumber(data.discount_value),
      maximumDiscount: toNullableNumber(data.maximum_discount),
      minimumSubtotal: toNumber(data.minimum_subtotal),
      subtotal: roundMoney(input.subtotal),
      discountAmount,
      deliveryCost: roundMoney(input.deliveryCost),
      finalTotal,
      expiresAt: data.expires_at ?? null,
      message: `Voucherul ${data.code} a fost aplicat.`
    };
  } catch (error) {
    if (error instanceof VoucherValidationError) throw new HttpError(error.status, error.message);
    throw error;
  }
}

export async function listMine({ userId, sessionId }: { userId?: string | null; sessionId?: string | null }) {
  if (!userId && !sessionId) return [];

  const queries = [];
  if (userId) {
    queries.push(getSupabase().from("vouchers").select("*").eq("user_id", userId).in("status", ["pending", "active"]).order("created_at", { ascending: false }));
  }
  if (sessionId) {
    queries.push(getSupabase().from("vouchers").select("*").eq("session_key", sessionId).is("user_id", null).in("status", ["pending", "active"]).order("created_at", { ascending: false }));
  }

  const results = await Promise.all(queries);
  for (const result of results) {
    if (result.error) throw new HttpError(500, "Nu am putut citi voucherele tale.", result.error);
  }

  const byId = new Map<string, RawVoucher>();
  results.flatMap((result) => result.data ?? []).forEach((voucher) => byId.set(voucher.id, voucher));
  return [...byId.values()].map((voucher) => serializeVoucher(voucher));
}

export async function issueCurrentRecordVoucher(actorUserId: string) {
  await enforceGameVoucherManualApproval();
  const { data, error } = await getSupabase().rpc("issue_current_game_record_voucher", {
    p_admin_user_id: actorUserId
  });
  if (error) throw new HttpError(400, error.message || "Nu am putut emite voucherul pentru record.", error);
  await writeVoucherAudit(actorUserId, "voucher.issue_current_record", data?.id ?? null);
  return serializeVoucher(data, { exposePendingCode: true });
}

export function serializeGameScoreSaveResult(data: any) {
  const reward = data?.reward;
  return {
    bestScore: Number(data?.bestScore ?? 0),
    playerName: data?.playerName ?? null,
    ...(data?.sessionId ? { sessionId: String(data.sessionId) } : {}),
    isNewGlobalRecord: Boolean(data?.isNewGlobalRecord),
    reward: reward
      ? {
          status: reward.status as "pending" | "active",
          code: reward.status === "active" && reward.code ? String(reward.code) : undefined,
          discountType: reward.discountType as VoucherDiscountType,
          discountValue: toNumber(reward.discountValue),
          maximumDiscount: toNullableNumber(reward.maximumDiscount),
          minimumSubtotal: toNumber(reward.minimumSubtotal),
          expiresAt: reward.expiresAt ?? null,
          message: String(reward.message ?? "")
        }
      : undefined
  };
}

function gameScoreSaveHttpError(error: { message?: string }) {
  const message = String(error.message ?? "");
  const publicMessages = [
    "Autentifică-te într-un cont de client pentru a salva scorul.",
    "Contul clientului nu există sau nu este activ.",
    "Completează numele clientului înainte de a salva scorul.",
    "Doar conturile de client pot salva recorduri.",
    "Nu există o regulă activă pentru voucherul de record.",
    "Regula de voucher pentru record nu este activă.",
    "Voucherul de record trebuie atribuit unui cont de client."
  ];
  const publicMessage = publicMessages.find((candidate) => message.includes(candidate));

  return publicMessage
    ? new HttpError(400, publicMessage, error)
    : new HttpError(500, "Nu am putut salva scorul. Încearcă din nou.", error);
}

async function enforceGameVoucherManualApproval() {
  const rulesResult = await getSupabase()
    .from("voucher_rules")
    .update({ requires_approval: true })
    .eq("trigger_type", "game_record")
    .eq("requires_approval", false);
  if (rulesResult.error) {
    throw new HttpError(500, "Nu am putut activa protecția voucherelor de joc.", rulesResult.error);
  }

  const vouchersResult = await getSupabase()
    .from("vouchers")
    .update({ status: "pending", approved_by_user_id: null, approved_at: null })
    .eq("source_type", "game_record")
    .eq("status", "active")
    .eq("redemption_count", 0)
    .is("approved_by_user_id", null);
  if (vouchersResult.error) {
    throw new HttpError(500, "Nu am putut securiza voucherele de joc existente.", vouchersResult.error);
  }
}

async function quarantineUnexpectedActiveGameReward(data: any) {
  if (data?.reward?.status !== "active") return data;

  const rewardId = data.reward.id;
  if (!rewardId) throw new HttpError(500, "Voucherul de joc nu poate fi activat automat.");

  const result = await getSupabase()
    .from("vouchers")
    .update({ status: "pending", approved_by_user_id: null, approved_at: null })
    .eq("id", rewardId)
    .eq("source_type", "game_record");
  if (result.error) {
    throw new HttpError(500, "Nu am putut bloca voucherul de joc activat neașteptat.", result.error);
  }

  logWarn("voucher:automatic-game-reward-quarantined", { voucherId: rewardId });
  return {
    ...data,
    reward: {
      ...data.reward,
      status: "pending",
      code: null,
      message: "Felicitări! Voucherul pentru record așteaptă aprobarea administratorului."
    }
  };
}

export async function saveGameScoreWithReward({
  sessionId,
  userId,
  score,
  playerName
}: {
  sessionId: string;
  userId?: string | null;
  score: number;
  playerName: string;
}) {
  if ((await getPublicGameCampaignState()).mode === "campaign") {
    if (!userId) throw new HttpError(401, "Autentifică-te pentru a salva scorul.");
    return saveActiveCampaignScore({ userId, sessionId, score });
  }

  await enforceGameVoucherManualApproval();
  const { data, error } = await getSupabase().rpc("save_game_score_with_reward", {
    p_session_key: sessionId,
    p_user_id: userId ?? null,
    p_score: score,
    p_player_name: playerName
  });
  if (error) throw gameScoreSaveHttpError(error);
  return serializeGameScoreSaveResult(await quarantineUnexpectedActiveGameReward(data));
}

export function requireAdministrator(req: AuthenticatedRequest) {
  if (!req.user) throw new HttpError(401, "Authentication required.");
  if (req.user.role !== Role.ADMIN) throw new HttpError(403, "Doar administratorii pot gestiona voucherele.");
  return req.user;
}
