import express, { Router } from "express";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { config } from "../../config.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { getSupabase } from "../../lib/supabase.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function hasFeedbackSubmittedCookie(cookieHeader?: string) {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .some((part) => part.startsWith("feedback_submitted="));
}

function findFeedbackDir() {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), "feedback"),
    resolve(process.cwd(), "../feedback"),
    resolve(moduleDir, "../../../../feedback"),
    resolve(moduleDir, "../../../../../feedback")
  ];

  return candidates.find((dir) => existsSync(resolve(dir, "index.php"))) ?? null;
}

function readFeedbackHtml(feedbackDir: string) {
  const raw = readFileSync(resolve(feedbackDir, "index.php"), "utf8");

  return raw
    .replace(/^\s*<\?php[\s\S]*?\?>\s*/i, "")
    .replace(/fetch\((['"])submit\.php\1\s*,/g, "fetch('/feedback/submit',")
    .trim();
}

const feedbackPayloadSchema = z.object({
  name: z.string().trim().max(120).optional().nullable(),
  employees: z.array(z.unknown()).default([]),
  general: z.record(z.unknown()).default({}),
  open: z.record(z.unknown()).default({}),
  stars: z.number().int().min(1).max(5)
});

export const feedbackFlowRouter = Router();

feedbackFlowRouter.use(["/feedback", "/feedback-flow"], (req, res, next) => {
  res.removeHeader("X-Frame-Options");
  const frameAncestors = [
    "'self'",
    config.clientUrl,
    "http://localhost:5173",
    "http://localhost:8080"
  ]
    .filter(Boolean)
    .join(" ");

  res.setHeader("Content-Security-Policy", `frame-ancestors ${frameAncestors}`);
  next();
});

feedbackFlowRouter.get(["/feedback", "/feedback/", "/feedback/index.php", "/feedback-flow", "/feedback-flow/", "/feedback-flow/index.php"], (req, res) => {
  const feedbackDir = findFeedbackDir();
  if (!feedbackDir) {
    res.status(500).send("Feedback flow is not available on this server.");
    return;
  }

  const html = readFeedbackHtml(feedbackDir);
  res.type("html").send(html);
});

feedbackFlowRouter.use(["/feedback/img", "/feedback-flow/img"], (req, res, next) => {
  const feedbackDir = findFeedbackDir();
  if (!feedbackDir) {
    res.status(500).send("Feedback assets are not available on this server.");
    return;
  }

  express.static(resolve(feedbackDir, "img"))(req, res, next);
});

feedbackFlowRouter.post(
  "/feedback/submit",
  asyncHandler(async (req, res) => {
    if (hasFeedbackSubmittedCookie(req.headers.cookie)) {
      res.status(429).json({
        status: "error",
        message: "Ai trimis deja un feedback astăzi. Te rugăm să revii mâine."
      });
      return;
    }

    const input = feedbackPayloadSchema.parse(req.body);
    const name = input.name && input.name.length ? input.name : "Anonim";

    const { error } = await getSupabase()
      .from("feedback")
      .insert({
        name,
        rating: input.stars,
        message: JSON.stringify({
          source: "legacy-feedback-flow",
          employees: input.employees,
          general: input.general,
          open: input.open
        })
      });
    if (error) throw new HttpError(500, "Nu am putut salva feedback-ul.", error);

    res.cookie("feedback_submitted", "1", {
      maxAge: ONE_DAY_MS,
      httpOnly: true,
      sameSite: "lax",
      secure: req.secure
    });

    res.status(200).json({ status: "success" });
  })
);

feedbackFlowRouter.post(
  "/feedback-flow/submit",
  asyncHandler(async (req, res) => {
    if (hasFeedbackSubmittedCookie(req.headers.cookie)) {
      res.status(429).json({
        status: "error",
        message: "Ai trimis deja un feedback astăzi. Te rugăm să revii mâine."
      });
      return;
    }

    const input = feedbackPayloadSchema.parse(req.body);
    const name = input.name && input.name.length ? input.name : "Anonim";

    const { error } = await getSupabase()
      .from("feedback")
      .insert({
        name,
        rating: input.stars,
        message: JSON.stringify({
          source: "legacy-feedback-flow",
          employees: input.employees,
          general: input.general,
          open: input.open
        })
      });
    if (error) throw new HttpError(500, "Nu am putut salva feedback-ul.", error);

    res.cookie("feedback_submitted", "1", {
      maxAge: ONE_DAY_MS,
      httpOnly: true,
      sameSite: "lax",
      secure: req.secure
    });

    res.status(200).json({ status: "success" });
  })
);
