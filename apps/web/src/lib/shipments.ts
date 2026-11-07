"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ApprovalRequest,
  CorrectFieldRequest,
  CorrectLineItemRequest,
  CreateShipmentRequest,
  ResolveValidationIssueRequest,
  ShipmentListQuery,
  UploadDocumentRequest,
  VerifyFieldRequest,
} from "@cargolens/shared";
import { apiDelete, apiDownload, apiGet, apiPatch, apiPost, apiUpload } from "./api-client";
import type { ShipmentDetailResponse, ShipmentListResponse } from "@/types/shipment";

export function useShipments(query: Partial<ShipmentListQuery>) {
  return useQuery({
    queryKey: ["shipments", query],
    queryFn: () =>
      apiGet<ShipmentListResponse>("/shipments", {
        search: query.search || undefined,
        status: query.status,
        page: query.page,
        pageSize: query.pageSize,
        sortBy: query.sortBy,
        sortDir: query.sortDir,
      }),
  });
}

export function useShipmentDetail(id: string) {
  return useQuery({
    queryKey: ["shipments", id],
    queryFn: () => apiGet<ShipmentDetailResponse>(`/shipments/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.shipment.status === "PROCESSING" ? 2000 : false),
  });
}

export function useCreateShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateShipmentRequest) => apiPost<{ shipment: { id: string } }>("/shipments", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipments"] }),
  });
}

export function useUploadDocument(shipmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ documentType, file }: { documentType: UploadDocumentRequest["documentType"]; file: File }) => {
      const form = new FormData();
      form.append("documentType", documentType);
      form.append("file", file);
      return apiUpload<{ warnings: string[]; wasReplaced: boolean }>(`/shipments/${shipmentId}/documents`, form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipments", shipmentId] });
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
    },
  });
}

export function useDeleteDocument(shipmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => apiDelete<void>(`/documents/${documentId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipments", shipmentId] }),
  });
}

export function useProcessShipment(shipmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ processed: string[]; failed: string[] }>(`/shipments/${shipmentId}/process`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipments", shipmentId] });
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
    },
  });
}

export function useCorrectField(shipmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldId, body }: { fieldId: string; body: CorrectFieldRequest }) =>
      apiPatch(`/shipments/${shipmentId}/fields/${fieldId}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipments", shipmentId] }),
  });
}

export function useVerifyField(shipmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldId, body }: { fieldId: string; body: VerifyFieldRequest }) =>
      apiPost(`/shipments/${shipmentId}/fields/${fieldId}/verify`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipments", shipmentId] }),
  });
}

export function useCorrectLineItem(shipmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineItemId, body }: { lineItemId: string; body: CorrectLineItemRequest }) =>
      apiPatch(`/shipments/${shipmentId}/line-items/${lineItemId}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipments", shipmentId] }),
  });
}

export function useVerifyLineItem(shipmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineItemId, body }: { lineItemId: string; body: VerifyFieldRequest }) =>
      apiPost(`/shipments/${shipmentId}/line-items/${lineItemId}/verify`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipments", shipmentId] }),
  });
}

export function useResolveValidationIssue(shipmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, body }: { issueId: string; body: ResolveValidationIssueRequest }) =>
      apiPatch(`/validation/${issueId}/resolve`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipments", shipmentId] }),
  });
}

export function useApproveShipment(shipmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (comments?: string) => apiPost(`/shipments/${shipmentId}/approve`, { comments }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipments", shipmentId] });
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
    },
  });
}

export function useRequestChanges(shipmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (comments?: string) => apiPost(`/shipments/${shipmentId}/request-changes`, { comments }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipments", shipmentId] });
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
    },
  });
}

export function useExportShipment() {
  return useMutation({
    mutationFn: async ({ shipmentId, shipmentNumber }: { shipmentId: string; shipmentNumber: string }) => {
      const blob = await apiDownload(`/shipments/${shipmentId}/export`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${shipmentNumber}-export.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    },
  });
}

export type ApprovalDecisionRequest = ApprovalRequest;
