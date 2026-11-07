import type { ApprovalRequest } from "@cargolens/shared";
import { prisma } from "../db/prisma.js";
import { ConflictError, ForbiddenError } from "../lib/errors.js";
import { recordAudit } from "./auditService.js";

export async function decideApproval(params: { shipmentId: string; managerId: string; request: ApprovalRequest }) {
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: params.shipmentId } });

  if (shipment.assignedExecutiveId === params.managerId) {
    throw new ForbiddenError("You cannot approve a shipment you are the assigned executive for.");
  }

  if (params.request.decision === "APPROVED") {
    if (shipment.status !== "READY_FOR_APPROVAL") {
      throw new ConflictError("Shipment is not ready for approval. Resolve outstanding validation issues and verify all fields first.");
    }
    const openCritical = await prisma.validationIssue.count({ where: { shipmentId: params.shipmentId, status: "OPEN", severity: "CRITICAL" } });
    if (openCritical > 0) {
      throw new ConflictError(`${openCritical} critical validation issue(s) are still open.`);
    }
  }

  const approval = await prisma.approval.create({
    data: {
      shipmentId: params.shipmentId,
      managerId: params.managerId,
      decision: params.request.decision,
      comments: params.request.comments,
    },
  });

  await prisma.shipment.update({
    where: { id: params.shipmentId },
    data:
      params.request.decision === "APPROVED"
        ? { status: "APPROVED", approvedById: params.managerId }
        : { status: "NEEDS_REVIEW", approvedById: null },
  });

  await recordAudit({
    userId: params.managerId,
    shipmentId: params.shipmentId,
    action: params.request.decision === "APPROVED" ? "SHIPMENT_APPROVED" : "SHIPMENT_REJECTED",
    entityType: "Shipment",
    entityId: params.shipmentId,
    newValue: { comments: params.request.comments },
  });

  return approval;
}
