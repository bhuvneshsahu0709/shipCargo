import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { decideApproval } from "../services/approvalService.js";

export const approvalRouter = Router();
approvalRouter.use(requireAuth);

const commentsSchema = z.object({ comments: z.string().max(2000).optional() });

approvalRouter.post(
  "/shipments/:id/approve",
  requireRole("MANAGER"),
  asyncHandler(async (req, res) => {
    const body = commentsSchema.parse(req.body);
    const approval = await decideApproval({ shipmentId: req.params.id!, managerId: req.user!.id, request: { decision: "APPROVED", comments: body.comments } });
    res.json({ approval });
  }),
);

approvalRouter.post(
  "/shipments/:id/request-changes",
  requireRole("MANAGER"),
  asyncHandler(async (req, res) => {
    const body = commentsSchema.parse(req.body);
    const approval = await decideApproval({ shipmentId: req.params.id!, managerId: req.user!.id, request: { decision: "REJECTED", comments: body.comments } });
    res.json({ approval });
  }),
);
