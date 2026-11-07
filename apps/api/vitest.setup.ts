import dotenv from "dotenv";
import path from "node:path";

// Loaded before any test file's imports resolve `src/config/env.ts`.
// dotenv does not override already-set vars, so this takes priority over `.env`.
dotenv.config({ path: path.resolve(import.meta.dirname, ".env.test") });
