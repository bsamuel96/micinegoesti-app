import { Router } from "express";
import { z } from "zod";
import { Role, SETTING_DEFAULTS } from "../../constants.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { getSupabase } from "../../lib/supabase.js";
import { requireRoles } from "../../middleware/auth.js";
import { config } from "../../config.js";

export const settingsRouter = Router();

export type DeliveryZone = {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  sortOrder: number;
  description?: string | null;
};

type SettingRow = {
  key: string;
  value: string;
  isSecret?: boolean;
};

function normalizeDeliveryZones(raw: unknown) {
  const parsed = (() => {
    if (Array.isArray(raw)) return raw as Partial<DeliveryZone>[];
    if (typeof raw !== "string") return [];

    try {
      const value = JSON.parse(raw.trim() ? raw : SETTING_DEFAULTS.deliveryZones);
      return Array.isArray(value) ? (value as Partial<DeliveryZone>[]) : [];
    } catch {
      return JSON.parse(SETTING_DEFAULTS.deliveryZones) as Partial<DeliveryZone>[];
    }
  })();

  return parsed
    .map((zone, index) => ({
      id: String(zone.id || `zone-${index + 1}`),
      name: String(zone.name || `Zona ${index + 1}`),
      price: Number.isFinite(Number(zone.price)) && Number(zone.price) >= 0 ? Number(zone.price) : 0,
      isActive: zone.isActive !== false,
      sortOrder: Number.isFinite(Number(zone.sortOrder)) ? Number(zone.sortOrder) : index,
      description: zone.description ? String(zone.description) : null
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

function serializeSettings(settings: SettingRow[], includeSecrets = false) {
  return settings.reduce<Record<string, string>>((record, setting) => {
    record[setting.key] = setting.isSecret && !includeSecrets ? "" : setting.value;
    return record;
  }, {});
}

function zoneFromRow(row: any): DeliveryZone {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price ?? 0),
    isActive: row.isActive !== false,
    sortOrder: Number(row.sortOrder ?? 0),
    description: row.description ?? null
  };
}

export async function upsertSetting(key: string, value: unknown) {
  const stringValue = String(value);
  const { error } = await getSupabase()
    .from("settings")
    .upsert(
      {
        key,
        value: stringValue,
        isSecret: key.toLowerCase().includes("secret") || key.toLowerCase().includes("token")
      },
      { onConflict: "key" }
    );

  if (error) throw new HttpError(500, "Nu am putut salva setarea.", error);
}

export async function ensureDefaultSettings() {
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    const { error } = await getSupabase()
      .from("settings")
      .upsert(
        {
          key,
          value,
          isSecret: key.toLowerCase().includes("secret")
        },
        { onConflict: "key", ignoreDuplicates: true }
      );
    if (error) throw new HttpError(500, "Nu am putut inițializa setările.", error);
  }

  const { count, error: countError } = await getSupabase()
    .from("delivery_zones")
    .select("id", { count: "exact", head: true });
  if (countError) throw new HttpError(500, "Nu am putut citi zonele de livrare.", countError);
  if ((count ?? 0) > 0) return;

  const zones = normalizeDeliveryZones(SETTING_DEFAULTS.deliveryZones);
  if (!zones.length) return;

  const { error } = await getSupabase().from("delivery_zones").insert(
    zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      price: zone.price,
      isActive: zone.isActive,
      sortOrder: zone.sortOrder,
      description: zone.description
    }))
  );
  if (error) throw new HttpError(500, "Nu am putut inițializa zonele de livrare.", error);
}

export async function getSetting(key: keyof typeof SETTING_DEFAULTS | string) {
  const { data, error } = await getSupabase().from("settings").select("value").eq("key", key).maybeSingle();
  if (error) throw new HttpError(500, "Nu am putut citi setarea.", error);
  return data?.value ?? SETTING_DEFAULTS[key as keyof typeof SETTING_DEFAULTS] ?? "";
}

export async function getDeliveryFee() {
  const raw = await getSetting("deliveryFee");
  const fee = Number.parseFloat(raw);
  return Number.isFinite(fee) && fee >= 0 ? fee : 0;
}

export async function getMinimumDeliveryOrderAmount() {
  const raw = await getSetting("minimumDeliveryOrderAmount");
  const amount = Number.parseFloat(raw);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

export async function getDeliveryZones(includeInactive = false) {
  const query = getSupabase()
    .from("delivery_zones")
    .select("id, name, price, isActive, sortOrder, description")
    .order("sortOrder", { ascending: true })
    .order("name", { ascending: true });

  if (!includeInactive) query.eq("isActive", true);
  const { data, error } = await query;
  if (error) throw new HttpError(500, "Nu am putut citi zonele de livrare.", error);

  if (data?.length) return data.map(zoneFromRow);
  const raw = await getSetting("deliveryZones");
  return normalizeDeliveryZones(raw).filter((zone) => includeInactive || zone.isActive);
}

export async function getDeliveryFeeForZone(zoneId?: string) {
  const zones = await getDeliveryZones(false);
  if (!zones.length) return getDeliveryFee();

  if (!zoneId) {
    throw new Error("Selectează zona de livrare.");
  }

  const zone = zones.find((candidate) => candidate.id === zoneId);
  if (!zone) {
    throw new Error("Zona de livrare nu este disponibilă.");
  }

  return zone.price;
}

async function replaceDeliveryZones(raw: unknown) {
  const zones = normalizeDeliveryZones(raw);
  const { error: deleteError } = await getSupabase().from("delivery_zones").delete().neq("id", "");
  if (deleteError) throw new HttpError(500, "Nu am putut șterge zonele vechi.", deleteError);

  if (zones.length) {
    const { error } = await getSupabase().from("delivery_zones").insert(
      zones.map((zone) => ({
        id: zone.id,
        name: zone.name,
        price: zone.price,
        isActive: zone.isActive,
        sortOrder: zone.sortOrder,
        description: zone.description
      }))
    );
    if (error) throw new HttpError(500, "Nu am putut salva zonele de livrare.", error);
  }

  await upsertSetting("deliveryZones", JSON.stringify(zones));
  return zones;
}

async function settingsWithDeliveryZones(includeSecrets = false, includeInactiveZones = false) {
  const { data, error } = await getSupabase().from("settings").select("key, value, isSecret").order("key");
  if (error) throw new HttpError(500, "Nu am putut citi setările.", error);

  return {
    ...serializeSettings((data ?? []) as SettingRow[], includeSecrets),
    deliveryZones: JSON.stringify(await getDeliveryZones(includeInactiveZones))
  };
}

settingsRouter.get(
  "/settings/public",
  asyncHandler(async (_req, res) => {
    await ensureDefaultSettings();
    const settings = await settingsWithDeliveryZones(false, false);
    res.json({ settings: {
      ...settings,
      storeLatitude: String(config.delivery.storeLatitude),
      storeLongitude: String(config.delivery.storeLongitude),
      maxDeliveryRadiusKm: String(config.delivery.maxRadiusKm)
    } });
  })
);

settingsRouter.get(
  "/settings",
  requireRoles(Role.ADMIN),
  asyncHandler(async (_req, res) => {
    await ensureDefaultSettings();
    res.json({ settings: await settingsWithDeliveryZones(true, true) });
  })
);

settingsRouter.patch(
  "/settings",
  requireRoles(Role.ADMIN),
  asyncHandler(async (req, res) => {
    const input = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).parse(req.body);

    for (const [key, value] of Object.entries(input)) {
      if (key === "deliveryZones") {
        await replaceDeliveryZones(value);
      } else {
        await upsertSetting(key, value);
      }
    }

    res.json({ settings: await settingsWithDeliveryZones(true, true) });
  })
);
