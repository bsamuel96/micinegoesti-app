export const EU_ALLERGEN_CODES = Array.from({ length: 14 }, (_, index) => index + 1);

export function normalizeAllergenCodes(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  const codes = value.map((code) => Number(code));
  if (codes.some((code) => !Number.isInteger(code) || !EU_ALLERGEN_CODES.includes(code))) {
    throw new Error("Codurile de alergeni trebuie să fie numere întregi între 1 și 14.");
  }

  return [...new Set(codes)].sort((first, second) => first - second);
}

export function readAllergenCodes(value: unknown): number[] {
  try {
    return normalizeAllergenCodes(value);
  } catch {
    return [];
  }
}
