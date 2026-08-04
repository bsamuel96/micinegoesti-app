import { config } from "../config.js";
import { logError, logInfo, logWarn } from "../lib/logger.js";
import { normalizePhone } from "../lib/phone.js";

type GreenApiSendMessageResponse = {
  idMessage?: string;
  message?: string;
  error?: string;
};

export class GreenApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function requiredGreenApiEnvVars() {
  return {
    apiUrl: Boolean(config.whatsapp.greenApiBaseUrl),
    idInstance: Boolean(config.whatsapp.greenApiInstanceId),
    apiTokenInstance: Boolean(config.whatsapp.greenApiToken)
  };
}

export function isGreenApiConfigured() {
  return Boolean(config.whatsapp.greenApiInstanceId && config.whatsapp.greenApiToken);
}

export function toGreenApiChatId(phone: string) {
  const trimmed = phone.trim();
  if (/@(c\.us|g\.us|newsletter)$/i.test(trimmed)) return trimmed;

  return `${normalizePhone(trimmed).replace(/^\+/, "")}@c.us`;
}

export async function sendGreenApiTextMessage(to: string, message: string) {
  const baseUrl = config.whatsapp.greenApiBaseUrl.replace(/\/+$/, "");
  const instanceId = encodeURIComponent(config.whatsapp.greenApiInstanceId);
  const token = encodeURIComponent(config.whatsapp.greenApiToken);
  const endpoint = `${baseUrl}/waInstance${instanceId}/sendMessage/${token}`;
  const chatId = toGreenApiChatId(to);
  let response: Response;

  logInfo("green-api:send:start", {
    apiUrl: baseUrl,
    idInstance: config.whatsapp.greenApiInstanceId,
    chatId,
    messageLength: message.length
  });

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chatId,
        message
      })
    });
  } catch (error) {
    logError("green-api:send:network-failed", error, {
      apiUrl: baseUrl,
      idInstance: config.whatsapp.greenApiInstanceId,
      chatId
    });
    throw new GreenApiError(0, `Green API network request failed (${baseUrl}).`, error);
  }

  const payload = (await response.json().catch(() => null)) as GreenApiSendMessageResponse | null;

  if (!response.ok) {
    logWarn("green-api:send:failed", {
      apiUrl: baseUrl,
      idInstance: config.whatsapp.greenApiInstanceId,
      chatId,
      status: response.status,
      payload
    });
    throw new GreenApiError(
      response.status,
      payload?.message ?? payload?.error ?? "Green API request failed.",
      payload
    );
  }

  logInfo("green-api:send:ok", {
    apiUrl: baseUrl,
    idInstance: config.whatsapp.greenApiInstanceId,
    chatId,
    status: response.status,
    idMessage: payload?.idMessage ?? null
  });

  return {
    id: payload?.idMessage ?? null,
    raw: payload
  };
}
