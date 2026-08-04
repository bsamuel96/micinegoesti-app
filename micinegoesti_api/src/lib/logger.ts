import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { config } from "../config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const REDACTED = "[redacted]";
let logSupabaseClient: SupabaseClient | null = null;

function logDirectory() {
  return isAbsolute(config.logDir) ? config.logDir : resolve(process.cwd(), config.logDir);
}

function logFileName(date = new Date()) {
  return `${date.toISOString().slice(0, 10)}.jsonl`;
}

function logPath(date = new Date()) {
  return join(logDirectory(), logFileName(date));
}

function getLogSupabase() {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    throw new Error("Supabase log storage is selected but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.");
  }

  logSupabaseClient ??= createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return logSupabaseClient;
}

function redact(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      status: "status" in value ? value.status : undefined,
      details: "details" in value ? redact(value.details) : undefined
    };
  }

  if (Array.isArray(value)) return value.map(redact);

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((record, [key, item]) => {
      const lower = key.toLowerCase();
      record[key] =
        lower.includes("token") ||
        lower.includes("secret") ||
        lower.includes("password") ||
        lower.includes("authorization") ||
        lower === "code"
          ? REDACTED
          : redact(item);
      return record;
    }, {});
  }

  return value;
}

async function appendFileLog(entry: LogContext) {
  const dir = logDirectory();
  await mkdir(dir, { recursive: true });
  await appendFile(logPath(), `${JSON.stringify(redact(entry))}\n`, "utf8");
}

async function appendSupabaseLog(entry: LogContext) {
  const redactedEntry = redact(entry) as LogContext;
  const { level, event, timestamp: _timestamp, ...context } = redactedEntry;
  const { error } = await getLogSupabase().from("app_logs").insert({
    level: String(level ?? "info"),
    event: String(event ?? "log:event"),
    context
  });

  if (error) throw error;
}

async function append(entry: LogContext) {
  if (config.logStorage === "supabase") {
    await appendSupabaseLog(entry);
    return;
  }

  await appendFileLog(entry);
}

export function logEvent(level: LogLevel, event: string, context: LogContext = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context
  };

  const consoleMethod = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  consoleMethod(`[${event}]`, redact(context));
  void append(entry).catch((error) => {
    console.error("[logger:write-failed]", error);
  });
}

export function logInfo(event: string, context?: LogContext) {
  logEvent("info", event, context);
}

export function logWarn(event: string, context?: LogContext) {
  logEvent("warn", event, context);
}

export function logError(event: string, error: unknown, context: LogContext = {}) {
  logEvent("error", event, { ...context, error });
}

export async function readRecentLogLines(limit = 200) {
  if (config.logStorage === "supabase") {
    const { data, error } = await getLogSupabase()
      .from("app_logs")
      .select("created_at, level, event, context")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const lines = [...(data ?? [])]
      .reverse()
      .map((row) =>
        JSON.stringify({
          timestamp: row.created_at,
          level: row.level,
          event: row.event,
          ...(row.context && typeof row.context === "object" && !Array.isArray(row.context)
            ? (row.context as Record<string, unknown>)
            : { context: row.context })
        })
      );

    return {
      logDir: "supabase:public.app_logs",
      lines
    };
  }

  const dir = logDirectory();
  const files = (await readdir(dir).catch(() => []))
    .filter((file) => file.endsWith(".jsonl"))
    .sort()
    .reverse();
  const lines: string[] = [];

  for (const file of files) {
    const content = await readFile(join(dir, file), "utf8").catch(() => "");
    const fileLines = content.split("\n").filter(Boolean).reverse();
    lines.push(...fileLines);
    if (lines.length >= limit) break;
  }

  return {
    logDir: dir,
    lines: lines.slice(0, limit).reverse()
  };
}
