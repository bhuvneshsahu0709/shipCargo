import type { DocumentProcessingStatus, DocumentType, FieldVerificationStatus, ShipmentStatus, ValidationRuleId, ValidationSeverity, ValidationStatus } from "@cargolens/shared";

export type ShipmentListItem = {
  id: string;
  shipmentNumber: string;
  supplier: string;
  importer: string;
  status: ShipmentStatus;
  assignedExecutive: { id: string; name: string } | null;
  documentCompleteness: string;
  openBlockingIssues: number;
  createdAt: string;
  updatedAt: string;
};

export type ShipmentListResponse = {
  items: ShipmentListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type DocumentDto = {
  id: string;
  shipmentId: string;
  documentType: DocumentType;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  pageCount: number | null;
  processingStatus: DocumentProcessingStatus;
  createdAt: string;
};

export type ExtractedFieldDto = {
  id: string;
  shipmentId: string;
  fieldName: string;
  value: string | null;
  originalValue: string | null;
  confidence: number | null;
  sourceDocumentId: string | null;
  sourceDocument: { documentType: DocumentType } | null;
  evidence: string | null;
  pageNumber: number | null;
  verificationStatus: FieldVerificationStatus;
  correctionNote: string | null;
};

export type LineItemDto = {
  id: string;
  lineIndex: number;
  description: string | null;
  hsnCode: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
  countryOfOrigin: string | null;
  sourceDocumentType: DocumentType | null;
  confidenceAvg: number | null;
};

export type ValidationIssueDto = {
  id: string;
  shipmentId: string;
  ruleId: ValidationRuleId;
  category: string;
  severity: ValidationSeverity;
  documentsCompared: DocumentType[];
  comparedValues: Record<string, unknown>;
  difference: string | null;
  message: string;
  status: ValidationStatus;
  resolvedById: string | null;
  resolvedBy: { id: string; name: string } | null;
  resolutionNote: string | null;
  createdAt: string;
};

export type ApprovalDto = {
  id: string;
  decision: "APPROVED" | "REJECTED";
  comments: string | null;
  createdAt: string;
  manager: { id: string; name: string };
};

export type AuditLogDto = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
  createdAt: string;
  user: { id: string; name: string };
};

export type ShipmentDetailResponse = {
  shipment: {
    id: string;
    shipmentNumber: string;
    supplier: string;
    importer: string;
    status: ShipmentStatus;
    createdAt: string;
    updatedAt: string;
    documents: DocumentDto[];
    assignedExecutive: { id: string; name: string; email: string } | null;
    approvedBy: { id: string; name: string; email: string } | null;
  };
  extractedFields: ExtractedFieldDto[];
  lineItems: LineItemDto[];
  validationIssues: ValidationIssueDto[];
  approvals: ApprovalDto[];
  auditLogs: AuditLogDto[];
};
