import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getAnalyticsAccuracy, getAnalyticsOverview } from "../services/analyticsService.js";

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

analyticsRouter.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    res.json(await getAnalyticsOverview());
  }),
);

analyticsRouter.get(
  "/accuracy",
  asyncHandler(async (_req, res) => {
    res.json(await getAnalyticsAccuracy());
  }),
);
