import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { buildShipmentExport } from "../services/exportService.js";
import { recordAudit } from "../services/auditService.js";

export const exportRouter = Router();
exportRouter.use(requireAuth);

exportRouter.get(
  "/shipments/:id/export",
  asyncHandler(async (req, res) => {
    const buffer = await buildShipmentExport(req.params.id!);
    const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: req.params.id! } });

    await recordAudit({ userId: req.user!.id, shipmentId: shipment.id, action: "SHIPMENT_EXPORTED", entityType: "Shipment", entityId: shipment.id });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${shipment.shipmentNumber}-export.xlsx"`);
    res.send(buffer);
  }),
);
