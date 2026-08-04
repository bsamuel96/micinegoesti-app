export const EU_ALLERGENS = [
  { code: 1, label: "Gluten", description: "cereale care conțin gluten" },
  { code: 2, label: "Crustacee", description: "crustacee și produse derivate" },
  { code: 3, label: "Ouă", description: "ouă și produse derivate" },
  { code: 4, label: "Pește", description: "pește și produse derivate" },
  { code: 5, label: "Arahide", description: "arahide și produse derivate" },
  { code: 6, label: "Soia", description: "soia și produse derivate" },
  { code: 7, label: "Lapte", description: "lapte și produse derivate, inclusiv lactoză" },
  { code: 8, label: "Nuci", description: "fructe cu coajă lemnoasă și produse derivate" },
  { code: 9, label: "Țelină", description: "țelină și produse derivate" },
  { code: 10, label: "Muștar", description: "muștar și produse derivate" },
  { code: 11, label: "Susan", description: "semințe de susan și produse derivate" },
  { code: 12, label: "Sulfiți", description: "dioxid de sulf și sulfiți" },
  { code: 13, label: "Lupin", description: "lupin și produse derivate" },
  { code: 14, label: "Moluște", description: "moluște și produse derivate" }
] as const;

export function allergenLabels(codes: readonly number[]) {
  const selected = new Set(codes);
  return EU_ALLERGENS.filter((allergen) => selected.has(allergen.code));
}
