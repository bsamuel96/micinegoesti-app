import { config } from "../../config.js";
import { HttpError } from "../../lib/http.js";
import { normalizePhone } from "../../lib/phone.js";
import { getSupabase } from "../../lib/supabase.js";
import { buildWaMeUrl, isWhatsAppApiConfigured, sendWhatsAppMessage } from "../../services/whatsapp.js";

type HandoverItemRecord = {
  id: string;
  code: string;
  source_shift_key: string;
  target_shift_key?: string | null;
  category: string;
  priority: string;
  location_label?: string | null;
  title: string;
};

type SubscriberRecord = {
  id: string;
  display_name: string;
  whatsapp_number: string;
  shift_filter: "all" | "shift_1" | "shift_2";
  priority_filter: "all" | "high_urgent" | "urgent_only";
  enabled: boolean;
};

export type ShiftWhatsAppResult = {
  id?: string;
  toNumber: string;
  provider: string;
  status: "sent" | "failed" | "manual_required" | "skipped";
  waMeUrl?: string | null;
  errorMessage?: string | null;
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Mică",
  normal: "Normală",
  high: "Mare",
  urgent: "Urgentă"
};

const SHIFT_LABELS: Record<string, string> = {
  shift_1: "Tura 1",
  shift_2: "Tura 2"
};

function appItemUrl(itemId: string) {
  const baseUrl = (config.clientUrl || "https://micinegoesti.ro").split(",")[0]?.replace(/\/+$/, "");
  return `${baseUrl}/shift-handover?item=${encodeURIComponent(itemId)}`;
}

export function buildShiftHandoverMessage(item: HandoverItemRecord) {
  return [
    "Mici de Negoești - Predare ture",
    `Cod: ${item.code}`,
    `Prioritate: ${PRIORITY_LABELS[item.priority] ?? item.priority}`,
    `Din: ${SHIFT_LABELS[item.source_shift_key] ?? item.source_shift_key}`,
    `Pentru: ${item.target_shift_key ? SHIFT_LABELS[item.target_shift_key] ?? item.target_shift_key : "Ambele ture / general"}`,
    item.location_label ? `Loc: ${item.location_label}` : null,
    `Titlu: ${item.title}`,
    `Vezi detalii în aplicație: ${appItemUrl(item.id)}`
  ]
    .filter(Boolean)
    .join("\n");
}

function subscriberMatches(item: HandoverItemRecord, subscriber: SubscriberRecord) {
  if (!subscriber.enabled) return false;

  if (subscriber.priority_filter === "urgent_only" && item.priority !== "urgent") return false;
  if (subscriber.priority_filter === "high_urgent" && !["high", "urgent"].includes(item.priority)) return false;

  if (subscriber.shift_filter === "all") return true;
  return [item.source_shift_key, item.target_shift_key].includes(subscriber.shift_filter);
}

async function insertNotification(input: {
  handoverItemId: string;
  subscriberId?: string | null;
  toNumber: string;
  provider: string;
  status: ShiftWhatsAppResult["status"];
  message: string;
  providerMessageId?: string | null;
  errorMessage?: string | null;
}) {
  const { data, error } = await getSupabase()
    .from("shift_whatsapp_notifications")
    .insert({
      handover_item_id: input.handoverItemId,
      subscriber_id: input.subscriberId ?? null,
      to_number: input.toNumber,
      provider: input.provider,
      status: input.status,
      message_preview: input.message.slice(0, 500),
      provider_message_id: input.providerMessageId ?? null,
      error_message: input.errorMessage ?? null,
      sent_at: input.status === "sent" ? new Date().toISOString() : null
    })
    .select("id")
    .single();
  if (error) throw new HttpError(500, "Nu am putut salva notificarea WhatsApp.", error);
  return data.id as string;
}

async function sendOne(item: HandoverItemRecord, toNumber: string, message: string, subscriberId?: string | null) {
  try {
    const normalized = normalizePhone(toNumber);
    const provider = isWhatsAppApiConfigured() ? config.whatsapp.provider : "log";

    if (!isWhatsAppApiConfigured()) {
      const id = await insertNotification({
        handoverItemId: item.id,
        subscriberId,
        toNumber: normalized,
        provider,
        status: "manual_required",
        message
      });
      return {
        id,
        toNumber: normalized,
        provider,
        status: "manual_required",
        waMeUrl: buildWaMeUrl(normalized, message),
        errorMessage: null
      } satisfies ShiftWhatsAppResult;
    }

    const result = await sendWhatsAppMessage({ to: normalized, body: message });
    const id = await insertNotification({
      handoverItemId: item.id,
      subscriberId,
      toNumber: normalized,
      provider: result.provider,
      status: "sent",
      message,
      providerMessageId: result.sid
    });
    return { id, toNumber: normalized, provider: result.provider, status: "sent", waMeUrl: null, errorMessage: null } satisfies ShiftWhatsAppResult;
  } catch (error) {
    const provider = isWhatsAppApiConfigured() ? config.whatsapp.provider : "log";
    const messageText = error instanceof Error ? error.message : String(error);
    const id = await insertNotification({
      handoverItemId: item.id,
      subscriberId,
      toNumber,
      provider,
      status: "failed",
      message,
      errorMessage: messageText
    });
    return { id, toNumber, provider, status: "failed", waMeUrl: null, errorMessage: messageText } satisfies ShiftWhatsAppResult;
  }
}

export async function sendShiftHandoverNotifications(
  item: HandoverItemRecord,
  options: { includeSubscribers?: boolean; oneTimeNumbers?: string[] } = {}
) {
  const message = buildShiftHandoverMessage(item);
  const targets: Array<{ number: string; subscriberId?: string | null }> = [];

  if (options.includeSubscribers !== false) {
    const { data, error } = await getSupabase()
      .from("shift_whatsapp_subscribers")
      .select("id, display_name, whatsapp_number, shift_filter, priority_filter, enabled")
      .eq("enabled", true);
    if (error) throw new HttpError(500, "Nu am putut citi abonații WhatsApp.", error);

    for (const subscriber of (data ?? []) as SubscriberRecord[]) {
      if (subscriberMatches(item, subscriber)) {
        targets.push({ number: subscriber.whatsapp_number, subscriberId: subscriber.id });
      }
    }
  }

  for (const number of options.oneTimeNumbers ?? []) {
    if (number.trim()) targets.push({ number: number.trim(), subscriberId: null });
  }

  const seen = new Set<string>();
  const uniqueTargets = targets.filter((target) => {
    const key = `${target.subscriberId ?? "manual"}:${target.number}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const results: ShiftWhatsAppResult[] = [];
  for (const target of uniqueTargets) {
    results.push(await sendOne(item, target.number, message, target.subscriberId));
  }

  return {
    message,
    results
  };
}
