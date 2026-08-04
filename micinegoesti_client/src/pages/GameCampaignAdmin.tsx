import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Flag, Pencil, Save, Timer, Trophy, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { GameCampaign, GameRewardMode } from "../api/types";
import { StatusBadge } from "../components/dashboard/DashboardPrimitives";

function localDateTimeValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function campaignStatus(campaign: GameCampaign) {
  if (campaign.status === "active") return { label: "Activă", tone: "success" as const };
  if (campaign.status === "scheduled") return { label: "Programată", tone: "warning" as const };
  if (campaign.status === "finished") return { label: "Finalizată", tone: "brand" as const };
  return { label: "Anulată", tone: "danger" as const };
}

function formatRemaining(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return [
    days ? `${days}z` : "",
    `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  ].filter(Boolean).join(" ");
}

function CampaignAdminTimer({ campaign }: { campaign: GameCampaign }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (campaign.status !== "active" && campaign.status !== "scheduled") return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [campaign.status]);

  if (campaign.status === "finished") return <span><Timer size={15} aria-hidden="true" /> Încheiată</span>;
  if (campaign.status === "cancelled") return <span><Timer size={15} aria-hidden="true" /> Oprită</span>;

  const startsAt = new Date(campaign.startsAt).getTime();
  const endsAt = new Date(campaign.endsAt).getTime();
  const beforeStart = now < startsAt;
  const remaining = Math.max(0, (beforeStart ? startsAt : endsAt) - now);

  return (
    <span className="game-campaign-admin-timer">
      <Timer size={15} aria-hidden="true" />
      {remaining > 0
        ? `${beforeStart ? "Începe în" : "Se încheie în"} ${formatRemaining(remaining)}`
        : "Se finalizează…"}
    </span>
  );
}

export function GameCampaignAdmin() {
  const queryClient = useQueryClient();
  const [durationUnit, setDurationUnit] = useState<"minutes" | "hours" | "days">("days");
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const state = useQuery({
    queryKey: ["admin-game-campaigns"],
    queryFn: () => api.adminGameCampaigns(),
    refetchInterval: 10_000
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin-game-campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["game-leaderboard"] });
    queryClient.invalidateQueries({ queryKey: ["admin-vouchers"] });
  }

  const createMutation = useMutation({
    mutationFn: (payload: unknown) => api.createGameCampaign(payload),
    onSuccess: invalidate
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: unknown }) =>
      api.updateGameCampaign(id, payload),
    onSuccess: () => {
      setEditingCampaignId(null);
      invalidate();
    }
  });
  const campaignAction = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "finalize" | "cancel" }) => {
      if (action === "finalize") {
        await api.finalizeGameCampaign(id);
      } else {
        await api.cancelGameCampaign(id);
      }
    },
    onSuccess: invalidate
  });

  const liveCampaign = state.data?.campaigns.find(
    (campaign) => campaign.status === "scheduled" || campaign.status === "active"
  );

  return (
    <div className="game-campaign-admin">
      <form
        className="admin-form voucher-form game-campaign-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const duration = Number(form.get("duration"));
          const durationMultiplier = durationUnit === "days" ? 1_440 : durationUnit === "hours" ? 60 : 1;

          createMutation.mutate({
            name: form.get("name"),
            startsAt: new Date(String(form.get("startsAt"))).toISOString(),
            durationMinutes: duration * durationMultiplier,
            firstPrizePercent: Number(form.get("firstPrizePercent")),
            secondPrizePercent: Number(form.get("secondPrizePercent")),
            thirdPrizePercent: Number(form.get("thirdPrizePercent")),
            maximumDiscount: form.get("maximumDiscount") ? Number(form.get("maximumDiscount")) : null,
            minimumSubtotal: Number(form.get("minimumSubtotal") || 0),
            validityDays: form.get("validityDays") ? Number(form.get("validityDays")) : null,
            codePrefix: form.get("codePrefix")
          });
        }}
      >
        <div className="voucher-form-head">
          <div>
            <span className="dashboard-eyebrow">Metodă activă</span>
            <h3>Campanie cu clasament</h3>
          </div>
          <StatusBadge tone={state.data?.mode === "campaign" ? "success" : "neutral"}>
            {state.data?.mode === "campaign" ? "Mod campanie" : "Record instant activ"}
          </StatusBadge>
        </div>

        <p className="voucher-security-notice">
          <Trophy aria-hidden="true" size={18} />
          La final, locurile 1–3 primesc automat voucherele configurate. Voucherele rămân în aprobare pentru verificarea administratorului.
        </p>

        <label className="dashboard-field">
          <span>Nume campanie</span>
          <input name="name" defaultValue="Campania Aventura Micului" required />
        </label>

        <label className="dashboard-field">
          <span>Începe la</span>
          <input name="startsAt" type="datetime-local" defaultValue={localDateTimeValue()} required />
        </label>

        <div className="voucher-two-cols">
          <label className="dashboard-field">
            <span>Durată</span>
            <input name="duration" type="number" min="1" defaultValue="7" required />
          </label>
          <label className="dashboard-field">
            <span>Unitate</span>
            <select value={durationUnit} onChange={(event) => setDurationUnit(event.target.value as typeof durationUnit)}>
              <option value="minutes">Minute</option>
              <option value="hours">Ore</option>
              <option value="days">Zile</option>
            </select>
          </label>
        </div>

        <fieldset className="game-campaign-prize-fields">
          <legend>Premii procentuale</legend>
          <label className="dashboard-field"><span>Locul 1</span><input name="firstPrizePercent" type="number" min="0.01" max="100" step="0.01" defaultValue="15" required /></label>
          <label className="dashboard-field"><span>Locul 2</span><input name="secondPrizePercent" type="number" min="0.01" max="100" step="0.01" defaultValue="10" required /></label>
          <label className="dashboard-field"><span>Locul 3</span><input name="thirdPrizePercent" type="number" min="0.01" max="100" step="0.01" defaultValue="5" required /></label>
        </fieldset>

        <div className="voucher-two-cols">
          <label className="dashboard-field"><span>Subtotal minim</span><input name="minimumSubtotal" type="number" min="0" step="0.01" defaultValue="0" /></label>
          <label className="dashboard-field"><span>Discount maxim opțional</span><input name="maximumDiscount" type="number" min="0" step="0.01" /></label>
        </div>
        <div className="voucher-two-cols">
          <label className="dashboard-field"><span>Zile valabilitate</span><input name="validityDays" type="number" min="1" defaultValue="14" /></label>
          <label className="dashboard-field"><span>Prefix cod</span><input name="codePrefix" defaultValue="CAMPANIE" required /></label>
        </div>

        <button className="primary-button" disabled={createMutation.isPending || Boolean(liveCampaign)}>
          {createMutation.isPending ? "Se creează..." : liveCampaign ? "Există deja o campanie în curs" : "Creează și activează campania"}
        </button>
        {createMutation.error ? <p className="form-error" role="alert">{createMutation.error.message}</p> : null}
      </form>

      <section className="management-list-section game-campaign-history">
        <div className="voucher-form-head">
          <div>
            <span className="dashboard-eyebrow">Istoric</span>
            <h3>Campanii configurate</h3>
          </div>
          <CalendarClock aria-hidden="true" size={22} />
        </div>

        {state.isLoading ? <p>Se încarcă...</p> : null}
        {!state.isLoading && !state.data?.campaigns.length ? <p>Nu există campanii încă.</p> : null}

        <div className="game-campaign-list">
          {state.data?.campaigns.map((campaign) => {
            const status = campaignStatus(campaign);
            const isDue = new Date(campaign.endsAt).getTime() <= Date.now();
            const isLive = campaign.status === "active" || campaign.status === "scheduled";

            return (
              <article className="game-campaign-row" key={campaign.id}>
                <div className="game-campaign-row-main">
                  <div>
                    <strong>{campaign.name}</strong>
                    <span>{formatDate(campaign.startsAt)} – {formatDate(campaign.endsAt)}</span>
                  </div>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </div>
                <div className="game-campaign-row-meta">
                  <CampaignAdminTimer campaign={campaign} />
                  <span>{campaign.participantCount ?? 0} participanți</span>
                  <span><Trophy size={15} aria-hidden="true" /> {campaign.prizes.join("% · ")}%</span>
                </div>
                {isLive ? (
                  <div className="table-action-group">
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={campaignAction.isPending || updateMutation.isPending}
                      onClick={() => setEditingCampaignId((current) => current === campaign.id ? null : campaign.id)}
                    >
                      <Pencil size={16} /> {editingCampaignId === campaign.id ? "Închide editorul" : "Editează toate setările"}
                    </button>
                    {isDue ? (
                      <button className="secondary-button" type="button" disabled={campaignAction.isPending} onClick={() => campaignAction.mutate({ id: campaign.id, action: "finalize" })}>
                        <Flag size={16} /> Finalizează și acordă premiile
                      </button>
                    ) : null}
                    <button className="secondary-button" type="button" disabled={campaignAction.isPending} onClick={() => campaignAction.mutate({ id: campaign.id, action: "cancel" })}>
                      <XCircle size={16} /> Anulează
                    </button>
                  </div>
                ) : null}
                {editingCampaignId === campaign.id ? (
                  <CampaignEditForm
                    campaign={campaign}
                    pending={updateMutation.isPending}
                    error={updateMutation.error?.message ?? ""}
                    onCancel={() => setEditingCampaignId(null)}
                    onSave={(payload) => updateMutation.mutate({ id: campaign.id, payload })}
                  />
                ) : null}
              </article>
            );
          })}
        </div>
        {state.error || campaignAction.error ? (
          <p className="form-error" role="alert">{(state.error || campaignAction.error)?.message}</p>
        ) : null}
      </section>
    </div>
  );
}

function CampaignEditForm({
  campaign,
  pending,
  error,
  onCancel,
  onSave
}: {
  campaign: GameCampaign;
  pending: boolean;
  error: string;
  onCancel: () => void;
  onSave: (payload: unknown) => void;
}) {
  return (
    <form
      className="game-campaign-edit-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSave({
          name: form.get("name"),
          startsAt: new Date(String(form.get("startsAt"))).toISOString(),
          endsAt: new Date(String(form.get("endsAt"))).toISOString(),
          firstPrizePercent: Number(form.get("firstPrizePercent")),
          secondPrizePercent: Number(form.get("secondPrizePercent")),
          thirdPrizePercent: Number(form.get("thirdPrizePercent")),
          maximumDiscount: form.get("maximumDiscount") ? Number(form.get("maximumDiscount")) : null,
          minimumSubtotal: Number(form.get("minimumSubtotal") || 0),
          validityDays: form.get("validityDays") ? Number(form.get("validityDays")) : null,
          codePrefix: form.get("codePrefix")
        });
      }}
    >
      <div className="voucher-form-head">
        <div>
          <span className="dashboard-eyebrow">Control complet</span>
          <h4>Setările și timerul campaniei</h4>
        </div>
      </div>

      <label className="dashboard-field">
        <span>Nume campanie</span>
        <input name="name" defaultValue={campaign.name} required />
      </label>
      <div className="voucher-two-cols">
        <label className="dashboard-field">
          <span>Începe la</span>
          <input name="startsAt" type="datetime-local" defaultValue={localDateTimeValue(new Date(campaign.startsAt))} required />
        </label>
        <label className="dashboard-field">
          <span>Se încheie la</span>
          <input name="endsAt" type="datetime-local" defaultValue={localDateTimeValue(new Date(campaign.endsAt))} required />
        </label>
      </div>

      <fieldset className="game-campaign-prize-fields">
        <legend>Premii procentuale</legend>
        <label className="dashboard-field"><span>Locul 1</span><input name="firstPrizePercent" type="number" min="0.01" max="100" step="0.01" defaultValue={campaign.prizes[0]} required /></label>
        <label className="dashboard-field"><span>Locul 2</span><input name="secondPrizePercent" type="number" min="0.01" max="100" step="0.01" defaultValue={campaign.prizes[1]} required /></label>
        <label className="dashboard-field"><span>Locul 3</span><input name="thirdPrizePercent" type="number" min="0.01" max="100" step="0.01" defaultValue={campaign.prizes[2]} required /></label>
      </fieldset>

      <div className="voucher-two-cols">
        <label className="dashboard-field"><span>Subtotal minim</span><input name="minimumSubtotal" type="number" min="0" step="0.01" defaultValue={campaign.minimumSubtotal} /></label>
        <label className="dashboard-field"><span>Discount maxim opțional</span><input name="maximumDiscount" type="number" min="0" step="0.01" defaultValue={campaign.maximumDiscount ?? ""} /></label>
      </div>
      <div className="voucher-two-cols">
        <label className="dashboard-field"><span>Zile valabilitate</span><input name="validityDays" type="number" min="1" defaultValue={campaign.validityDays ?? ""} /></label>
        <label className="dashboard-field"><span>Prefix cod</span><input name="codePrefix" defaultValue={campaign.codePrefix} required /></label>
      </div>

      <p className="campaign-edit-warning">
        Dacă setezi finalul în trecut, campania se încheie imediat și premiile sunt calculate cu aceste valori.
      </p>
      <div className="table-action-group">
        <button className="primary-button" disabled={pending}>
          <Save size={16} /> {pending ? "Se salvează..." : "Salvează toate modificările"}
        </button>
        <button className="secondary-button" type="button" disabled={pending} onClick={onCancel}>
          Renunță
        </button>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </form>
  );
}

export function RewardModeButton({
  mode,
  disabled,
  onDone
}: {
  mode: GameRewardMode;
  disabled?: boolean;
  onDone: () => void;
}) {
  const mutation = useMutation({
    mutationFn: () => api.updateGameRewardMode(mode),
    onSuccess: onDone
  });

  return (
    <>
      <button className="secondary-button" type="button" disabled={disabled || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Se activează..." : mode === "instant_record" ? "Activează recordul instant" : "Activează modul campanie"}
      </button>
      {mutation.error ? <p className="form-error" role="alert">{mutation.error.message}</p> : null}
    </>
  );
}
