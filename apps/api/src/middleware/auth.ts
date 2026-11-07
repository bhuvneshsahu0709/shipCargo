import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { env } from "../config/env.js";
import { verifySession } from "../lib/jwt.js";
import { UnauthorizedError, ForbiddenError } from "../lib/errors.js";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token) {
    next(new UnauthorizedError());
    return;
  }

  try {
    const payload = verifySession(token);
    req.user = { id: payload.sub, email: payload.email, name: payload.name, role: payload.role };
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
