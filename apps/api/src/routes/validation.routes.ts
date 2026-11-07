import { Router } from "express";
import { resolveValidationIssueRequestSchema } from "@cargolens/shared";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { recordAudit } from "../services/auditService.js";
import { assertShipmentEditable, recomputeShipmentReadiness } from "../services/readinessService.js";
import { NotFoundError } from "../lib/errors.js";

export const validationRouter = Router();
validationRouter.use(requireAuth);

validationRouter.get(
  "/shipments/:id/validation",
  asyncHandler(async (req, res) => {
    const issues = await prisma.validationIssue.findMany({
      where: { shipmentId: req.params.id! },
      include: { resolvedBy: { select: { id: true, name: true } } },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    });
    res.json({ issues });
  }),
);

validationRouter.patch(
  "/validation/:issueId/resolve",
  asyncHandler(async (req, res) => {
    const body = resolveValidationIssueRequestSchema.parse(req.body);
    const issue = await prisma.validationIssue.findUnique({ where: { id: req.params.issueId! } });
    if (!issue) throw new NotFoundError("Validation issue not found");
    await assertShipmentEditable(issue.shipmentId);

    const updated = await prisma.validationIssue.update({
      where: { id: req.params.issueId! },
      data: { status: body.status, resolutionNote: body.resolutionNote, resolvedById: req.user!.id },
    });

    await recordAudit({
      userId: req.user!.id,
      shipmentId: issue.shipmentId,
      action: "VALIDATION_ISSUE_RESOLVED",
      entityType: "ValidationIssue",
      entityId: issue.id,
      previousValue: { status: issue.status },
      newValue: { status: body.status, resolutionNote: body.resolutionNote },
    });

    await recomputeShipmentReadiness(issue.shipmentId);
    res.json({ issue: updated });
  }),
);
