import { HttpError } from "../../lib/http.js";
import { getSupabase } from "../../lib/supabase.js";

export type GameRewardMode = "campaign" | "instant_record";

export type CreateGameCampaignInput = {
  name: string;
  startsAt: string;
  durationMinutes: number;
  firstPrizePercent: number;
  secondPrizePercent: number;
  thirdPrizePercent: number;
  maximumDiscount?: number | null;
  minimumSubtotal: number;
  validityDays?: number | null;
  codePrefix: string;
};

export type UpdateGameCampaignInput = Omit<CreateGameCampaignInput, "durationMinutes"> & {
  endsAt: string;
};

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function cleanCampaignPrefix(value: string) {
  const prefix = value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 16);
  return prefix.length >= 2 ? prefix : "CAMPANIE";
}

function serializeCampaign(campaign: any, participantCount?: number) {
  if (!campaign) return null;

  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status as "scheduled" | "active" | "finished" | "cancelled",
    startsAt: campaign.starts_at,
    endsAt: campaign.ends_at,
    prizes: [
      toNumber(campaign.first_prize_percent),
      toNumber(campaign.second_prize_percent),
      toNumber(campaign.third_prize_percent)
    ] as [number, number, number],
    maximumDiscount: campaign.maximum_discount == null ? null : toNumber(campaign.maximum_discount),
    minimumSubtotal: toNumber(campaign.minimum_subtotal),
    validityDays: campaign.validity_days == null ? null : Number(campaign.validity_days),
    codePrefix: campaign.code_prefix,
    participantCount,
    finishedAt: campaign.finished_at ?? null,
    cancelledAt: campaign.cancelled_at ?? null,
    createdAt: campaign.created_at,
    updatedAt: campaign.updated_at
  };
}

async function finalizeDueCampaigns() {
  const { error } = await getSupabase().rpc("finalize_due_game_campaigns");
  if (error) throw new HttpError(500, "Nu am putut finaliza campaniile expirate.", error);
}

async function promoteStartedCampaign() {
  const now = new Date().toISOString();
  const { error } = await getSupabase()
    .from("game_campaigns")
    .update({ status: "active" })
    .eq("status", "scheduled")
    .lte("starts_at", now)
    .gt("ends_at", now);
  if (error) throw new HttpError(500, "Nu am putut porni campania programată.", error);
}

export async function getGameRewardMode(): Promise<GameRewardMode> {
  const { data, error } = await getSupabase()
    .from("game_reward_settings")
    .select("mode")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new HttpError(500, "Nu am putut citi modul de recompensă al jocului.", error);
  return data?.mode === "campaign" ? "campaign" : "instant_record";
}

export async function getPublicGameCampaignState() {
  await finalizeDueCampaigns();
  await promoteStartedCampaign();

  const mode = await getGameRewardMode();
  const live = await getSupabase()
    .from("game_campaigns")
    .select("*")
    .in("status", ["scheduled", "active"])
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (live.error) throw new HttpError(500, "Nu am putut citi campania curentă.", live.error);

  let campaign = live.data;
  if (!campaign) {
    const latest = await getSupabase()
      .from("game_campaigns")
      .select("*")
      .eq("status", "finished")
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest.error) throw new HttpError(500, "Nu am putut citi ultima campanie.", latest.error);
    campaign = latest.data;
  }

  return {
    mode,
    serverTime: new Date().toISOString(),
    campaign: serializeCampaign(campaign)
  };
}

export async function getGameLeaderboardPage({
  limit,
  offset
}: {
  limit: number;
  offset: number;
}) {
  const state = await getPublicGameCampaignState();

  if (state.mode === "campaign") {
    if (!state.campaign) {
      return { ...state, scores: [], total: 0, hasMore: false };
    }

    const result = await getSupabase()
      .from("game_campaign_scores")
      .select("id, player_name, best_score, best_score_at", { count: "exact" })
      .eq("campaign_id", state.campaign.id)
      .order("best_score", { ascending: false })
      .order("best_score_at", { ascending: true })
      .range(offset, offset + limit - 1);
    if (result.error) throw new HttpError(500, "Nu am putut citi clasamentul campaniei.", result.error);

    const total = result.count ?? 0;
    return {
      ...state,
      scores: (result.data ?? []).map((score: any) => ({
        id: score.id,
        playerName: score.player_name,
        bestScore: Number(score.best_score),
        updatedAt: score.best_score_at
      })),
      total,
      hasMore: offset + (result.data?.length ?? 0) < total
    };
  }

  const result = await getSupabase()
    .from("game_scores")
    .select("id, player_name, best_score, updated_at", { count: "exact" })
    .not("player_name", "is", null)
    .order("best_score", { ascending: false })
    .order("updated_at", { ascending: true })
    .range(offset, offset + limit - 1);
  if (result.error) throw new HttpError(500, "Nu am putut citi leaderboard-ul.", result.error);

  const total = result.count ?? 0;
  return {
    ...state,
    scores: (result.data ?? []).map((score: any) => ({
      id: score.id,
      playerName: score.player_name,
      bestScore: Number(score.best_score),
      updatedAt: score.updated_at
    })),
    total,
    hasMore: offset + (result.data?.length ?? 0) < total
  };
}

export async function getCurrentGameScore({
  userId,
  sessionId
}: {
  userId?: string | null;
  sessionId: string;
}) {
  const state = await getPublicGameCampaignState();

  if (state.mode === "campaign") {
    if (!userId || !state.campaign) {
      return { bestScore: 0, playerName: null };
    }

    const result = await getSupabase()
      .from("game_campaign_scores")
      .select("best_score, player_name")
      .eq("campaign_id", state.campaign.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (result.error) throw new HttpError(500, "Nu am putut citi scorul din campanie.", result.error);

    return {
      bestScore: Number(result.data?.best_score ?? 0),
      playerName: result.data?.player_name ?? null
    };
  }

  const record = userId
    ? await getSupabase().from("game_scores").select("best_score, player_name").eq("user_id", userId).maybeSingle()
    : await getSupabase().from("game_scores").select("best_score, player_name").eq("session_key", sessionId).maybeSingle();
  if (record.error) throw new HttpError(500, "Nu am putut citi scorul.", record.error);

  if (!record.data && userId) {
    const fallback = await getSupabase()
      .from("game_scores")
      .select("best_score, player_name")
      .eq("session_key", sessionId)
      .maybeSingle();
    if (fallback.error) throw new HttpError(500, "Nu am putut citi scorul.", fallback.error);
    return {
      bestScore: Number(fallback.data?.best_score ?? 0),
      playerName: fallback.data?.player_name ?? null
    };
  }

  return {
    bestScore: Number(record.data?.best_score ?? 0),
    playerName: record.data?.player_name ?? null
  };
}

export async function saveActiveCampaignScore({
  userId,
  sessionId,
  score
}: {
  userId: string;
  sessionId: string;
  score: number;
}) {
  const { data, error } = await getSupabase().rpc("save_game_campaign_score", {
    p_user_id: userId,
    p_session_key: sessionId,
    p_score: score
  });
  if (error) {
    const message = String(error.message ?? "");
    const status = message.includes("Nu există o campanie activă") ? 409 : 400;
    throw new HttpError(status, message || "Nu am putut salva scorul în campanie.", error);
  }

  return {
    bestScore: Number(data?.bestScore ?? 0),
    playerName: data?.playerName ?? null,
    sessionId: data?.sessionId ?? sessionId,
    isNewGlobalRecord: false,
    campaign: data?.campaign ?? null
  };
}

export async function getAdminGameCampaignState() {
  await finalizeDueCampaigns();
  await promoteStartedCampaign();

  const [mode, campaignsResult, scoresResult] = await Promise.all([
    getGameRewardMode(),
    getSupabase().from("game_campaigns").select("*").order("created_at", { ascending: false }),
    getSupabase().from("game_campaign_scores").select("campaign_id")
  ]);
  if (campaignsResult.error) throw new HttpError(500, "Nu am putut citi campaniile.", campaignsResult.error);
  if (scoresResult.error) throw new HttpError(500, "Nu am putut număra participanții.", scoresResult.error);

  const participants = new Map<string, number>();
  for (const score of scoresResult.data ?? []) {
    participants.set(score.campaign_id, (participants.get(score.campaign_id) ?? 0) + 1);
  }

  return {
    mode,
    campaigns: (campaignsResult.data ?? []).map((campaign: any) =>
      serializeCampaign(campaign, participants.get(campaign.id) ?? 0)
    )
  };
}

export async function createGameCampaign(input: CreateGameCampaignInput, actorUserId: string) {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
  const { data, error } = await getSupabase().rpc("create_game_campaign", {
    p_name: input.name.trim(),
    p_starts_at: startsAt.toISOString(),
    p_ends_at: endsAt.toISOString(),
    p_first_prize_percent: input.firstPrizePercent,
    p_second_prize_percent: input.secondPrizePercent,
    p_third_prize_percent: input.thirdPrizePercent,
    p_maximum_discount: input.maximumDiscount ?? null,
    p_minimum_subtotal: input.minimumSubtotal,
    p_validity_days: input.validityDays ?? null,
    p_code_prefix: cleanCampaignPrefix(input.codePrefix),
    p_actor_user_id: actorUserId
  });
  if (error) throw new HttpError(400, error.message || "Nu am putut crea campania.", error);
  return serializeCampaign(data);
}

export async function updateGameCampaign(
  campaignId: string,
  input: UpdateGameCampaignInput,
  actorUserId: string
) {
  const { data, error } = await getSupabase().rpc("update_game_campaign", {
    p_campaign_id: campaignId,
    p_name: input.name.trim(),
    p_starts_at: new Date(input.startsAt).toISOString(),
    p_ends_at: new Date(input.endsAt).toISOString(),
    p_first_prize_percent: input.firstPrizePercent,
    p_second_prize_percent: input.secondPrizePercent,
    p_third_prize_percent: input.thirdPrizePercent,
    p_maximum_discount: input.maximumDiscount ?? null,
    p_minimum_subtotal: input.minimumSubtotal,
    p_validity_days: input.validityDays ?? null,
    p_code_prefix: cleanCampaignPrefix(input.codePrefix),
    p_actor_user_id: actorUserId
  });
  if (error) throw new HttpError(400, error.message || "Nu am putut actualiza campania.", error);
  return serializeCampaign(data);
}

export async function finalizeGameCampaign(campaignId: string, actorUserId: string) {
  const { data, error } = await getSupabase().rpc("finalize_game_campaign", {
    p_campaign_id: campaignId,
    p_actor_user_id: actorUserId
  });
  if (error) throw new HttpError(400, error.message || "Nu am putut finaliza campania.", error);
  return data;
}

export async function cancelGameCampaign(campaignId: string, actorUserId: string) {
  const { data, error } = await getSupabase().rpc("cancel_game_campaign", {
    p_campaign_id: campaignId,
    p_actor_user_id: actorUserId
  });
  if (error) throw new HttpError(400, error.message || "Nu am putut anula campania.", error);
  return serializeCampaign(data);
}

export async function updateGameRewardMode(mode: GameRewardMode, actorUserId: string) {
  const { data, error } = await getSupabase().rpc("set_game_reward_mode", {
    p_mode: mode,
    p_actor_user_id: actorUserId
  });
  if (error) throw new HttpError(400, error.message || "Nu am putut schimba metoda de recompensă.", error);
  return { mode: data?.mode === "campaign" ? "campaign" as const : "instant_record" as const };
}
