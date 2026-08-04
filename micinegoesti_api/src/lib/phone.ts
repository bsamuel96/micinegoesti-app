export function normalizePhone(input: string) {
  const trimmed = input.trim().replace(/^whatsapp:/i, "").trim();
  const digits = trimmed.replace(/\D/g, "");
  let normalized: string;

  if (trimmed.startsWith("+")) normalized = `+${digits}`;
  else if (digits.startsWith("00")) normalized = `+${digits.slice(2)}`;
  else if (digits.startsWith("0")) normalized = `+40${digits.slice(1)}`;
  else if (digits.startsWith("40")) normalized = `+${digits}`;
  else normalized = `+40${digits}`;

  // People commonly keep the Romanian trunk prefix after selecting +40.
  // E.164 omits it: "+40 0757..." must become "+40 757...".
  if (normalized.startsWith("+400")) {
    normalized = `+40${normalized.slice(4)}`;
  }

  return normalized;
}

export function isValidNormalizedPhone(phone: string) {
  return /^\+\d{8,15}$/.test(phone);
}

export function toWhatsAppAddress(phone: string) {
  const normalized = normalizePhone(phone);
  return normalized.startsWith("whatsapp:") ? normalized : `whatsapp:${normalized}`;
}
