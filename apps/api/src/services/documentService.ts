import crypto from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { ACCEPTED_MIME_TYPES, MAX_UPLOAD_BYTES, type DocumentType } from "@cargolens/shared";
import { prisma } from "../db/prisma.js";
import { storage } from "../lib/storage/index.js";
import { ValidationError } from "../lib/errors.js";
import { recordAudit } from "./auditService.js";
import { assertShipmentEditable } from "./readinessService.js";

export async function resolvePageCount(buffer: Buffer, mimeType: string): Promise<number> {
  if (mimeType !== "application/pdf") return 1;
  try {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch {
    return 1;
  }
}

function assertValidUpload(file: { mimetype: string; size: number }) {
  if (!ACCEPTED_MIME_TYPES.includes(file.mimetype as (typeof ACCEPTED_MIME_TYPES)[number])) {
    throw new ValidationError(`Unsupported file type: ${file.mimetype}. Accepted: PDF, JPG, PNG.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ValidationError(`File too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`);
  }
}

export async function uploadShipmentDocument(params: {
  shipmentId: string;
  documentType: DocumentType;
  file: { buffer: Buffer; mimetype: string; size: number; originalname: string };
  uploadedById: string;
}) {
  assertValidUpload(params.file);

  const contentHash = crypto.createHash("sha256").update(params.file.buffer).digest("hex");
  const existing = await prisma.document.findUnique({
    where: { shipmentId_documentType: { shipmentId: params.shipmentId, documentType: params.documentType } },
  });

  const isDuplicateContent = existing?.contentHash === contentHash;

  const pageCount = await resolvePageCount(params.file.buffer, params.file.mimetype);
  const storageKey = `${params.shipmentId}/${params.documentType}/${Date.now()}-${params.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await storage.put(storageKey, params.file.buffer, params.file.mimetype);

  const document = await prisma.$transaction(async (tx) => {
    if (existing) {
      await storage.remove(existing.storageKey).catch(() => undefined);
      await tx.extraction.deleteMany({ where: { documentId: existing.id } });
    }

    const saved = await tx.document.upsert({
      where: { shipmentId_documentType: { shipmentId: params.shipmentId, documentType: params.documentType } },
      create: {
        shipmentId: params.shipmentId,
        documentType: params.documentType,
        originalFilename: params.file.originalname,
        storageKey,
        contentHash,
        mimeType: params.file.mimetype,
        fileSize: params.file.size,
        pageCount,
        processingStatus: "PENDING",
        uploadedById: params.uploadedById,
      },
      update: {
        originalFilename: params.file.originalname,
        storageKey,
        contentHash,
        mimeType: params.file.mimetype,
        fileSize: params.file.size,
        pageCount,
        processingStatus: "PENDING",
        uploadedById: params.uploadedById,
      },
    });

    await tx.shipment.update({ where: { id: params.shipmentId }, data: { status: "DRAFT" } });
    return saved;
  });

  await recordAudit({
    userId: params.uploadedById,
    shipmentId: params.shipmentId,
    action: existing ? "DOCUMENT_REPLACED" : "DOCUMENT_UPLOADED",
    entityType: "Document",
    entityId: document.id,
    newValue: { documentType: params.documentType, originalFilename: params.file.originalname },
  });

  return { document, isDuplicateContent, wasReplaced: Boolean(existing) };
}

export async function deleteShipmentDocument(documentId: string, userId: string) {
  const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
  await assertShipmentEditable(document.shipmentId);
  await storage.remove(document.storageKey).catch(() => undefined);
  await prisma.document.delete({ where: { id: documentId } });
  await recordAudit({
    userId,
    shipmentId: document.shipmentId,
    action: "DOCUMENT_DELETED",
    entityType: "Document",
    entityId: documentId,
    previousValue: { documentType: document.documentType, originalFilename: document.originalFilename },
  });
}
