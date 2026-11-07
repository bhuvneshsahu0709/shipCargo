import type { ShipmentListQuery } from "@cargolens/shared";
import { prisma } from "../db/prisma.js";
import { ConflictError, NotFoundError } from "../lib/errors.js";

export async function listShipments(query: ShipmentListQuery) {
  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { shipmentNumber: { contains: query.search, mode: "insensitive" as const } },
            { supplier: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.shipment.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortDir },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        documents: { select: { documentType: true, processingStatus: true } },
        assignedExecutive: { select: { id: true, name: true } },
        validationIssues: { select: { status: true, severity: true } },
      },
    }),
    prisma.shipment.count({ where }),
  ]);

  return {
    items: items.map((shipment) => ({
      id: shipment.id,
      shipmentNumber: shipment.shipmentNumber,
      supplier: shipment.supplier,
      importer: shipment.importer,
      status: shipment.status,
      assignedExecutive: shipment.assignedExecutive,
      documentCompleteness: `${shipment.documents.length}/3`,
      openBlockingIssues: shipment.validationIssues.filter((i) => i.status === "OPEN" && i.severity === "CRITICAL").length,
      createdAt: shipment.createdAt,
      updatedAt: shipment.updatedAt,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function createShipment(params: { shipmentNumber: string; supplier: string; importer: string; assignedExecutiveId: string }) {
  const existing = await prisma.shipment.findUnique({ where: { shipmentNumber: params.shipmentNumber } });
  if (existing) {
    throw new ConflictError(`Shipment ${params.shipmentNumber} already exists`);
  }
  return prisma.shipment.create({
    data: {
      shipmentNumber: params.shipmentNumber,
      supplier: params.supplier,
      importer: params.importer,
      assignedExecutiveId: params.assignedExecutiveId,
      status: "DRAFT",
    },
  });
}

export async function getShipmentOrThrow(id: string) {
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: {
      documents: { orderBy: { createdAt: "asc" } },
      assignedExecutive: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!shipment) throw new NotFoundError(`Shipment ${id} not found`);
  return shipment;
}

export async function getShipmentDetail(id: string) {
  const shipment = await getShipmentOrThrow(id);
  const [extractedFields, lineItems, validationIssues, approvals, auditLogs] = await Promise.all([
    prisma.extractedField.findMany({ where: { shipmentId: id }, include: { sourceDocument: { select: { documentType: true } } } }),
    prisma.lineItem.findMany({ where: { shipmentId: id }, orderBy: { lineIndex: "asc" } }),
    prisma.validationIssue.findMany({ where: { shipmentId: id }, orderBy: [{ severity: "desc" }, { createdAt: "desc" }] }),
    prisma.approval.findMany({ where: { shipmentId: id }, include: { manager: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.auditLog.findMany({ where: { shipmentId: id }, include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);

  return { shipment, extractedFields, lineItems, validationIssues, approvals, auditLogs };
}
