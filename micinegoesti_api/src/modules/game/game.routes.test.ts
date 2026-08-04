import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "../../constants.js";
import { errorHandler } from "../../lib/http.js";
import type { AuthUser, AuthenticatedRequest } from "../../middleware/auth.js";
import { gameRouter } from "./game.routes.js";

const saveGameScoreWithReward = vi.hoisted(() => vi.fn());

vi.mock("../vouchers/vouchers.service.js", () => ({
  saveGameScoreWithReward
}));

function appForUser(user?: AuthUser) {
  const app = express();
  app.use(express.json());
  app.use((req: AuthenticatedRequest, _res, next) => {
    req.user = user;
    next();
  });
  app.use("/api", gameRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  saveGameScoreWithReward.mockReset();
});

describe("game score account identity", () => {
  it("rejects a zero score before attempting to save it", async () => {
    const response = await request(appForUser({
      id: "customer-1",
      phone: "+40740000000",
      name: "Tarzan Ceva",
      role: Role.CUSTOMER,
      isActive: true
    }))
      .post("/api/game-score")
      .send({ sessionId: "session-12345678", score: 0 });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Scorul trebuie să fie mai mare decât 0.");
    expect(saveGameScoreWithReward).not.toHaveBeenCalled();
  });

  it("returns a clear error when the player is not authenticated", async () => {
    const response = await request(appForUser())
      .post("/api/game-score")
      .send({ sessionId: "session-12345678", score: 42 });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Autentifică-te pentru a salva scorul.");
    expect(saveGameScoreWithReward).not.toHaveBeenCalled();
  });

  it("returns a clear error when the customer account has no name", async () => {
    const response = await request(appForUser({
      id: "customer-1",
      phone: "+40740000000",
      name: null,
      role: Role.CUSTOMER,
      isActive: true
    }))
      .post("/api/game-score")
      .send({ sessionId: "session-12345678", score: 42 });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Completează numele din cont înainte de a salva scorul.");
    expect(saveGameScoreWithReward).not.toHaveBeenCalled();
  });

  it("uses the account name and ignores a submitted player name", async () => {
    saveGameScoreWithReward.mockResolvedValueOnce({
      bestScore: 42,
      playerName: "Tarzan",
      isNewGlobalRecord: true
    });

    const response = await request(appForUser({
      id: "customer-1",
      phone: "+40740000000",
      name: "Tarzan Ceva",
      role: Role.CUSTOMER,
      isActive: true
    }))
      .post("/api/game-score")
      .send({
        sessionId: "session-12345678",
        score: 42,
        playerName: "HACK"
      });

    expect(response.status).toBe(200);
    expect(saveGameScoreWithReward).toHaveBeenCalledWith({
      sessionId: "session-12345678",
      userId: "customer-1",
      score: 42,
      playerName: "Tarzan Ceva"
    });
  });

  it("allows a named staff account to save a score", async () => {
    saveGameScoreWithReward.mockResolvedValueOnce({
      bestScore: 50,
      playerName: "Paula",
      isNewGlobalRecord: false
    });

    const response = await request(appForUser({
      id: "staff-1",
      phone: "+40740000001",
      name: "Paula Staff",
      role: Role.ADMIN,
      isActive: true
    }))
      .post("/api/game-score")
      .send({ sessionId: "session-12345678", score: 50 });

    expect(response.status).toBe(200);
    expect(saveGameScoreWithReward).toHaveBeenCalledWith({
      sessionId: "session-12345678",
      userId: "staff-1",
      score: 50,
      playerName: "Paula Staff"
    });
  });
});
