import { z } from "zod";
import { DOCUMENT_TYPES, SHIPMENT_STATUSES } from "../enums.js";

export const createShipmentRequestSchema = z.object({
  shipmentNumber: z.string().min(3).max(64),
  supplier: z.string().min(1).max(200),
  importer: z.string().min(1).max(200),
});
export type CreateShipmentRequest = z.infer<typeof createShipmentRequestSchema>;

export const shipmentListQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(SHIPMENT_STATUSES).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(["updatedAt", "shipmentNumber", "supplier", "createdAt"]).default("updatedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type ShipmentListQuery = z.infer<typeof shipmentListQuerySchema>;

export const uploadDocumentRequestSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
});
export type UploadDocumentRequest = z.infer<typeof uploadDocumentRequestSchema>;

export const correctFieldRequestSchema = z.object({
  value: z.string().max(2000).nullable(),
  note: z.string().max(1000).optional(),
});
export type CorrectFieldRequest = z.infer<typeof correctFieldRequestSchema>;

export const verifyFieldRequestSchema = z.object({
  verified: z.boolean(),
});
export type VerifyFieldRequest = z.infer<typeof verifyFieldRequestSchema>;

export const approvalRequestSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  comments: z.string().max(2000).optional(),
});
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const ACCEPTED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
