"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { SeverityBadge, ValidationStatusBadge } from "@/components/domain/status-badge";
import { useResolveValidationIssue } from "@/lib/shipments";
import { ApiError } from "@/lib/api-client";
import { titleCase } from "@/lib/utils";
import type { ValidationIssueDto } from "@/types/shipment";

export function ValidationPanel({ shipmentId, issues, readOnly }: { shipmentId: string; issues: ValidationIssueDto[]; readOnly?: boolean }) {
  if (issues.length === 0) {
    return <EmptyState icon={ShieldCheck} title="No discrepancies found" description="All cross-document checks passed for the documents processed so far." />;
  }

  const sorted = [...issues].sort((a, b) => {
    const order = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
    return order[a.severity] - order[b.severity];
  });

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((issue) => (
        <IssueCard key={issue.id} shipmentId={shipmentId} issue={issue} readOnly={readOnly} />
      ))}
    </div>
  );
}

function IssueCard({ shipmentId, issue, readOnly }: { shipmentId: string; issue: ValidationIssueDto; readOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState<"RESOLVED" | "ACCEPTED_EXCEPTION">("RESOLVED");
  const [note, setNote] = useState("");
  const resolve = useResolveValidationIssue(shipmentId);

  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <SeverityBadge severity={issue.severity} />
            <span className="text-xs font-medium text-muted-foreground">{issue.category}</span>
          </div>
          <p className="mt-1.5 text-sm text-foreground">{issue.message}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Compared: {issue.documentsCompared.map((d) => titleCase(d)).join(" vs ")}</p>
          {issue.resolutionNote && <p className="mt-1 text-[11px] text-navy-700">Resolution: {issue.resolutionNote}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <ValidationStatusBadge status={issue.status} />
          {issue.status === "OPEN" && !readOnly && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="secondary">
                  Resolve
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Resolve discrepancy</DialogTitle>
                  <DialogDescription>{issue.message}</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`resolution-select-${issue.id}`}>Resolution</Label>
                    <Select value={resolution} onValueChange={(v) => setResolution(v as typeof resolution)}>
                      <SelectTrigger id={`resolution-select-${issue.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RESOLVED">Fixed at source (corrected the field)</SelectItem>
                        <SelectItem value="ACCEPTED_EXCEPTION">Accept as a documented exception</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`resolution-note-${issue.id}`}>Note</Label>
                    <textarea
                      id={`resolution-note-${issue.id}`}
                      className="min-h-20 rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-700"
                      placeholder="Explain why this is resolved or acceptable…"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    disabled={note.trim().length < 3 || resolve.isPending}
                    onClick={() =>
                      resolve.mutate(
                        { issueId: issue.id, body: { status: resolution, resolutionNote: note.trim() } },
                        {
                          onSuccess: () => {
                            setOpen(false);
                            setNote("");
                            toast.success("Validation issue updated");
                          },
                          onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not resolve issue"),
                        },
                      )
                    }
                  >
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    </div>
  );
}
