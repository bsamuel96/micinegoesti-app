import { Router } from "express";
import { z } from "zod";
import { Role } from "../../constants.js";
import { asyncHandler } from "../../lib/http.js";
import { readRecentLogLines } from "../../lib/logger.js";
import { requireRoles } from "../../middleware/auth.js";

export const logsRouter = Router();

logsRouter.get(
  "/logs",
  requireRoles(Role.ADMIN),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        limit: z.coerce.number().int().min(1).max(1000).default(200)
      })
      .parse(req.query);
    const logs = await readRecentLogLines(input.limit);

    res.json(logs);
  })
);
