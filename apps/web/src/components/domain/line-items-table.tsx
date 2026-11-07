"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { ConfidenceBadge, FieldStatusBadge } from "@/components/domain/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PackageSearch } from "lucide-react";
import { useCorrectLineItem, useVerifyLineItem } from "@/lib/shipments";
import { ApiError } from "@/lib/api-client";
import type { LineItemDto } from "@/types/shipment";

type Draft = {
  description: string;
  hsnCode: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  lineTotal: string;
  countryOfOrigin: string;
};

function toDraft(item: LineItemDto): Draft {
  return {
    description: item.description ?? "",
    hsnCode: item.hsnCode ?? "",
    quantity: item.quantity?.toString() ?? "",
    unit: item.unit ?? "",
    unitPrice: item.unitPrice?.toString() ?? "",
    lineTotal: item.lineTotal?.toString() ?? "",
    countryOfOrigin: item.countryOfOrigin ?? "",
  };
}

function toNumberOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function LineItemsTable({ shipmentId, lineItems, readOnly }: { shipmentId: string; lineItems: LineItemDto[]; readOnly?: boolean }) {
  if (lineItems.length === 0) {
    return <EmptyState icon={PackageSearch} title="No line items extracted" description="Run extraction once all documents are uploaded." />;
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Description</th>
            <th className="px-3 py-2 font-medium">HSN</th>
            <th className="px-3 py-2 font-medium">Qty</th>
            <th className="px-3 py-2 font-medium">Unit</th>
            <th className="px-3 py-2 font-medium">Unit Price</th>
            <th className="px-3 py-2 font-medium">Line Total</th>
            <th className="px-3 py-2 font-medium">Origin</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item) => (
            <LineItemRow key={item.id} shipmentId={shipmentId} item={item} readOnly={readOnly} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineItemRow({ shipmentId, item, readOnly }: { shipmentId: string; item: LineItemDto; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(item));
  const correctLineItem = useCorrectLineItem(shipmentId);
  const verifyLineItem = useVerifyLineItem(shipmentId);

  const isMissing = item.verificationStatus === "MISSING";
  const isVerified = item.verificationStatus === "VERIFIED" || item.verificationStatus === "CORRECTED";

  function set<K extends keyof Draft>(key: K, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function save() {
    correctLineItem.mutate(
      {
        lineItemId: item.id,
        body: {
          description: draft.description.trim() || null,
          hsnCode: draft.hsnCode.trim() || null,
          quantity: toNumberOrNull(draft.quantity),
          unit: draft.unit.trim() || null,
          unitPrice: toNumberOrNull(draft.unitPrice),
          lineTotal: toNumberOrNull(draft.lineTotal),
          countryOfOrigin: draft.countryOfOrigin.trim() || null,
        },
      },
      {
        onSuccess: () => setEditing(false),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not save line item"),
      },
    );
  }

  if (editing) {
    return (
      <tr className="border-t border-border bg-navy-50/40">
        <td className="px-3 py-2 align-top text-muted-foreground">{item.lineIndex + 1}</td>
        <td className="px-2 py-1.5 align-top">
          <Input value={draft.description} onChange={(e) => set("description", e.target.value)} className="h-7 text-sm" aria-label="Description value" />
        </td>
        <td className="px-2 py-1.5 align-top">
          <Input value={draft.hsnCode} onChange={(e) => set("hsnCode", e.target.value)} className="h-7 w-24 text-sm" aria-label="HSN Code value" />
        </td>
        <td className="px-2 py-1.5 align-top">
          <Input value={draft.quantity} onChange={(e) => set("quantity", e.target.value)} className="h-7 w-20 text-sm" aria-label="Quantity value" />
        </td>
        <td className="px-2 py-1.5 align-top">
          <Input value={draft.unit} onChange={(e) => set("unit", e.target.value)} className="h-7 w-16 text-sm" aria-label="Unit value" />
        </td>
        <td className="px-2 py-1.5 align-top">
          <Input value={draft.unitPrice} onChange={(e) => set("unitPrice", e.target.value)} className="h-7 w-20 text-sm" aria-label="Unit Price value" />
        </td>
        <td className="px-2 py-1.5 align-top">
          <Input value={draft.lineTotal} onChange={(e) => set("lineTotal", e.target.value)} className="h-7 w-24 text-sm" aria-label="Line Total value" />
        </td>
        <td className="px-2 py-1.5 align-top">
          <Input value={draft.countryOfOrigin} onChange={(e) => set("countryOfOrigin", e.target.value)} className="h-7 w-24 text-sm" aria-label="Country of Origin value" />
        </td>
        <td className="px-3 py-2 align-top">
          <FieldStatusBadge status={item.verificationStatus} />
        </td>
        <td className="px-2 py-1.5 align-top">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="size-6" onClick={save} disabled={correctLineItem.isPending} aria-label="Save line item">
              <Check className="size-3.5 text-teal-600" />
            </Button>
            <Button size="icon" variant="ghost" className="size-6" onClick={() => setEditing(false)} aria-label="Cancel line item edit">
              <X className="size-3.5" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="group border-t border-border">
      <td className="px-3 py-2 text-muted-foreground">{item.lineIndex + 1}</td>
      <td className={`px-3 py-2 ${isMissing ? "italic text-muted-foreground" : "text-foreground"}`}>{item.description ?? "Not present"}</td>
      <td className="px-3 py-2 text-muted-foreground">{item.hsnCode ?? "—"}</td>
      <td className="px-3 py-2 text-foreground">{item.quantity ?? "—"}</td>
      <td className="px-3 py-2 text-muted-foreground">{item.unit ?? "—"}</td>
      <td className="px-3 py-2 text-foreground">{item.unitPrice ?? "—"}</td>
      <td className="px-3 py-2 text-foreground">{item.lineTotal ?? "—"}</td>
      <td className="px-3 py-2 text-muted-foreground">{item.countryOfOrigin ?? "—"}</td>
      <td className="px-3 py-2">
        {isMissing ? <FieldStatusBadge status="MISSING" /> : <ConfidenceBadge confidence={item.confidenceAvg} />}
      </td>
      <td className="px-2 py-2">
        {!readOnly && (
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100">
            <Button size="icon" variant="ghost" className="size-6" onClick={() => { setDraft(toDraft(item)); setEditing(true); }} aria-label={`Edit line ${item.lineIndex + 1}`}>
              <Pencil className="size-3.5" />
            </Button>
            <Checkbox
              checked={isVerified}
              disabled={item.verificationStatus === "CORRECTED" || isMissing || verifyLineItem.isPending}
              onCheckedChange={(checked) => verifyLineItem.mutate({ lineItemId: item.id, body: { verified: Boolean(checked) } })}
              title="Mark verified"
              aria-label={`Verify line ${item.lineIndex + 1}`}
            />
          </div>
        )}
      </td>
    </tr>
  );
}
