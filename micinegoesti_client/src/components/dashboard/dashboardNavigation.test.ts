import { describe, expect, it } from "vitest";
import { getDashboardSections } from "./dashboardNavigation";

describe("getDashboardSections", () => {
  it("keeps deliverers in the single focused workflow", () => {
    expect(getDashboardSections("deliverer").map((section) => section.key)).toEqual(["dashboard"]);
  });

  it("keeps all administration sections available to administrators", () => {
    expect(getDashboardSections("admin").map((section) => section.key)).toEqual([
      "dashboard",
      "orders",
      "products",
      "categories",
      "users",
      "vouchers",
      "delivery-zones",
      "settings"
    ]);
  });

  it("hides vouchers from non-admin staff", () => {
    expect(getDashboardSections("store_manager").map((section) => section.key)).not.toContain("vouchers");
  });
});
