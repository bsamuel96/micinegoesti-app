import { Prisma } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";
import { CATEGORY_SEED } from "../../constants.js";
import { prisma } from "../../lib/prisma.js";

type CsvRecord = Record<string, string>;

function stripBom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

export function parseCsv(content: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length || row.length) {
    row.push(current);
    rows.push(row);
  }

  const headers = rows[0]?.map(stripBom) ?? [];
  return rows.slice(1).map((cells) =>
    headers.reduce<CsvRecord>((record, header, index) => {
      record[header] = cells[index] ?? "";
      return record;
    }, {})
  );
}

export function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ș/g, "s")
    .replace(/ț/g, "t")
    .replace(/ă/g, "a")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function knownCategory(label: string) {
  const slug = slugify(label);
  return CATEGORY_SEED.find((category) => category.slug === slug || slugify(category.label) === slug);
}

function repoRoot() {
  return process.cwd().endsWith(`${path.sep}server`) ? path.resolve(process.cwd(), "..") : process.cwd();
}

function legacyUploadPath(imageUrl: string) {
  try {
    const parsed = new URL(imageUrl);
    const marker = "/wp-content/uploads/";
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) return null;
    return decodeURIComponent(parsed.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

async function copyProductImageFromUploads(imageUrls: string, externalId: number, name: string) {
  const legacyImageUrl = imageUrls
    .split(",")
    .map((value) => value.trim())
    .find(Boolean);

  if (!legacyImageUrl) return { imageUrl: null, legacyImageUrl: null };

  const relativeUploadPath = legacyUploadPath(legacyImageUrl);
  if (!relativeUploadPath) return { imageUrl: legacyImageUrl, legacyImageUrl };

  const root = repoRoot();
  const source = path.join(root, "uploads", relativeUploadPath);
  const extension = path.extname(relativeUploadPath) || ".png";
  const base = `${externalId}-${slugify(name) || "product"}${extension}`;
  const publicFolder = path.join(root, "client", "public", "uploads", "products");
  const destination = path.join(publicFolder, base);

  try {
    await fs.mkdir(publicFolder, { recursive: true });
    await fs.copyFile(source, destination);
    return { imageUrl: `/uploads/products/${base}`, legacyImageUrl };
  } catch {
    return { imageUrl: legacyImageUrl, legacyImageUrl };
  }
}

export async function seedBaseCatalog() {
  await Promise.all(
    CATEGORY_SEED.map((category, sortOrder) =>
      prisma.category.upsert({
        where: { slug: category.slug },
        update: { label: category.label, sortOrder, isActive: true },
        create: { ...category, sortOrder }
      })
    )
  );
}

export async function importProductsFromCsv(content: string) {
  await seedBaseCatalog();
  const rows = parseCsv(content);
  let imported = 0;

  for (const row of rows) {
    const externalId = Number.parseInt(row.ID ?? "", 10);
    const name = row.Nume?.trim();
    if (!externalId || !name) continue;

    const salePrice = Number.parseFloat(row["Preț promoțional"] || "");
    const regularPrice = Number.parseFloat(row["Preț obișnuit"] || "0");
    const price = Number.isFinite(salePrice) && salePrice > 0 ? salePrice : regularPrice;
    const categoryLabels = (row.Categorii ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const slug = slugify(name) || `product-${externalId}`;
    const attributeName = row["Nume atribut 1"]?.trim();
    const attributeValues = row["Valoare (valori) atribut 1"]?.trim();
    const attributes =
      attributeName && attributeValues
        ? [{ name: attributeName, values: attributeValues.split(",").map((item) => item.trim()) }]
        : [];
    const image = await copyProductImageFromUploads(row.Imagini ?? "", externalId, name);

    const product = await prisma.product.upsert({
      where: { externalId },
      update: {
        slug,
        name,
        description: row.Descriere || null,
        shortDescription: row["Descriere scurtă"] || null,
        price: new Prisma.Decimal(Number.isFinite(price) ? price : 0),
        imageUrl: image.imageUrl,
        legacyImageUrl: image.legacyImageUrl,
        isPublished: row.Publicat !== "0",
        isAvailable: row["În stoc?"] !== "0",
        sortOrder: imported,
        attributesJson: attributes.length ? JSON.stringify(attributes) : null
      },
      create: {
        externalId,
        slug,
        name,
        description: row.Descriere || null,
        shortDescription: row["Descriere scurtă"] || null,
        price: new Prisma.Decimal(Number.isFinite(price) ? price : 0),
        imageUrl: image.imageUrl,
        legacyImageUrl: image.legacyImageUrl,
        isPublished: row.Publicat !== "0",
        isAvailable: row["În stoc?"] !== "0",
        sortOrder: imported,
        attributesJson: attributes.length ? JSON.stringify(attributes) : null
      }
    });

    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    if (image.imageUrl) {
      await prisma.productImage.create({
        data: {
          productId: product.id,
          url: image.imageUrl,
          legacyImageUrl: image.legacyImageUrl,
          alt: name,
          sortOrder: 0
        }
      });
    }

    await prisma.productCategory.deleteMany({ where: { productId: product.id } });

    for (const label of categoryLabels) {
      const known = knownCategory(label);
      const category = await prisma.category.upsert({
        where: { slug: known?.slug ?? slugify(label) },
        update: { label: known?.label ?? label, isActive: true },
        create: {
          slug: known?.slug ?? slugify(label),
          label: known?.label ?? label,
          sortOrder: known ? CATEGORY_SEED.findIndex((item) => item.slug === known.slug) : 99
        }
      });

      await prisma.productCategory.create({
        data: { productId: product.id, categoryId: category.id }
      });
    }

    imported += 1;
  }

  return { imported };
}

export async function importProductsFromWpJson(content: string) {
  await seedBaseCatalog();
  const parsed = JSON.parse(content) as Array<{ type?: string; name?: string; data?: any[] }>;
  const posts = parsed.find((entry) => entry.type === "table" && entry.name === "wp_posts")?.data ?? [];
  let imported = 0;

  for (const post of posts) {
    if (post.post_type !== "product" || post.post_status !== "publish") continue;
    const externalId = Number.parseInt(post.ID, 10);
    const name = String(post.post_title ?? "").trim();
    if (!externalId || !name) continue;

    await prisma.product.upsert({
      where: { externalId },
      update: {
        slug: post.post_name || slugify(name),
        name,
        description: post.post_content || null,
        shortDescription: post.post_excerpt || null,
        isPublished: true
      },
      create: {
        externalId,
        slug: post.post_name || slugify(name),
        name,
        description: post.post_content || null,
        shortDescription: post.post_excerpt || null,
        price: new Prisma.Decimal(0),
        isPublished: true
      }
    });
    imported += 1;
  }

  return { imported };
}
