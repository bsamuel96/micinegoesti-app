import { Router } from "express";
import { z } from "zod";
import { Role } from "../../constants.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { getSupabase } from "../../lib/supabase.js";
import { requireRoles } from "../../middleware/auth.js";

export const feedbackRouter = Router();

feedbackRouter.post(
  "/feedback",
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        name: z.string().min(2),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        rating: z.number().int().min(1).max(5).optional(),
        message: z.string().min(5)
      })
      .parse(req.body);

    const { data: feedback, error } = await getSupabase().from("feedback").insert(input).select("*").single();
    if (error) throw new HttpError(500, "Nu am putut salva feedback-ul.", error);
    res.status(201).json({ feedback });
  })
);

feedbackRouter.get(
  "/feedback",
  requireRoles(Role.ADMIN),
  asyncHandler(async (_req, res) => {
    const { data: feedback, error } = await getSupabase().from("feedback").select("*").order("created_at", { ascending: false });
    if (error) throw new HttpError(500, "Nu am putut citi feedback-ul.", error);
    res.json({ feedback });
  })
);
