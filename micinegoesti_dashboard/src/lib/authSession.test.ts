// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { User } from "../api/types";
import {
  clearStoredAuthSession,
  isConfirmedInvalidSession,
  persistAuthSession,
  readStoredAuthSession
} from "./authSession";

const user: User = {
  id: "user-1",
  phone: "+40740000000",
  email: null,
  name: "Tarzan",
  role: "customer",
  isActive: true
};

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("stored authentication session", () => {
  it("restores both the token and user snapshot", () => {
    persistAuthSession("token-1", user, "session-token-1");
    expect(readStoredAuthSession()).toEqual({ token: "token-1", sessionToken: "session-token-1", user });
  });

  it("clears both stored values on an explicit logout", () => {
    persistAuthSession("token-1", user, "session-token-1");
    clearStoredAuthSession();
    expect(readStoredAuthSession()).toEqual({ token: null, sessionToken: null, user: null });
  });

  it("only treats a confirmed auth 401 as an invalid session", () => {
    expect(isConfirmedInvalidSession(new ApiError(401, "Invalid session"))).toBe(true);
    expect(isConfirmedInvalidSession(new ApiError(500, "Temporary failure"))).toBe(false);
    expect(isConfirmedInvalidSession(new TypeError("Network error"))).toBe(false);
  });
});
