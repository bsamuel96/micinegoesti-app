const SESSION_KEY = "mdn_browser_session";
const LEGACY_CART_SESSION_KEY = "mdn_cart_session";
const USER_GAME_SESSION_PREFIX = "mdn_game_session:";

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getBrowserSessionId() {
  const existing = localStorage.getItem(SESSION_KEY) || localStorage.getItem(LEGACY_CART_SESSION_KEY);
  if (existing) {
    localStorage.setItem(SESSION_KEY, existing);
    localStorage.removeItem(LEGACY_CART_SESSION_KEY);
    return existing;
  }

  const sessionId = createSessionId();
  localStorage.setItem(SESSION_KEY, sessionId);
  return sessionId;
}

export function getGameSessionId(userId?: string | null) {
  if (!userId) return getBrowserSessionId();

  const storageKey = `${USER_GAME_SESSION_PREFIX}${userId}`;
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;

  const sessionId = createSessionId();
  localStorage.setItem(storageKey, sessionId);
  return sessionId;
}
