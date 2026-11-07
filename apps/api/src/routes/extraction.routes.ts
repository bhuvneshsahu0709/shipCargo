import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { processShipmentExtraction, revalidateShipment } from "../services/extractionService.js";
import { assertShipmentEditable, recomputeShipmentReadiness } from "../services/readinessService.js";

export const extractionRouter = Router();
extractionRouter.use(requireAuth);

extractionRouter.post(
  "/shipments/:id/process",
  asyncHandler(async (req, res) => {
    await assertShipmentEditable(req.params.id!);
    const result = await processShipmentExtraction(req.params.id!, req.user!.id);
    await recomputeShipmentReadiness(req.params.id!);
    res.json(result);
  }),
);

extractionRouter.get(
  "/shipments/:id/extraction",
  asyncHandler(async (req, res) => {
    const extractions = await prisma.extraction.findMany({
      where: { document: { shipmentId: req.params.id! } },
      include: { document: { select: { documentType: true, originalFilename: true, pageCount: true } } },
    });
    res.json({ extractions });
  }),
);

extractionRouter.post(
  "/shipments/:id/validate",
  asyncHandler(async (req, res) => {
    await revalidateShipment(req.params.id!);
    const status = await recomputeShipmentReadiness(req.params.id!);
    res.json({ status });
  }),
);
