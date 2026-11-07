import { Router } from "express";
import rateLimit from "express-rate-limit";
import { loginRequestSchema } from "@cargolens/shared";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { verifyPassword } from "../lib/password.js";
import { signSession } from "../lib/jwt.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { UnauthorizedError } from "../lib/errors.js";

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  maxAge: 8 * 60 * 60 * 1000,
};

authRouter.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const body = loginRequestSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw new UnauthorizedError("Invalid email or password");

    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) throw new UnauthorizedError("Invalid email or password");

    const token = signSession({ sub: user.id, email: user.email, name: user.name, role: user.role });
    res.cookie(env.COOKIE_NAME, token, cookieOptions);
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }),
);

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(env.COOKIE_NAME);
  res.status(204).send();
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
