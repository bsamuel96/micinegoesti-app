import dotenv from "dotenv";

dotenv.config();

function intFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numberFromEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringFromEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return "";
}

const greenApiInstanceId = stringFromEnv("GREEN_API_INSTANCE_ID", "GREEN_API_ID_INSTANCE", "idInstance");
const greenApiToken = stringFromEnv(
  "GREEN_API_TOKEN",
  "GREEN_API_TOKEN_INSTANCE",
  "GREEN_API_API_TOKEN_INSTANCE",
  "apiTokenInstance"
);

const logStorage = (process.env.LOG_STORAGE ?? (process.env.VERCEL ? "supabase" : "file")).trim().toLowerCase();

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: intFromEnv("PORT", 4000),
  logDir: process.env.LOG_DIR ?? "logs",
  logStorage: logStorage === "supabase" ? "supabase" : "file",
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  corsOrigins: process.env.CORS_ORIGINS ?? "",
  vercel: {
    url: process.env.VERCEL_URL ?? "",
    branchUrl: process.env.VERCEL_BRANCH_URL ?? "",
    projectProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? ""
  },
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  supabase: {
    url: process.env.SUPABASE_URL ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  },
  delivery: {
    storeLatitude: numberFromEnv("STORE_LATITUDE", 44.380758),
    storeLongitude: numberFromEnv("STORE_LONGITUDE", 26.167395),
    maxRadiusKm: numberFromEnv("MAX_DELIVERY_RADIUS_KM", 20)
  },
  geocoding: {
    baseUrl: process.env.REVERSE_GEOCODING_URL ?? "https://nominatim.openstreetmap.org",
    userAgent: process.env.GEOCODING_USER_AGENT ?? "MiciDeNegoesti/1.0 (https://micinegoesti.ro)",
    contactEmail: process.env.GEOCODING_CONTACT_EMAIL ?? "",
    cacheTtlMs: intFromEnv("GEOCODING_CACHE_TTL_MS", 24 * 60 * 60 * 1000)
  },
  productImages: {
    bucket: process.env.SUPABASE_PRODUCT_IMAGES_BUCKET ?? "product-images",
    maxImages: intFromEnv("PRODUCT_IMAGES_MAX_COUNT", 8),
    maxFileSize: intFromEnv("PRODUCT_IMAGES_MAX_FILE_SIZE", 10 * 1024 * 1024),
    maxDimension: intFromEnv("PRODUCT_IMAGES_MAX_DIMENSION", 1920),
    quality: intFromEnv("PRODUCT_IMAGES_WEBP_QUALITY", 82)
  },
  verifyCodeTtlMinutes: intFromEnv("VERIFY_CODE_TTL_MINUTES", 10),
  otpRateLimitWindowMinutes: intFromEnv("OTP_RATE_LIMIT_WINDOW_MINUTES", 10),
  otpRateLimitMax: intFromEnv("OTP_RATE_LIMIT_MAX", 4),
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE ?? "RO",
  admin: {
    login: process.env.ADMIN_LOGIN ?? "",
    phone: process.env.ADMIN_PHONE ?? "+40740000000",
    email: process.env.ADMIN_EMAIL ?? "admin@micinegoesti.ro",
    name: process.env.ADMIN_NAME ?? "Admin Mici de Negoești",
    password: process.env.ADMIN_PASSWORD ?? "",
    passwordHash: process.env.ADMIN_PASSWORD_HASH ?? ""
  },
  dummyCustomer: {
    enabled: (process.env.DUMMY_CUSTOMER_ENABLED ?? "false").toLowerCase() === "true",
    phone: process.env.DUMMY_CUSTOMER_PHONE ?? "+40700000000",
    name: process.env.DUMMY_CUSTOMER_NAME ?? "Client Demo"
  },
  whatsapp: {
    provider: process.env.WHATSAPP_PROVIDER ?? (greenApiInstanceId && greenApiToken ? "green-api" : "log"),
    storeNumber: process.env.WHATSAPP_STORE_NUMBER ?? process.env.STORE_WHATSAPP_TO ?? "",
    wawpBaseUrl: process.env.WAWP_API_BASE_URL ?? "https://api.wawp.net",
    wawpInstanceId: process.env.WAWP_INSTANCE_ID ?? "",
    wawpAccessToken: process.env.WAWP_ACCESS_TOKEN ?? "",
    greenApiBaseUrl: stringFromEnv("GREEN_API_API_URL", "GREEN_API_BASE_URL", "apiUrl") || "https://api.greenapi.com",
    greenApiInstanceId,
    greenApiToken
  },
  shiftHandover: {
    uploadDir: process.env.SHIFT_HANDOVER_UPLOAD_DIR ?? "/var/www/micinegoesti/uploads/shift-handover",
    uploadRetentionDays: intFromEnv("SHIFT_HANDOVER_UPLOAD_RETENTION_DAYS", 7),
    uploadMaxFiles: intFromEnv("SHIFT_HANDOVER_UPLOAD_MAX_FILES", 8),
    uploadMaxSize: intFromEnv("SHIFT_HANDOVER_UPLOAD_MAX_SIZE", 10 * 1024 * 1024),
    allowedMimes: (process.env.SHIFT_HANDOVER_ALLOWED_MIMES ?? "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    cleanupSecret: process.env.SHIFT_HANDOVER_CLEANUP_SECRET ?? "replace-with-secret"
  }
};
