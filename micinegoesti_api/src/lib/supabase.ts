import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import { HttpError } from "./http.js";

let client: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  return Boolean(config.supabase.url && config.supabase.serviceRoleKey);
}

export function getSupabase() {
  if (!isSupabaseConfigured()) {
    throw new HttpError(503, "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  if (config.supabase.serviceRoleKey.startsWith("sb_publishable_")) {
    throw new HttpError(503, "SUPABASE_SERVICE_ROLE_KEY must be the secret service-role key, not the publishable key.");
  }

  client ??= createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return client;
}

export function assertSupabase<T>(result: { data: T; error: unknown }, message = "Supabase request failed.") {
  if (result.error) {
    throw new HttpError(500, message, result.error);
  }

  return result.data;
}

export function maybeSupabase<T>(result: { data: T; error: unknown }, message = "Supabase request failed.") {
  if (result.error) {
    throw new HttpError(500, message, result.error);
  }

  return result.data;
}
