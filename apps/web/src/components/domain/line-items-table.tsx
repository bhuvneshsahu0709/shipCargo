import { ConfidenceBadge } from "@/components/domain/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PackageSearch } from "lucide-react";
import type { LineItemDto } from "@/types/shipment";

export function LineItemsTable({ lineItems }: { lineItems: LineItemDto[] }) {
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
            <th className="px-3 py-2 font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item) => (
            <tr key={item.id} className="border-t border-border">
              <td className="px-3 py-2 text-muted-foreground">{item.lineIndex + 1}</td>
              <td className="px-3 py-2 text-foreground">{item.description ?? "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{item.hsnCode ?? "—"}</td>
              <td className="px-3 py-2 text-foreground">{item.quantity ?? "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{item.unit ?? "—"}</td>
              <td className="px-3 py-2 text-foreground">{item.unitPrice ?? "—"}</td>
              <td className="px-3 py-2 text-foreground">{item.lineTotal ?? "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{item.countryOfOrigin ?? "—"}</td>
              <td className="px-3 py-2">
                <ConfidenceBadge confidence={item.confidenceAvg} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-border bg-surface-muted px-3 py-1.5 text-[11px] text-muted-foreground">
        Line items are shown read-only in this release — correct the source document and re-process if a line item is wrong.
      </p>
    </div>
  );
}
