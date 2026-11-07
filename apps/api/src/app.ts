import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import pino from "pino";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.routes.js";
import { shipmentsRouter } from "./routes/shipments.routes.js";
import { documentsRouter } from "./routes/documents.routes.js";
import { extractionRouter } from "./routes/extraction.routes.js";
import { validationRouter } from "./routes/validation.routes.js";
import { reviewRouter } from "./routes/review.routes.js";
import { approvalRouter } from "./routes/approval.routes.js";
import { exportRouter } from "./routes/export.routes.js";
import { analyticsRouter } from "./routes/analytics.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

const logger = pino({ level: env.NODE_ENV === "development" ? "info" : "warn" });

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      // Never log request/response bodies: shipment documents are confidential.
      serializers: { req: (req) => ({ method: req.method, url: req.url }), res: (res) => ({ statusCode: res.statusCode }) },
    }),
  );

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRouter);
  app.use("/api/shipments", shipmentsRouter);
  app.use("/api", documentsRouter);
  app.use("/api", extractionRouter);
  app.use("/api", validationRouter);
  app.use("/api", reviewRouter);
  app.use("/api", approvalRouter);
  app.use("/api", exportRouter);
  app.use("/api/analytics", analyticsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
