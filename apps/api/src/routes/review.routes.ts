import { Router } from "express";
import { correctFieldRequestSchema, verifyFieldRequestSchema } from "@cargolens/shared";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { recordAudit } from "../services/auditService.js";
import { assertShipmentEditable, recomputeShipmentReadiness } from "../services/readinessService.js";
import { NotFoundError } from "../lib/errors.js";

export const reviewRouter = Router();
reviewRouter.use(requireAuth);

reviewRouter.patch(
  "/shipments/:id/fields/:fieldId",
  asyncHandler(async (req, res) => {
    await assertShipmentEditable(req.params.id!);
    const body = correctFieldRequestSchema.parse(req.body);
    const field = await prisma.extractedField.findUnique({ where: { id: req.params.fieldId! } });
    if (!field || field.shipmentId !== req.params.id!) throw new NotFoundError("Field not found on this shipment");

    const updated = await prisma.extractedField.update({
      where: { id: field.id },
      data: {
        value: body.value,
        correctionNote: body.note ?? null,
        verificationStatus: body.value === null ? "MISSING" : "CORRECTED",
      },
    });

    await recordAudit({
      userId: req.user!.id,
      shipmentId: req.params.id!,
      action: "FIELD_CORRECTED",
      entityType: "ExtractedField",
      entityId: field.id,
      previousValue: { value: field.value },
      newValue: { value: body.value, note: body.note },
    });

    await recomputeShipmentReadiness(req.params.id!);
    res.json({ field: updated });
  }),
);

reviewRouter.post(
  "/shipments/:id/fields/:fieldId/verify",
  asyncHandler(async (req, res) => {
    await assertShipmentEditable(req.params.id!);
    const body = verifyFieldRequestSchema.parse(req.body);
    const field = await prisma.extractedField.findUnique({ where: { id: req.params.fieldId! } });
    if (!field || field.shipmentId !== req.params.id!) throw new NotFoundError("Field not found on this shipment");

    const nextStatus = field.verificationStatus === "CORRECTED" ? "CORRECTED" : body.verified ? "VERIFIED" : "UNVERIFIED";

    const updated = await prisma.extractedField.update({ where: { id: field.id }, data: { verificationStatus: nextStatus } });

    await recordAudit({
      userId: req.user!.id,
      shipmentId: req.params.id!,
      action: body.verified ? "FIELD_VERIFIED" : "FIELD_UNVERIFIED",
      entityType: "ExtractedField",
      entityId: field.id,
      previousValue: { verificationStatus: field.verificationStatus },
      newValue: { verificationStatus: nextStatus },
    });

    await recomputeShipmentReadiness(req.params.id!);
    res.json({ field: updated });
  }),
);
