import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../lib/http.js";
import { authRouter } from "./auth.routes.js";

const from = vi.hoisted(() => vi.fn());

vi.mock("../../lib/supabase.js", () => ({
  getSupabase: () => ({ from })
}));

function testApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", authRouter);
  app.use(errorHandler);
  return app;
}

const sessionToken = "s".repeat(43);

beforeEach(() => {
  from.mockReset();
});

describe("long-lived authentication session", () => {
  it("renews the access token and extends an active session", async () => {
    const extendSession = vi.fn(async () => ({ error: null }));
    let sessionCalls = 0;
    from.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "admin-1",
                  phone: "+40740000000",
                  email: "admin@example.com",
                  name: "Admin",
                  role: "admin",
                  isActive: true
                },
                error: null
              })
            })
          })
        };
      }

      sessionCalls += 1;
      if (sessionCalls === 1) {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "session-1",
                  userId: "admin-1",
                  expiresAt: new Date(Date.now() + 60_000).toISOString(),
                  revokedAt: null
                },
                error: null
              })
            })
          })
        };
      }

      return {
        update: () => ({
          eq: () => ({
            eq: extendSession
          })
        })
      };
    });

    const response = await request(testApp())
      .post("/api/auth/refresh")
      .send({ sessionToken });

    expect(response.status).toBe(200);
    expect(response.body.sessionToken).toBe(sessionToken);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({ id: "admin-1", role: "admin", name: "Admin" });
    expect(extendSession).toHaveBeenCalled();
  });

  it("rejects an expired long-lived session", async () => {
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: "session-1",
              userId: "admin-1",
              expiresAt: new Date(Date.now() - 60_000).toISOString(),
              revokedAt: null
            },
            error: null
          })
        })
      })
    });

    const response = await request(testApp())
      .post("/api/auth/refresh")
      .send({ sessionToken });

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/Sesiunea nu mai este validă/);
  });
});
