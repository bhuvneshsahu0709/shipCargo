import { z } from "zod";
import { USER_ROLES } from "../enums.js";

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(200),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(USER_ROLES),
});
export type AuthUser = z.infer<typeof authUserSchema>;
