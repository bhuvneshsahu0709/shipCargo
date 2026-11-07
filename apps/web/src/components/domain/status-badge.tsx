import type { DocumentProcessingStatus, FieldVerificationStatus, ShipmentStatus, ValidationSeverity, ValidationStatus } from "@cargolens/shared";
import { Badge } from "@/components/ui/badge";
import { titleCase } from "@/lib/utils";

const SHIPMENT_STATUS_VARIANT: Record<ShipmentStatus, "neutral" | "navy" | "teal" | "amber" | "red"> = {
  DRAFT: "neutral",
  PROCESSING: "navy",
  NEEDS_REVIEW: "amber",
  READY_FOR_APPROVAL: "teal",
  APPROVED: "teal",
  REJECTED: "red",
};

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  return <Badge variant={SHIPMENT_STATUS_VARIANT[status]}>{titleCase(status)}</Badge>;
}

const SEVERITY_VARIANT: Record<ValidationSeverity, "neutral" | "amber" | "red"> = {
  INFO: "neutral",
  WARNING: "amber",
  CRITICAL: "red",
};

export function SeverityBadge({ severity }: { severity: ValidationSeverity }) {
  return <Badge variant={SEVERITY_VARIANT[severity]}>{titleCase(severity)}</Badge>;
}

const VALIDATION_STATUS_VARIANT: Record<ValidationStatus, "neutral" | "amber" | "teal"> = {
  OPEN: "amber",
  RESOLVED: "teal",
  ACCEPTED_EXCEPTION: "neutral",
};

export function ValidationStatusBadge({ status }: { status: ValidationStatus }) {
  return <Badge variant={VALIDATION_STATUS_VARIANT[status]}>{titleCase(status)}</Badge>;
}

const FIELD_STATUS_VARIANT: Record<FieldVerificationStatus, "neutral" | "amber" | "teal" | "navy"> = {
  UNVERIFIED: "amber",
  VERIFIED: "teal",
  CORRECTED: "navy",
  MISSING: "neutral",
};

export function FieldStatusBadge({ status }: { status: FieldVerificationStatus }) {
  return <Badge variant={FIELD_STATUS_VARIANT[status]}>{titleCase(status)}</Badge>;
}

const DOC_STATUS_VARIANT: Record<DocumentProcessingStatus, "neutral" | "navy" | "teal" | "red"> = {
  PENDING: "neutral",
  PROCESSING: "navy",
  COMPLETED: "teal",
  FAILED: "red",
};

export function DocumentStatusBadge({ status }: { status: DocumentProcessingStatus }) {
  return <Badge variant={DOC_STATUS_VARIANT[status]}>{titleCase(status)}</Badge>;
}

export function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence === null) return <Badge variant="neutral">No confidence</Badge>;
  if (confidence >= 0.85) return <Badge variant="teal">{Math.round(confidence * 100)}%</Badge>;
  if (confidence >= 0.6) return <Badge variant="amber">{Math.round(confidence * 100)}%</Badge>;
  return <Badge variant="red">{Math.round(confidence * 100)}%</Badge>;
}
