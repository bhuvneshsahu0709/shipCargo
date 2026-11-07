import { z } from "zod";
import { DOCUMENT_TYPES } from "../enums.js";

function fieldSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({
    value: valueSchema.nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    sourceDocument: z.enum(DOCUMENT_TYPES).nullable(),
    evidence: z.string().nullable(),
    pageNumber: z.number().int().positive().nullable(),
  });
}

export const stringFieldSchema = fieldSchema(z.string());
export const numberFieldSchema = fieldSchema(z.number());
export const stringArrayFieldSchema = fieldSchema(z.array(z.string()));

export type ExtractedField<T> = {
  value: T | null;
  confidence: number | null;
  sourceDocument: (typeof DOCUMENT_TYPES)[number] | null;
  evidence: string | null;
  pageNumber: number | null;
};

export const shipmentFieldsSchema = z
  .object({
    shipmentId: stringFieldSchema,
    supplierName: stringFieldSchema,
    importerName: stringFieldSchema,
    consignee: stringFieldSchema,
    notifyParty: stringFieldSchema,
    countryOfOrigin: stringFieldSchema,
    portOfLoading: stringFieldSchema,
    portOfDischarge: stringFieldSchema,
    invoiceNumber: stringFieldSchema,
    invoiceDate: stringFieldSchema,
    currency: stringFieldSchema,
    incoterm: stringFieldSchema,
  })
  .partial();
export type ShipmentFields = z.infer<typeof shipmentFieldsSchema>;
export const SHIPMENT_FIELD_NAMES = [
  "shipmentId",
  "supplierName",
  "importerName",
  "consignee",
  "notifyParty",
  "countryOfOrigin",
  "portOfLoading",
  "portOfDischarge",
  "invoiceNumber",
  "invoiceDate",
  "currency",
  "incoterm",
] as const;

export const lineItemExtractionSchema = z.object({
  description: stringFieldSchema,
  hsnCode: stringFieldSchema,
  quantity: numberFieldSchema,
  unit: stringFieldSchema,
  unitPrice: numberFieldSchema,
  lineTotal: numberFieldSchema,
  countryOfOrigin: stringFieldSchema,
});
export type LineItemExtraction = z.infer<typeof lineItemExtractionSchema>;

export const packagingFieldsSchema = z
  .object({
    numberOfPackages: numberFieldSchema,
    packageType: stringFieldSchema,
    netWeight: numberFieldSchema,
    grossWeight: numberFieldSchema,
    weightUnit: stringFieldSchema,
    containerNumbers: stringArrayFieldSchema,
    sealNumbers: stringArrayFieldSchema,
  })
  .partial();
export type PackagingFields = z.infer<typeof packagingFieldsSchema>;
export const PACKAGING_FIELD_NAMES = [
  "numberOfPackages",
  "packageType",
  "netWeight",
  "grossWeight",
  "weightUnit",
  "containerNumbers",
  "sealNumbers",
] as const;

export const ARRAY_VALUE_FIELD_NAMES = ["packaging.containerNumbers", "packaging.sealNumbers"] as const;
export function isArrayValueField(fieldName: string): boolean {
  return (ARRAY_VALUE_FIELD_NAMES as readonly string[]).includes(fieldName);
}

export const documentExtractionResultSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  pageCount: z.number().int().positive(),
  shipmentFields: shipmentFieldsSchema,
  lineItems: z.array(lineItemExtractionSchema),
  packaging: packagingFieldsSchema,
  provider: z.string(),
  model: z.string(),
  promptVersion: z.string(),
});
export type DocumentExtractionResult = z.infer<typeof documentExtractionResultSchema>;
