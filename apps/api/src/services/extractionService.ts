import {
  PACKAGING_FIELD_NAMES,
  SHIPMENT_FIELD_NAMES,
  isArrayValueField,
  type DocumentExtractionResult,
  type DocumentType,
} from "@cargolens/shared";
import { prisma } from "../db/prisma.js";
import { storage } from "../lib/storage/index.js";
import { extractionProvider, ExtractionProviderError } from "../lib/ai/index.js";
import { ValidationError } from "../lib/errors.js";
import { runValidationEngine, type ValidationInput } from "./validationEngine.js";
import { recordAudit } from "./auditService.js";

const REQUIRED_DOCUMENT_TYPES: DocumentType[] = ["INVOICE", "PACKING_LIST", "BILL_OF_LADING"];

function serializeFieldValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

async function extractOneDocument(documentType: DocumentType, buffer: Buffer, mimeType: string, shipment: { shipmentNumber: string; supplier: string; importer: string }, originalFilename: string) {
  const input = { documentType, fileBuffer: buffer, mimeType, shipmentNumber: shipment.shipmentNumber, supplier: shipment.supplier, importer: shipment.importer, originalFilename };
  switch (documentType) {
    case "INVOICE":
      return extractionProvider.extractInvoice(input);
    case "PACKING_LIST":
      return extractionProvider.extractPackingList(input);
    case "BILL_OF_LADING":
      return extractionProvider.extractBillOfLading(input);
  }
}

export async function processShipmentExtraction(shipmentId: string, userId: string) {
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { documents: true } });

  const byType = new Map(shipment.documents.map((d) => [d.documentType, d]));
  const missing = REQUIRED_DOCUMENT_TYPES.filter((t) => !byType.has(t));
  if (missing.length > 0) {
    throw new ValidationError(`Cannot process: missing documents (${missing.join(", ")}). All three documents are required.`);
  }

  await prisma.shipment.update({ where: { id: shipmentId }, data: { status: "PROCESSING" } });

  const results: Partial<Record<DocumentType, DocumentExtractionResult>> = {};

  for (const documentType of REQUIRED_DOCUMENT_TYPES) {
    const doc = byType.get(documentType)!;
    await prisma.document.update({ where: { id: doc.id }, data: { processingStatus: "PROCESSING" } });

    try {
      const buffer = await storage.get(doc.storageKey);
      const extraction = await extractOneDocument(documentType, buffer, doc.mimeType, shipment, doc.originalFilename);
      results[documentType] = extraction;

      await prisma.extraction.upsert({
        where: { documentId: doc.id },
        create: {
          documentId: doc.id,
          provider: extraction.provider,
          model: extraction.model,
          promptVersion: extraction.promptVersion,
          rawResponse: extraction as object,
          structuredResponse: extraction as object,
          processingStatus: "COMPLETED",
        },
        update: {
          provider: extraction.provider,
          model: extraction.model,
          promptVersion: extraction.promptVersion,
          rawResponse: extraction as object,
          structuredResponse: extraction as object,
          processingStatus: "COMPLETED",
          errorMessage: null,
        },
      });
      await prisma.document.update({ where: { id: doc.id }, data: { processingStatus: "COMPLETED", pageCount: extraction.pageCount } });
    } catch (err) {
      const message = err instanceof ExtractionProviderError ? `${err.classification}: ${err.message}` : String(err);
      await prisma.document.update({ where: { id: doc.id }, data: { processingStatus: "FAILED" } });
      await prisma.extraction.upsert({
        where: { documentId: doc.id },
        create: {
          documentId: doc.id,
          provider: extractionProvider.name,
          model: extractionProvider.model,
          promptVersion: extractionProvider.promptVersion,
          rawResponse: {},
          structuredResponse: {},
          processingStatus: "FAILED",
          errorMessage: message,
        },
        update: { processingStatus: "FAILED", errorMessage: message },
      });
    }
  }

  await mergeExtractedFields(shipmentId, results, byType);
  await mergeLineItems(shipmentId, results);
  await refreshValidationIssues(shipmentId, results);

  const anySucceeded = Object.keys(results).length > 0;
  await prisma.shipment.update({ where: { id: shipmentId }, data: { status: anySucceeded ? "NEEDS_REVIEW" : "DRAFT" } });

  await recordAudit({
    userId,
    shipmentId,
    action: "EXTRACTION_RUN",
    entityType: "Shipment",
    entityId: shipmentId,
    newValue: { documentsProcessed: Object.keys(results) },
  });

  return { processed: Object.keys(results) as DocumentType[], failed: REQUIRED_DOCUMENT_TYPES.filter((t) => !results[t]) };
}

const DOC_PRIORITY: DocumentType[] = ["INVOICE", "PACKING_LIST", "BILL_OF_LADING"];

async function mergeExtractedFields(
  shipmentId: string,
  results: Partial<Record<DocumentType, DocumentExtractionResult>>,
  byType: Map<DocumentType, { id: string }>,
) {
  const existing = await prisma.extractedField.findMany({ where: { shipmentId } });
  const existingByName = new Map(existing.map((f) => [f.fieldName, f]));

  type Candidate = { value: unknown; confidence: number | null; sourceDocument: DocumentType | null; evidence: string | null; pageNumber: number | null };

  function best(fieldName: string, candidates: Candidate[]): Candidate | null {
    const nonNull = candidates.filter((c) => c.value !== null && c.value !== undefined);
    if (nonNull.length === 0) return candidates[0] ?? null;
    nonNull.sort((a, b) => {
      const confDiff = (b.confidence ?? 0) - (a.confidence ?? 0);
      if (Math.abs(confDiff) > 0.001) return confDiff;
      return DOC_PRIORITY.indexOf(a.sourceDocument ?? "INVOICE") - DOC_PRIORITY.indexOf(b.sourceDocument ?? "INVOICE");
    });
    return nonNull[0]!;
  }

  const fieldEntries: [string, Candidate[]][] = [];
  for (const name of SHIPMENT_FIELD_NAMES) {
    fieldEntries.push([
      name,
      DOC_PRIORITY.filter((t) => results[t]).map((t) => {
        const f = results[t]!.shipmentFields[name];
        return f ? { ...f, sourceDocument: f.sourceDocument ?? t } : { value: null, confidence: null, sourceDocument: t, evidence: null, pageNumber: null };
      }),
    ]);
  }
  for (const name of PACKAGING_FIELD_NAMES) {
    fieldEntries.push([
      `packaging.${name}`,
      DOC_PRIORITY.filter((t) => results[t]).map((t) => {
        const f = results[t]!.packaging[name];
        return f ? { ...f, sourceDocument: f.sourceDocument ?? t } : { value: null, confidence: null, sourceDocument: t, evidence: null, pageNumber: null };
      }),
    ]);
  }

  for (const [fieldName, candidates] of fieldEntries) {
    const chosen = best(fieldName, candidates);
    if (!chosen) continue;
    const existingField = existingByName.get(fieldName);
    const serialized = serializeFieldValue(chosen.value);
    const sourceDocumentId = chosen.sourceDocument ? byType.get(chosen.sourceDocument)?.id : undefined;

    const humanOwnsValue = existingField && (existingField.verificationStatus === "CORRECTED" || existingField.verificationStatus === "VERIFIED");

    await prisma.extractedField.upsert({
      where: { shipmentId_fieldName: { shipmentId, fieldName } },
      create: {
        shipmentId,
        fieldName,
        value: serialized,
        originalValue: serialized,
        confidence: chosen.confidence,
        sourceDocumentId,
        evidence: chosen.evidence,
        pageNumber: chosen.pageNumber,
        verificationStatus: serialized === null ? "MISSING" : "UNVERIFIED",
      },
      update: {
        originalValue: serialized,
        confidence: chosen.confidence,
        sourceDocumentId,
        evidence: chosen.evidence,
        pageNumber: chosen.pageNumber,
        ...(humanOwnsValue
          ? {}
          : { value: serialized, verificationStatus: serialized === null ? "MISSING" : "UNVERIFIED" }),
      },
    });
  }
}

async function mergeLineItems(shipmentId: string, results: Partial<Record<DocumentType, DocumentExtractionResult>>) {
  const source = results.INVOICE ?? results.PACKING_LIST;
  const sourceDocumentType: DocumentType | null = results.INVOICE ? "INVOICE" : results.PACKING_LIST ? "PACKING_LIST" : null;

  const existing = await prisma.lineItem.findMany({ where: { shipmentId } });
  const existingByIndex = new Map(existing.map((li) => [li.lineIndex, li]));
  const humanOwned = (idx: number) => {
    const row = existingByIndex.get(idx);
    return row ? row.verificationStatus === "CORRECTED" || row.verificationStatus === "VERIFIED" : false;
  };

  const incomingIndices = new Set(source?.lineItems.map((_, idx) => idx) ?? []);

  // Never delete a line a human has already corrected or verified, even if a re-extraction
  // returns fewer rows — the same principle as ExtractedField's merge in processShipmentExtraction.
  const toDelete = existing.filter((li) => !incomingIndices.has(li.lineIndex) && !humanOwned(li.lineIndex));
  if (toDelete.length > 0) {
    await prisma.lineItem.deleteMany({ where: { id: { in: toDelete.map((li) => li.id) } } });
  }

  if (!source) return;

  for (const [index, item] of source.lineItems.entries()) {
    if (humanOwned(index)) continue;

    const confidences = [item.description, item.hsnCode, item.quantity, item.unit, item.unitPrice, item.lineTotal]
      .map((f) => f.confidence)
      .filter((c): c is number => typeof c === "number");
    const confidenceAvg = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;
    const allNull = [item.description.value, item.hsnCode.value, item.quantity.value, item.unit.value, item.unitPrice.value, item.lineTotal.value].every(
      (v) => v === null,
    );

    const data = {
      description: item.description.value,
      hsnCode: item.hsnCode.value,
      quantity: item.quantity.value,
      unit: item.unit.value,
      unitPrice: item.unitPrice.value,
      lineTotal: item.lineTotal.value,
      countryOfOrigin: item.countryOfOrigin.value,
      sourceDocumentType,
      confidenceAvg,
      verificationStatus: allNull ? ("MISSING" as const) : ("UNVERIFIED" as const),
    };

    await prisma.lineItem.upsert({
      where: { shipmentId_lineIndex: { shipmentId, lineIndex: index } },
      create: { shipmentId, lineIndex: index, ...data },
      update: data,
    });
  }
}

async function refreshValidationIssues(shipmentId: string, results: Partial<Record<DocumentType, DocumentExtractionResult>>) {
  const input: ValidationInput = results;
  const drafts = runValidationEngine(input);

  await prisma.validationIssue.deleteMany({ where: { shipmentId, status: "OPEN" } });
  if (drafts.length === 0) return;

  await prisma.validationIssue.createMany({
    data: drafts.map((d) => ({
      shipmentId,
      ruleId: d.ruleId,
      category: d.category,
      severity: d.severity,
      documentsCompared: d.documentsCompared,
      comparedValues: d.comparedValues as object,
      difference: d.difference,
      message: d.message,
      status: "OPEN",
    })),
  });
}

export async function revalidateShipment(shipmentId: string) {
  const extractions = await prisma.extraction.findMany({
    where: { document: { shipmentId }, processingStatus: "COMPLETED" },
    include: { document: { select: { documentType: true } } },
  });

  const results: Partial<Record<DocumentType, DocumentExtractionResult>> = {};
  for (const extraction of extractions) {
    results[extraction.document.documentType] = extraction.structuredResponse as unknown as DocumentExtractionResult;
  }

  await refreshValidationIssues(shipmentId, results);
}

export { isArrayValueField };
