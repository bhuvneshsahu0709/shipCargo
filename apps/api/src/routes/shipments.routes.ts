import { Router } from "express";
import { createShipmentRequestSchema, shipmentListQuerySchema } from "@cargolens/shared";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { createShipment, getShipmentDetail, listShipments } from "../services/shipmentService.js";
import { recordAudit } from "../services/auditService.js";

export const shipmentsRouter = Router();
shipmentsRouter.use(requireAuth);

shipmentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = shipmentListQuerySchema.parse(req.query);
    const result = await listShipments(query);
    res.json(result);
  }),
);

shipmentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createShipmentRequestSchema.parse(req.body);
    const shipment = await createShipment({ ...body, assignedExecutiveId: req.user!.id });
    await recordAudit({ userId: req.user!.id, shipmentId: shipment.id, action: "SHIPMENT_CREATED", entityType: "Shipment", entityId: shipment.id, newValue: body });
    res.status(201).json({ shipment });
  }),
);

shipmentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const detail = await getShipmentDetail(req.params.id!);
    res.json(detail);
  }),
);
