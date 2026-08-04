// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBrowserSessionId, getGameSessionId } from "./browserSession";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear()
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("persistent game sessions", () => {
  it("keeps the same game session for a logged-in user", () => {
    const first = getGameSessionId("user-1");
    expect(getGameSessionId("user-1")).toBe(first);
    expect(localStorage.getItem("mdn_game_session:user-1")).toBe(first);
  });

  it("keeps different users on the same browser in separate game sessions", () => {
    expect(getGameSessionId("user-1")).not.toBe(getGameSessionId("user-2"));
  });

  it("uses the persistent browser session for a guest", () => {
    expect(getGameSessionId()).toBe(getBrowserSessionId());
  });
});
