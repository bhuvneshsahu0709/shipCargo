import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export type SessionPayload = {
  sub: string;
  email: string;
  name: string;
  role: "EXECUTIVE" | "MANAGER";
};

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] });
}

export function verifySession(token: string): SessionPayload {
  return jwt.verify(token, env.JWT_SECRET) as SessionPayload;
}
