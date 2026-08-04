import type { User } from "../../api/types";
import type { DashboardSection } from "./DashboardShell";

type SectionRule = DashboardSection & { roles: User["role"][] };

const sectionRules: SectionRule[] = [
  { key: "dashboard", label: "Panou", group: "Operațiuni", roles: ["admin", "store_manager", "kitchen", "deliverer"] },
  { key: "orders", label: "Comenzi", group: "Operațiuni", roles: ["admin", "store_manager", "kitchen"] },
  { key: "products", label: "Produse", group: "Catalog", roles: ["admin", "store_manager"] },
  { key: "categories", label: "Categorii", group: "Catalog", roles: ["admin", "store_manager"] },
  { key: "users", label: "Personal", group: "Administrare", roles: ["admin"] },
  { key: "vouchers", label: "Vouchere", group: "Administrare", roles: ["admin"] },
  { key: "delivery-zones", label: "Zone livrare", group: "Administrare", roles: ["admin"] },
  { key: "settings", label: "Setări", group: "Administrare", roles: ["admin"] }
];

export function getDashboardSections(role: User["role"]): DashboardSection[] {
  return sectionRules
    .filter((section) => section.roles.includes(role))
    .map(({ roles: _roles, ...section }) => section);
}
