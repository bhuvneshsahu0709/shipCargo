"use client";

import { useState } from "react";
import { Check, FileText, Pencil, X } from "lucide-react";
import { isArrayValueField, type DocumentType } from "@cargolens/shared";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfidenceBadge, FieldStatusBadge } from "@/components/domain/status-badge";
import { useCorrectField, useVerifyField } from "@/lib/shipments";
import type { ExtractedFieldDto } from "@/types/shipment";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const DOC_ABBR: Record<DocumentType, string> = { INVOICE: "INV", PACKING_LIST: "PKL", BILL_OF_LADING: "BOL" };

function displayValue(field: ExtractedFieldDto): string {
  if (field.value === null) return "";
  if (isArrayValueField(field.fieldName)) {
    try {
      return (JSON.parse(field.value) as string[]).join(", ");
    } catch {
      return field.value;
    }
  }
  return field.value;
}

export function FieldRow({
  shipmentId,
  label,
  field,
  readOnly,
  onNavigate,
}: {
  shipmentId: string;
  label: string;
  field: ExtractedFieldDto;
  readOnly?: boolean;
  onNavigate?: (documentType: DocumentType, pageNumber: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => displayValue(field));
  const correctField = useCorrectField(shipmentId);
  const verifyField = useVerifyField(shipmentId);

  const isMissing = field.value === null;
  const isVerified = field.verificationStatus === "VERIFIED" || field.verificationStatus === "CORRECTED";

  function save() {
    const nextValue = isArrayValueField(field.fieldName)
      ? JSON.stringify(
          draft
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        )
      : draft.trim() || null;

    correctField.mutate(
      { fieldId: field.id, body: { value: nextValue } },
      {
        onSuccess: () => setEditing(false),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not save correction"),
      },
    );
  }

  return (
    <div
      data-testid={`field-${field.fieldName}`}
      className={cn("group grid grid-cols-[9rem_1fr_auto] items-start gap-3 border-b border-border py-2.5 last:border-0", isMissing && "opacity-70")}
    >
      <span className="pt-1 text-xs font-medium text-muted-foreground">{label}</span>

      <div className="min-w-0">
        {editing ? (
          <div className="flex items-center gap-2">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="h-7 text-sm" autoFocus aria-label={`${label} value`} />
            <Button size="icon" variant="ghost" className="size-6" onClick={save} disabled={correctField.isPending} aria-label="Save correction">
              <Check className="size-3.5 text-teal-600" />
            </Button>
            <Button size="icon" variant="ghost" className="size-6" onClick={() => setEditing(false)} aria-label="Cancel edit">
              <X className="size-3.5" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            disabled={!field.pageNumber || !field.sourceDocument}
            onClick={() => field.sourceDocument && field.pageNumber && onNavigate?.(field.sourceDocument.documentType, field.pageNumber)}
            className={cn(
              "truncate text-left text-sm",
              isMissing ? "italic text-muted-foreground" : "text-foreground",
              field.pageNumber && "hover:underline decoration-dotted underline-offset-2",
            )}
          >
            {isMissing ? "Not present in documents" : displayValue(field)}
          </button>
        )}
        {field.evidence && !editing && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            <FileText className="size-3 shrink-0" />
            {field.evidence}
            {field.sourceDocument && ` · ${DOC_ABBR[field.sourceDocument.documentType]} p.${field.pageNumber ?? "?"}`}
          </p>
        )}
        {field.correctionNote && <p className="mt-0.5 text-[11px] text-navy-700">Note: {field.correctionNote}</p>}
      </div>

      <div className="flex items-center gap-2 pt-0.5">
        {isMissing ? <FieldStatusBadge status="MISSING" /> : <ConfidenceBadge confidence={field.confidence} />}
        {!readOnly && !editing && (
          <>
            <Button size="icon" variant="ghost" className="size-6 opacity-0 group-hover:opacity-100" onClick={() => setEditing(true)} aria-label={`Edit ${label}`}>
              <Pencil className="size-3.5" />
            </Button>
            <Checkbox
              checked={isVerified}
              disabled={field.verificationStatus === "CORRECTED" || isMissing || verifyField.isPending}
              onCheckedChange={(checked) => verifyField.mutate({ fieldId: field.id, body: { verified: Boolean(checked) } })}
              title="Mark verified"
              aria-label={`Verify ${label}`}
            />
          </>
        )}
      </div>
    </div>
  );
}
