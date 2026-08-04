import { config } from "../config.js";
import { logInfo, logWarn } from "../lib/logger.js";
import { normalizePhone, toWhatsAppAddress } from "../lib/phone.js";
import { isGreenApiConfigured, requiredGreenApiEnvVars, sendGreenApiTextMessage } from "./greenApi.js";
import { isWawpConfigured, sendWawpTextMessage } from "./wawp.js";

type SendMessageInput = {
  to: string;
  body: string;
};

export function isWhatsAppApiConfigured() {
  if (isGreenApiProvider()) return isGreenApiConfigured();
  return isWawpProvider() && isWawpConfigured();
}

export function buildWaMeUrl(phone: string, body: string) {
  const normalized = normalizePhone(phone).replace(/^\+/, "");
  return `https://wa.me/${normalized}?text=${encodeURIComponent(body)}`;
}

export async function sendWhatsAppMessage({ to, body }: SendMessageInput) {
  const toAddress = to.startsWith("whatsapp:") ? to : toWhatsAppAddress(to);

  if (!isWhatsAppApiConfigured()) {
    if (isGreenApiProvider()) {
      logWarn("whatsapp:green-api:not-configured", requiredGreenApiEnvVars());
      throw new Error(`Green API is selected but is not configured: ${JSON.stringify(requiredGreenApiEnvVars())}`);
    }

    if (isWawpProvider()) {
      logWarn("whatsapp:wawp:not-configured");
      throw new Error("WAWP is selected but WAWP_INSTANCE_ID or WAWP_ACCESS_TOKEN is missing.");
    }

    logInfo("whatsapp:dev-log", {
      provider: config.whatsapp.provider,
      to: toAddress,
      body
    });
    return { provider: "log", sid: null };
  }

  if (isGreenApiProvider()) {
    logInfo("whatsapp:send:start", {
      provider: "green-api",
      to: toAddress,
      messageLength: body.length
    });
    const message = await sendGreenApiTextMessage(toAddress, body);
    logInfo("whatsapp:send:ok", {
      provider: "green-api",
      to: toAddress,
      sid: message.id
    });
    return { provider: "green-api", sid: message.id };
  }

  logInfo("whatsapp:send:start", {
    provider: "wawp",
    to: toAddress,
    messageLength: body.length
  });
  const message = await sendWawpTextMessage(toAddress, body);
  logInfo("whatsapp:send:ok", {
    provider: "wawp",
    to: toAddress,
    sid: message.id
  });

  return { provider: "wawp", sid: message.id };
}

function normalizedProvider() {
  return config.whatsapp.provider.trim().toLowerCase();
}

function isGreenApiProvider() {
  return ["green-api", "green", "green_api"].includes(normalizedProvider());
}

function isWawpProvider() {
  return normalizedProvider() === "wawp";
}

export async function sendVerificationCode(phone: string, code: string) {
  return sendWhatsAppMessage({
    to: phone,
    body: `Codul tău Mici de Negoești este ${code}. Expiră în ${config.verifyCodeTtlMinutes} minute.`
  });
}

export async function notifyStore(body: string) {
  if (!config.whatsapp.storeNumber) {
    logWarn("whatsapp:store-missing", { body });
    return { provider: "log", sid: null };
  }

  return sendWhatsAppMessage({ to: config.whatsapp.storeNumber, body });
}
