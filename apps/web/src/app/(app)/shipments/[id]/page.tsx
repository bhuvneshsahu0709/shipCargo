"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DocumentType } from "@cargolens/shared";
import { Download, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ShipmentStatusBadge } from "@/components/domain/status-badge";
import { DocumentDropzone } from "@/components/domain/document-dropzone";
import { DocumentViewer } from "@/components/domain/document-viewer";
import { FieldRow } from "@/components/domain/field-row";
import { LineItemsTable } from "@/components/domain/line-items-table";
import { ValidationPanel } from "@/components/domain/validation-panel";
import { ApprovalPanel } from "@/components/domain/approval-panel";
import { useCurrentUser } from "@/lib/auth";
import { useExportShipment, useProcessShipment, useShipmentDetail, useUploadDocument } from "@/lib/shipments";
import { ApiError } from "@/lib/api-client";
import type { ExtractedFieldDto } from "@/types/shipment";

const DOC_TYPES: DocumentType[] = ["INVOICE", "PACKING_LIST", "BILL_OF_LADING"];

const PARTY_FIELDS: [string, string][] = [
  ["shipmentId", "Shipment ID"],
  ["supplierName", "Supplier"],
  ["importerName", "Importer"],
  ["consignee", "Consignee"],
  ["notifyParty", "Notify Party"],
  ["countryOfOrigin", "Country of Origin"],
  ["portOfLoading", "Port of Loading"],
  ["portOfDischarge", "Port of Discharge"],
];
const INVOICE_FIELDS: [string, string][] = [
  ["invoiceNumber", "Invoice Number"],
  ["invoiceDate", "Invoice Date"],
  ["currency", "Currency"],
  ["incoterm", "Incoterm"],
];
const PACKAGING_FIELDS: [string, string][] = [
  ["packaging.numberOfPackages", "No. of Packages"],
  ["packaging.packageType", "Package Type"],
  ["packaging.netWeight", "Net Weight"],
  ["packaging.grossWeight", "Gross Weight"],
  ["packaging.weightUnit", "Weight Unit"],
];
const CONTAINER_FIELDS: [string, string][] = [
  ["packaging.containerNumbers", "Container Numbers"],
  ["packaging.sealNumbers", "Seal Numbers"],
];

function FieldSection({
  title,
  fields,
  byName,
  shipmentId,
  readOnly,
  onNavigate,
}: {
  title: string;
  fields: [string, string][];
  byName: Map<string, ExtractedFieldDto>;
  shipmentId: string;
  readOnly: boolean;
  onNavigate: (documentType: DocumentType, pageNumber: number) => void;
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="rounded-lg border border-border bg-white px-3">
        {fields.map(([name, label]) => {
          const field = byName.get(name);
          if (!field) return null;
          return <FieldRow key={name} shipmentId={shipmentId} label={label} field={field} readOnly={readOnly} onNavigate={onNavigate} />;
        })}
      </div>
    </div>
  );
}

export default function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: detail, isLoading } = useShipmentDetail(id);
  const { data: me } = useCurrentUser();
  const uploadDoc = useUploadDocument(id);
  const process = useProcessShipment(id);
  const exportShipment = useExportShipment();

  const [activeDocType, setActiveDocType] = useState<DocumentType>("INVOICE");
  const [activePage, setActivePage] = useState(1);
  const [uploadingType, setUploadingType] = useState<DocumentType | null>(null);

  const byName = useMemo(() => new Map((detail?.extractedFields ?? []).map((f) => [f.fieldName, f])), [detail]);
  const byDocType = useMemo(() => new Map((detail?.shipment.documents ?? []).map((d) => [d.documentType, d])), [detail]);

  if (isLoading || !detail || !me?.user) {
    return (
      <div className="mx-auto max-w-7xl px-8 py-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-96 w-full" />
      </div>
    );
  }

  const { shipment, validationIssues, lineItems, approvals, auditLogs } = detail;
  const allUploaded = DOC_TYPES.every((t) => byDocType.has(t));
  const readOnly = shipment.status === "APPROVED";
  const activeDocument = byDocType.get(activeDocType);

  function handleNavigate(documentType: DocumentType, pageNumber: number) {
    setActiveDocType(documentType);
    setActivePage(pageNumber);
  }

  function handleUpload(documentType: DocumentType, file: File) {
    setUploadingType(documentType);
    uploadDoc.mutate(
      { documentType, file },
      {
        onSuccess: (res) => {
          if (res.warnings.length > 0) toast.warning(res.warnings[0]);
          else toast.success(`${documentType.replace(/_/g, " ")} uploaded`);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Upload failed"),
        onSettled: () => setUploadingType(null),
      },
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between border-b border-border bg-white px-8 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground">{shipment.shipmentNumber}</h1>
            <ShipmentStatusBadge status={shipment.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {shipment.supplier} &rarr; {shipment.importer}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => router.push("/dashboard")}>
            Back to dashboard
          </Button>
          {allUploaded && shipment.status === "DRAFT" && (
            <Button
              size="sm"
              disabled={process.isPending}
              onClick={() =>
                process.mutate(undefined, {
                  onSuccess: (res) => {
                    toast.success(`Extraction complete for ${res.processed.length}/3 documents`);
                    if (res.failed.length > 0) toast.error(`Failed to process: ${res.failed.join(", ")}`);
                  },
                  onError: (err) => toast.error(err instanceof ApiError ? err.message : "Processing failed"),
                })
              }
            >
              <PlayCircle className="size-4" />
              {process.isPending ? "Processing…" : "Process documents"}
            </Button>
          )}
          {shipment.status === "APPROVED" && (
            <Button
              size="sm"
              disabled={exportShipment.isPending}
              onClick={() => exportShipment.mutate({ shipmentId: id, shipmentNumber: shipment.shipmentNumber })}
            >
              <Download className="size-4" />
              Export XLSX
            </Button>
          )}
        </div>
      </div>

      {!allUploaded && (
        <div className="grid grid-cols-1 gap-3 border-b border-border bg-surface-muted px-8 py-4 sm:grid-cols-3">
          {DOC_TYPES.map((type) => (
            <DocumentDropzone
              key={type}
              documentType={type}
              document={byDocType.get(type)}
              isUploading={uploadingType === type}
              onUpload={(file) => handleUpload(type, file)}
            />
          ))}
        </div>
      )}

      {allUploaded && (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex w-[45%] flex-col border-r border-border">
            <div className="flex gap-1 border-b border-border bg-white px-3 py-2">
              {DOC_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    setActiveDocType(type);
                    setActivePage(1);
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    activeDocType === type ? "bg-navy-900 text-white" : "text-muted-foreground hover:bg-surface-muted"
                  }`}
                >
                  {type.replace(/_/g, " ")}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-hidden">
              {activeDocument ? (
                <DocumentViewer
                  key={activeDocument.id}
                  documentId={activeDocument.id}
                  mimeType={activeDocument.mimeType}
                  filename={activeDocument.originalFilename}
                  pageCount={activeDocument.pageCount}
                  page={activePage}
                  onPageChange={setActivePage}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No document</div>
              )}
            </div>
          </div>

          <div className="w-[55%] overflow-y-auto px-6 py-4">
            <Tabs defaultValue="review">
              <TabsList>
                <TabsTrigger value="review">Review</TabsTrigger>
                <TabsTrigger value="validation">
                  Validation {validationIssues.filter((i) => i.status === "OPEN").length > 0 && `(${validationIssues.filter((i) => i.status === "OPEN").length})`}
                </TabsTrigger>
                <TabsTrigger value="approval">Approval</TabsTrigger>
              </TabsList>

              <TabsContent value="review" className="flex flex-col gap-5">
                <FieldSection title="Parties & Shipment Details" fields={PARTY_FIELDS} byName={byName} shipmentId={id} readOnly={readOnly} onNavigate={handleNavigate} />
                <FieldSection title="Invoice Details" fields={INVOICE_FIELDS} byName={byName} shipmentId={id} readOnly={readOnly} onNavigate={handleNavigate} />
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Line Items</h3>
                  <LineItemsTable lineItems={lineItems} />
                </div>
                <FieldSection title="Packaging & Weights" fields={PACKAGING_FIELDS} byName={byName} shipmentId={id} readOnly={readOnly} onNavigate={handleNavigate} />
                <FieldSection title="Containers" fields={CONTAINER_FIELDS} byName={byName} shipmentId={id} readOnly={readOnly} onNavigate={handleNavigate} />
              </TabsContent>

              <TabsContent value="validation">
                <ValidationPanel shipmentId={id} issues={validationIssues} readOnly={readOnly} />
              </TabsContent>

              <TabsContent value="approval">
                <ApprovalPanel shipment={shipment} approvals={approvals} auditLogs={auditLogs} currentUser={me.user} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  );
}
