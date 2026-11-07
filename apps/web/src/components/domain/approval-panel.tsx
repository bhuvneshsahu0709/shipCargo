"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { AuthUser } from "@cargolens/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApproveShipment, useRequestChanges } from "@/lib/shipments";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/utils";
import type { ApprovalDto, AuditLogDto, ShipmentDetailResponse } from "@/types/shipment";

export function ApprovalPanel({
  shipment,
  approvals,
  auditLogs,
  currentUser,
}: {
  shipment: ShipmentDetailResponse["shipment"];
  approvals: ApprovalDto[];
  auditLogs: AuditLogDto[];
  currentUser: AuthUser;
}) {
  const [comments, setComments] = useState("");
  const approve = useApproveShipment(shipment.id);
  const requestChanges = useRequestChanges(shipment.id);

  const isManager = currentUser.role === "MANAGER";
  const isOwnShipment = shipment.assignedExecutive?.id === currentUser.id;
  const canAct = isManager && !isOwnShipment && shipment.status === "READY_FOR_APPROVAL";

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Manager decision</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!isManager && <p className="text-sm text-muted-foreground">Only a Documentation Manager can approve this shipment.</p>}
          {isManager && isOwnShipment && <p className="text-sm text-amber-600">You are the assigned executive for this shipment and cannot approve your own work.</p>}
          {isManager && !isOwnShipment && shipment.status === "APPROVED" && (
            <p className="text-sm text-teal-600">This shipment has already been approved and is locked for export.</p>
          )}
          {isManager && !isOwnShipment && shipment.status !== "READY_FOR_APPROVAL" && shipment.status !== "APPROVED" && (
            <p className="text-sm text-muted-foreground">
              Not ready for approval yet — resolve all critical discrepancies and verify every field first.
            </p>
          )}
          {canAct && (
            <>
              <textarea
                className="min-h-20 rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-700"
                placeholder="Comments (optional)"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  disabled={approve.isPending}
                  onClick={() =>
                    approve.mutate(comments || undefined, {
                      onSuccess: () => toast.success("Shipment approved"),
                      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not approve"),
                    })
                  }
                >
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  disabled={requestChanges.isPending}
                  onClick={() =>
                    requestChanges.mutate(comments || undefined, {
                      onSuccess: () => toast.success("Changes requested"),
                      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not request changes"),
                    })
                  }
                >
                  Request Changes
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Approval history</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {approvals.length === 0 && <p className="text-sm text-muted-foreground">No approval decisions yet.</p>}
          {approvals.map((a) => (
            <div key={a.id} className="border-b border-border pb-2 text-sm last:border-0">
              <p className="font-medium text-foreground">
                {a.decision === "APPROVED" ? "Approved" : "Changes requested"} by {a.manager.name}
              </p>
              <p className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</p>
              {a.comments && <p className="mt-1 text-xs text-foreground">{a.comments}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity &amp; correction history</CardTitle>
        </CardHeader>
        <CardContent className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {auditLogs.length === 0 && <p className="text-sm text-muted-foreground">No activity recorded yet.</p>}
          {auditLogs.map((log) => (
            <div key={log.id} className="text-xs">
              <span className="font-medium text-foreground">{log.user.name}</span>{" "}
              <span className="text-muted-foreground">
                {log.action.toLowerCase().replace(/_/g, " ")} · {formatDateTime(log.createdAt)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
