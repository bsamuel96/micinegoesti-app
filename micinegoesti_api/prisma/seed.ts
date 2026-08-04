import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
import { Role } from "../src/constants.js";
import { prisma } from "../src/lib/prisma.js";
import { normalizePhone } from "../src/lib/phone.js";
import { importProductsFromCsv, seedBaseCatalog } from "../src/modules/products/importer.js";
import { ensureDefaultSettings } from "../src/modules/settings/settings.routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  await seedBaseCatalog();
  await ensureDefaultSettings();

  await prisma.user.upsert({
    where: { phone: normalizePhone(config.admin.phone) },
    update: {
      email: config.admin.email,
      name: config.admin.name,
      role: Role.ADMIN,
      isActive: true
    },
    create: {
      phone: normalizePhone(config.admin.phone),
      email: config.admin.email,
      name: config.admin.name,
      role: Role.ADMIN
    }
  });

  const csvPath = path.resolve(__dirname, "../../wc-product-export-16-4-2026-1776329044372.csv");
  try {
    const content = await fs.readFile(csvPath, "utf8");
    const result = await importProductsFromCsv(content);
    console.log(`Seeded settings, admin, and ${result.imported} products.`);
  } catch {
    console.log("Seeded settings and admin. Product CSV was not found.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
