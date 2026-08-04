import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../../lib/http.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { saveGameScoreWithReward } from "../vouchers/vouchers.service.js";
import {
  getCurrentGameScore,
  getGameLeaderboardPage,
  getPublicGameCampaignState
} from "./game-campaigns.service.js";

export const gameRouter = Router();

const sessionSchema = z.string().trim().min(8).max(160);

const saveScoreSchema = z.object({
  sessionId: sessionSchema,
  score: z.number().int().min(0).max(1_000_000)
});

gameRouter.get(
  "/game-campaign",
  asyncHandler(async (_req, res) => {
    res.json(await getPublicGameCampaignState());
  })
);

gameRouter.get(
  "/game-score/leaderboard",
  asyncHandler(async (req, res) => {
    const input = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(100),
      offset: z.coerce.number().int().min(0).default(0)
    }).parse(req.query);

    res.json(await getGameLeaderboardPage(input));
  })
);

gameRouter.get(
  "/game-score/:sessionId",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const sessionId = sessionSchema.parse(req.params.sessionId);
    res.json(await getCurrentGameScore({
      userId: req.user?.id ?? null,
      sessionId
    }));
  })
);

gameRouter.post(
  "/game-score",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = saveScoreSchema.parse(req.body);
    const user = req.user;

    if (input.score <= 0) {
      throw new HttpError(400, "Scorul trebuie să fie mai mare decât 0.");
    }

    if (!user) {
      throw new HttpError(401, "Autentifică-te pentru a salva scorul.");
    }

    const accountName = user.name?.trim();
    if (!accountName) {
      throw new HttpError(400, "Completează numele din cont înainte de a salva scorul.");
    }

    const result = await saveGameScoreWithReward({
      sessionId: input.sessionId,
      userId: user.id,
      score: input.score,
      playerName: accountName
    });

    res.json(result);
  })
);
