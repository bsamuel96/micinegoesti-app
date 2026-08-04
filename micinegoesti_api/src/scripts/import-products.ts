import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../lib/prisma.js";
import { importProductsFromCsv, importProductsFromWpJson } from "../modules/products/importer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argPath = process.argv[2];
const csvPath = argPath
  ? path.resolve(process.cwd(), argPath)
  : path.resolve(__dirname, "../../../wc-product-export-16-4-2026-1776329044372.csv");

async function main() {
  const content = await fs.readFile(csvPath, "utf8");
  const result = csvPath.endsWith(".json")
    ? await importProductsFromWpJson(content)
    : await importProductsFromCsv(content);
  console.log(`Imported ${result.imported} products from ${csvPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
