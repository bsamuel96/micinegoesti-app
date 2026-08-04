import { config } from "../../config.js";
import { HttpError } from "../../lib/http.js";
import type { Coordinates } from "./delivery-location.js";

type NominatimResponse = {
  display_name?: string;
  address?: {
    house_number?: string;
    road?: string;
    pedestrian?: string;
    suburb?: string;
    neighbourhood?: string;
    village?: string;
    town?: string;
    city?: string;
    municipality?: string;
    county?: string;
    postcode?: string;
    country?: string;
  };
};

const cache = new Map<string, { address: string; expiresAt: number }>();
let requestQueue = Promise.resolve();
let lastRequestAt = 0;

function cacheKey({ lat, lng }: Coordinates) {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function formatRomanianAddress(result: NominatimResponse) {
  const address = result.address ?? {};
  const street = [address.road ?? address.pedestrian, address.house_number].filter(Boolean).join(" ");
  const locality =
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.suburb ??
    address.neighbourhood;
  const parts = [street, locality, address.county, address.postcode].filter(
    (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index
  );
  return parts.join(", ") || result.display_name?.trim() || "";
}

async function waitForRateLimit() {
  const waitMs = Math.max(0, 1000 - (Date.now() - lastRequestAt));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastRequestAt = Date.now();
}

export async function reverseGeocode(coordinates: Coordinates) {
  const key = cacheKey(coordinates);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.address;

  const task = requestQueue.then(async () => {
    await waitForRateLimit();
    const url = new URL("/reverse", config.geocoding.baseUrl);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(coordinates.lat));
    url.searchParams.set("lon", String(coordinates.lng));
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "ro,en");
    url.searchParams.set("zoom", "18");

    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": config.geocoding.userAgent,
        ...(config.geocoding.contactEmail ? { "From": config.geocoding.contactEmail } : {})
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new HttpError(502, "Nu am putut identifica adresa pentru locația selectată.");

    const address = formatRomanianAddress((await response.json()) as NominatimResponse);
    if (!address) throw new HttpError(404, "Nu am găsit o adresă pentru locația selectată.");
    cache.set(key, { address, expiresAt: Date.now() + config.geocoding.cacheTtlMs });
    return address;
  });

  requestQueue = task.then(() => undefined, () => undefined);
  return task;
}

export { formatRomanianAddress };

