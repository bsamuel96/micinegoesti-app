import { ApiError } from "../api/client";
import type { User } from "../api/types";

const AUTH_TOKEN_KEY = "mdn_token";
const AUTH_USER_KEY = "mdn_auth_user_v1";
const AUTH_SESSION_TOKEN_KEY = "mdn_session_token_v1";

function isStoredUser(value: unknown): value is User {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<User>;
  return (
    typeof user.id === "string" &&
    typeof user.phone === "string" &&
    typeof user.role === "string" &&
    typeof user.isActive === "boolean"
  );
}

export function readStoredAuthSession() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) return { token: null, sessionToken: null, user: null };

  try {
    const parsed = JSON.parse(localStorage.getItem(AUTH_USER_KEY) ?? "null");
    return {
      token,
      sessionToken: localStorage.getItem(AUTH_SESSION_TOKEN_KEY),
      user: isStoredUser(parsed) ? parsed : null
    };
  } catch {
    return { token, sessionToken: localStorage.getItem(AUTH_SESSION_TOKEN_KEY), user: null };
  }
}

export function persistAuthSession(token: string, user: User, sessionToken?: string | null) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  if (sessionToken) localStorage.setItem(AUTH_SESSION_TOKEN_KEY, sessionToken);
  else localStorage.removeItem(AUTH_SESSION_TOKEN_KEY);
}

export function clearStoredAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_SESSION_TOKEN_KEY);
}

export function isConfirmedInvalidSession(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}
