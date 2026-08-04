export function normalizePhoneForSubmit(input: string) {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  let normalized: string;

  if (trimmed.startsWith("+")) normalized = `+${digits}`;
  else if (digits.startsWith("00")) normalized = `+${digits.slice(2)}`;
  else if (digits.startsWith("0")) normalized = `+40${digits.slice(1)}`;
  else if (digits.startsWith("40")) normalized = `+${digits}`;
  else normalized = `+40${digits}`;

  if (normalized.startsWith("+400")) {
    normalized = `+40${normalized.slice(4)}`;
  }

  if (!/^\+\d{8,15}$/.test(normalized)) {
    throw new Error("Introdu un număr complet, inclusiv prefixul de țară.");
  }

  return normalized;
}
