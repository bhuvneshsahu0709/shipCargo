export const USER_ROLES = ["EXECUTIVE", "MANAGER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const DOCUMENT_TYPES = ["INVOICE", "PACKING_LIST", "BILL_OF_LADING"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const SHIPMENT_STATUSES = [
  "DRAFT",
  "PROCESSING",
  "NEEDS_REVIEW",
  "READY_FOR_APPROVAL",
  "APPROVED",
  "REJECTED",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const DOCUMENT_PROCESSING_STATUSES = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
] as const;
export type DocumentProcessingStatus = (typeof DOCUMENT_PROCESSING_STATUSES)[number];

export const FIELD_VERIFICATION_STATUSES = [
  "UNVERIFIED",
  "VERIFIED",
  "CORRECTED",
  "MISSING",
] as const;
export type FieldVerificationStatus = (typeof FIELD_VERIFICATION_STATUSES)[number];

export const VALIDATION_SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;
export type ValidationSeverity = (typeof VALIDATION_SEVERITIES)[number];

export const VALIDATION_STATUSES = ["OPEN", "RESOLVED", "ACCEPTED_EXCEPTION"] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

export const APPROVAL_DECISIONS = ["APPROVED", "REJECTED"] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

export const VALIDATION_RULE_IDS = [
  "INVOICE_ARITHMETIC",
  "QUANTITY_MATCH",
  "GROSS_WEIGHT_MATCH",
  "NET_WEIGHT_MATCH",
  "PACKAGE_MATCH",
  "CONTAINER_MATCH",
  "PARTY_CONSISTENCY",
  "CURRENCY_DATE_CONSISTENCY",
] as const;
export type ValidationRuleId = (typeof VALIDATION_RULE_IDS)[number];

export const EXTRACTION_PROCESSING_STATUSES = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
] as const;
export type ExtractionProcessingStatus = (typeof EXTRACTION_PROCESSING_STATUSES)[number];
