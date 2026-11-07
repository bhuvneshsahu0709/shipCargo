import { prisma } from "../db/prisma.js";
import { ConflictError } from "../lib/errors.js";

export async function assertShipmentEditable(shipmentId: string) {
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId }, select: { status: true } });
  if (shipment.status === "APPROVED") {
    throw new ConflictError("This shipment is approved and locked — fields and validation issues can no longer be changed.");
  }
}

export async function recomputeShipmentReadiness(shipmentId: string) {
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  if (shipment.status === "APPROVED" || shipment.status === "DRAFT" || shipment.status === "PROCESSING") {
    return shipment.status;
  }

  const [openCritical, unverifiedCount] = await Promise.all([
    prisma.validationIssue.count({ where: { shipmentId, status: "OPEN", severity: "CRITICAL" } }),
    prisma.extractedField.count({ where: { shipmentId, verificationStatus: "UNVERIFIED" } }),
  ]);

  const isReady = openCritical === 0 && unverifiedCount === 0;
  const nextStatus = isReady ? "READY_FOR_APPROVAL" : "NEEDS_REVIEW";

  if (nextStatus !== shipment.status) {
    await prisma.shipment.update({ where: { id: shipmentId }, data: { status: nextStatus } });
  }
  return nextStatus;
}
