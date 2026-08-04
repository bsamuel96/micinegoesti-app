import { config } from "../config.js";
import { normalizePhone } from "../lib/phone.js";

type WawpSendTextResponse = {
  id?: string;
  message_id?: string;
  messageId?: string;
  data?: {
    id?: string;
    message_id?: string;
  };
};

export class WawpApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function isWawpConfigured() {
  return Boolean(config.whatsapp.wawpInstanceId && config.whatsapp.wawpAccessToken);
}

export function toWawpChatId(phone: string) {
  const trimmed = phone.trim();
  if (/@(c\.us|g\.us|newsletter)$/i.test(trimmed)) return trimmed;

  return `${normalizePhone(trimmed).replace(/^\+/, "")}@c.us`;
}

export async function sendWawpTextMessage(to: string, message: string) {
  const params = new URLSearchParams({
    instance_id: config.whatsapp.wawpInstanceId,
    access_token: config.whatsapp.wawpAccessToken
  });
  const response = await fetch(`${config.whatsapp.wawpBaseUrl}/v2/send/text?${params.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chatId: toWawpChatId(to),
      message
    })
  });
  const payload = (await response.json().catch(() => null)) as WawpSendTextResponse & {
    message?: string;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new WawpApiError(
      response.status,
      payload?.message ?? payload?.error ?? "WAWP API request failed.",
      payload
    );
  }

  return {
    id: payload?.message_id ?? payload?.messageId ?? payload?.id ?? payload?.data?.message_id ?? payload?.data?.id ?? null,
    raw: payload
  };
}
