import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logError, logWarn } from "./logger.js";

export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, "Endpoint not found."));
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (error instanceof HttpError) {
    logWarn("http:error", {
      method: req.method,
      path: req.originalUrl,
      status: error.status,
      message: error.message,
      details: error.details
    });
    res.status(error.status).json({ message: error.message, details: error.details });
    return;
  }

  if (error instanceof ZodError) {
    logWarn("http:error", {
      method: req.method,
      path: req.originalUrl,
      status: 400,
      message: "Invalid request body or parameters.",
      details: error.flatten()
    });
    res.status(400).json({ message: "Cererea nu este validă.", details: error.flatten() });
    return;
  }

  logError("http:unhandled-error", error, {
    method: req.method,
    path: req.originalUrl
  });
  res.status(500).json({ message: "Internal server error." });
}
