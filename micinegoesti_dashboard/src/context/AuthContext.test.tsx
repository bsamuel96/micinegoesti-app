// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../api/client";
import type { User } from "../api/types";
import { persistAuthSession, readStoredAuthSession } from "../lib/authSession";
import { AuthProvider, useAuth } from "./AuthContext";

const savedUser: User = {
  id: "admin-1",
  phone: "+40740000000",
  email: "admin@example.com",
  name: "Admin",
  role: "admin",
  isActive: true
};

function AuthProbe() {
  const { user, token, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{loading ? "loading" : "ready"}</span>
      <span data-testid="user">{user?.name ?? "guest"}</span>
      <span data-testid="token">{token ?? "none"}</span>
    </div>
  );
}

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AuthProvider refresh persistence", () => {
  it("keeps the saved login when refresh fails temporarily", async () => {
    persistAuthSession("saved-token", savedUser, "saved-session-token");
    vi.spyOn(api, "me").mockRejectedValueOnce(new ApiError(500, "Temporary server failure"));

    render(<AuthProvider><AuthProbe /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("ready"));
    expect(screen.getByTestId("user").textContent).toBe("Admin");
    expect(screen.getByTestId("token").textContent).toBe("saved-token");
    expect(readStoredAuthSession()).toEqual({
      token: "saved-token",
      sessionToken: "saved-session-token",
      user: savedUser
    });
  });

  it("clears the saved login only after auth/me confirms a 401", async () => {
    persistAuthSession("expired-token", savedUser);
    vi.spyOn(api, "me").mockRejectedValueOnce(new ApiError(401, "Session expired"));

    render(<AuthProvider><AuthProbe /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("ready"));
    expect(screen.getByTestId("user").textContent).toBe("guest");
    expect(screen.getByTestId("token").textContent).toBe("none");
    expect(readStoredAuthSession()).toEqual({ token: null, sessionToken: null, user: null });
  });

  it("renews an expired access token from the saved long-lived session", async () => {
    persistAuthSession("expired-token", savedUser, "saved-session-token");
    vi.spyOn(api, "me").mockRejectedValueOnce(new ApiError(401, "Access token expired"));
    vi.spyOn(api, "refreshSession").mockResolvedValueOnce({
      token: "renewed-token",
      sessionToken: "saved-session-token",
      user: { ...savedUser, name: "Admin actualizat" }
    });

    render(<AuthProvider><AuthProbe /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("ready"));
    expect(api.refreshSession).toHaveBeenCalledWith("saved-session-token");
    expect(screen.getByTestId("user").textContent).toBe("Admin actualizat");
    expect(screen.getByTestId("token").textContent).toBe("renewed-token");
    expect(readStoredAuthSession()).toEqual({
      token: "renewed-token",
      sessionToken: "saved-session-token",
      user: { ...savedUser, name: "Admin actualizat" }
    });
  });
});
