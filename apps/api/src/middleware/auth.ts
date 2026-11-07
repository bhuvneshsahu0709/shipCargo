import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { env } from "../config/env.js";
import { verifySession } from "../lib/jwt.js";
import { prisma } from "../db/prisma.js";
import { UnauthorizedError, ForbiddenError } from "../lib/errors.js";

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token) {
    next(new UnauthorizedError());
    return;
  }

  try {
    const payload = verifySession(token);
    // The JWT can be validly signed for a user that no longer exists (e.g. the dev database was
    // reseeded after the session was issued) — check it still resolves to a real row rather than
    // letting a stale id reach a foreign-key write deep in business logic as an unhandled 500.
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, name: true, email: true, role: true } });
    if (!user) {
      next(new UnauthorizedError("Session no longer valid — please log in again"));
      return;
    }
    req.user = user;
    next();
  } catch {
    next(new UnauthorizedError("Session expired or invalid"));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError(`This action requires role: ${roles.join(" or ")}`));
      return;
    }
    next();
  };
}
