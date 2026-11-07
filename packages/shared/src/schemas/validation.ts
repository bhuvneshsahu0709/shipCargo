import { z } from "zod";
import { DOCUMENT_TYPES, VALIDATION_RULE_IDS, VALIDATION_SEVERITIES, VALIDATION_STATUSES } from "../enums.js";

export const validationIssueSchema = z.object({
  id: z.string(),
  shipmentId: z.string(),
  ruleId: z.enum(VALIDATION_RULE_IDS),
  severity: z.enum(VALIDATION_SEVERITIES),
  category: z.string(),
  documentsCompared: z.array(z.enum(DOCUMENT_TYPES)),
  comparedValues: z.record(z.string(), z.unknown()),
  difference: z.string().nullable(),
  message: z.string(),
  status: z.enum(VALIDATION_STATUSES),
  resolvedById: z.string().nullable(),
  resolutionNote: z.string().nullable(),
  createdAt: z.string(),
});
export type ValidationIssueDto = z.infer<typeof validationIssueSchema>;

export const resolveValidationIssueRequestSchema = z.object({
  status: z.enum(["RESOLVED", "ACCEPTED_EXCEPTION"]),
  resolutionNote: z.string().min(3).max(1000),
});
export type ResolveValidationIssueRequest = z.infer<typeof resolveValidationIssueRequestSchema>;
