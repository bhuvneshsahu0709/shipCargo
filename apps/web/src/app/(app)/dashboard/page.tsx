"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ShipmentStatus } from "@cargolens/shared";
import { FileSearch, Plus, Search } from "lucide-react";
import { useShipments } from "@/lib/shipments";
import { useAnalyticsOverview } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ShipmentStatusBadge } from "@/components/domain/status-badge";
import { formatDateTime, formatPercent } from "@/lib/utils";

const STATUS_FILTERS: { value: ShipmentStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PROCESSING", label: "Processing" },
  { value: "NEEDS_REVIEW", label: "Needs Review" },
  { value: "READY_FOR_APPROVAL", label: "Ready for Approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<ShipmentStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const { data, isLoading } = useShipments({
    search: debouncedSearch || undefined,
    status: status === "ALL" ? undefined : status,
    page,
    pageSize,
  });
  const { data: overview } = useAnalyticsOverview();

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Shipments</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track extraction, validation and approval across your import file.</p>
        </div>
        <Button asChild>
          <Link href="/shipments/new">
            <Plus className="size-4" />
            New Shipment
          </Link>
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatTile label="Total" value={overview?.totalShipments ?? "—"} />
        <StatTile label="Processing" value={overview?.byStatus.PROCESSING ?? 0} />
        <StatTile label="Needs Review" value={overview?.byStatus.NEEDS_REVIEW ?? 0} />
        <StatTile label="Ready for Approval" value={overview?.byStatus.READY_FOR_APPROVAL ?? 0} />
        <StatTile label="Approved" value={overview?.byStatus.APPROVED ?? 0} />
        <StatTile label="Avg. Confidence" value={formatPercent(overview?.averageExtractionConfidence, 0)} hint="across all extracted fields" />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search shipment ID or supplier"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as ShipmentStatus | "ALL");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Shipment ID</th>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 font-medium">Importer</th>
              <th className="px-4 py-3 font-medium">Documents</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Blocking Issues</th>
              <th className="px-4 py-3 font-medium">Executive</th>
              <th className="px-4 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-3" colSpan={8}>
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))}
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={8} className="p-0">
                  <EmptyState
                    icon={FileSearch}
                    title="No shipments found"
                    description="Try a different search or filter, or create a new shipment."
                    action={
                      <Button asChild size="sm">
                        <Link href="/shipments/new">New Shipment</Link>
                      </Button>
                    }
                  />
                </td>
              </tr>
            )}
            {data?.items.map((item) => (
              <tr key={item.id} className="border-b border-border transition-colors last:border-0 hover:bg-surface-muted">
                <td className="px-4 py-3">
                  <Link href={`/shipments/${item.id}`} className="font-medium text-navy-900 hover:underline">
                    {item.shipmentNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-foreground">{item.supplier}</td>
                <td className="px-4 py-3 text-foreground">{item.importer}</td>
                <td className="px-4 py-3 text-muted-foreground">{item.documentCompleteness}</td>
                <td className="px-4 py-3">
                  <ShipmentStatusBadge status={item.status} />
                </td>
                <td className="px-4 py-3">
                  {item.openBlockingIssues > 0 ? (
                    <span className="font-medium text-red-600">{item.openBlockingIssues}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{item.assignedExecutive?.name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDateTime(item.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {data.total} shipment{data.total === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
