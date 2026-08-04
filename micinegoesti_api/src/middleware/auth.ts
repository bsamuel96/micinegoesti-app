import type { NextFunction, Request, Response } from "express";
import type { Role } from "../constants.js";
import { HttpError } from "../lib/http.js";
import { verifyAccessToken } from "../lib/auth.js";
import { logWarn } from "../lib/logger.js";
import { getSupabase } from "../lib/supabase.js";

export type AuthUser = {
  id: string;
  phone: string;
  email?: string | null;
  name?: string | null;
  role: Role | string;
  isActive: boolean;
};

export type AuthenticatedRequest = Request & {
  user?: AuthUser;
};

function tokenFromRequest(req: Request) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

export async function attachUser(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const token = tokenFromRequest(req);
  if (!token) {
    next();
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    const { data: user, error } = await getSupabase()
      .from("users")
      .select('id, phone, email, name, role, "isActive"')
      .eq("id", payload.sub)
      .maybeSingle();

    if (error) {
      logWarn("auth:user-lookup-failed", {
        path: req.originalUrl,
        code: error.code,
        message: error.message
      });
    } else if (user?.isActive) {
      req.user = user as AuthUser;
    } else {
      logWarn("auth:user-not-active", {
        path: req.originalUrl,
        userId: payload.sub
      });
    }
  } catch (error) {
    // Invalid optional token should not break public endpoints.
    logWarn("auth:token-rejected", {
      path: req.originalUrl,
      reason: error instanceof Error ? error.name : "UnknownTokenError"
    });
  }

  next();
}

export function requireAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  if (!req.user) {
    logWarn("auth:required", {
      path: req.originalUrl,
      bearerPresent: Boolean(tokenFromRequest(req))
    });
    next(new HttpError(401, "Sesiunea nu mai este validă. Autentifică-te din nou."));
    return;
  }

  next();
}

export function requireRoles(...roles: Role[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      logWarn("auth:required", {
        path: req.originalUrl,
        bearerPresent: Boolean(tokenFromRequest(req)),
        requiredRoles: roles
      });
      next(new HttpError(401, "Sesiunea nu mai este validă. Autentifică-te din nou."));
      return;
    }

    if (!roles.includes(req.user.role as Role)) {
      next(new HttpError(403, "You do not have permission for this action."));
      return;
    }

    next();
  };
}
