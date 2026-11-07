"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createShipmentRequestSchema, type CreateShipmentRequest, type DocumentType } from "@cargolens/shared";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentDropzone } from "@/components/domain/document-dropzone";
import { useCreateShipment, useProcessShipment, useShipmentDetail, useUploadDocument } from "@/lib/shipments";
import { ApiError } from "@/lib/api-client";

const DOC_TYPES: DocumentType[] = ["INVOICE", "PACKING_LIST", "BILL_OF_LADING"];

export default function NewShipmentPage() {
  const router = useRouter();
  const [shipmentId, setShipmentId] = useState<string | null>(null);
  const createShipment = useCreateShipment();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateShipmentRequest>({ resolver: zodResolver(createShipmentRequestSchema) });

  const onSubmit = handleSubmit((values) => {
    createShipment.mutate(values, {
      onSuccess: (res) => setShipmentId(res.shipment.id),
      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not create shipment"),
    });
  });

  if (shipmentId) {
    return <UploadStep shipmentId={shipmentId} onProcessed={() => router.push(`/shipments/${shipmentId}`)} />;
  }

  return (
    <div className="mx-auto max-w-xl px-8 py-8">
      <h1 className="text-xl font-semibold text-foreground">New Shipment</h1>
      <p className="mt-1 text-sm text-muted-foreground">Create a shipment record, then upload the three required documents.</p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Shipment details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="shipmentNumber">Shipment reference</Label>
              <Input id="shipmentNumber" placeholder="SHP-24900" {...register("shipmentNumber")} />
              {errors.shipmentNumber && <p className="text-xs text-red-600">{errors.shipmentNumber.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier">Supplier</Label>
              <Input id="supplier" placeholder="Supplier legal name" {...register("supplier")} />
              {errors.supplier && <p className="text-xs text-red-600">{errors.supplier.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="importer">Importer</Label>
              <Input id="importer" placeholder="Importer legal name" {...register("importer")} />
              {errors.importer && <p className="text-xs text-red-600">{errors.importer.message}</p>}
            </div>
            <Button type="submit" className="mt-2 self-start" disabled={createShipment.isPending}>
              {createShipment.isPending ? "Creating…" : "Create and continue to upload"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function UploadStep({ shipmentId, onProcessed }: { shipmentId: string; onProcessed: () => void }) {
  const { data, isLoading } = useShipmentDetail(shipmentId);
  const upload = useUploadDocument(shipmentId);
  const process = useProcessShipment(shipmentId);
  const [uploadingType, setUploadingType] = useState<DocumentType | null>(null);

  const documents = data?.shipment.documents ?? [];
  const byType = new Map(documents.map((d) => [d.documentType, d]));
  const allUploaded = DOC_TYPES.every((t) => byType.has(t));

  function handleUpload(documentType: DocumentType, file: File) {
    setUploadingType(documentType);
    upload.mutate(
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
    <div className="mx-auto max-w-2xl px-8 py-8">
      <h1 className="text-xl font-semibold text-foreground">Upload documents</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Shipment <span className="font-medium text-foreground">{data?.shipment.shipmentNumber ?? "…"}</span> needs all three documents before
        extraction can run.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {!isLoading &&
          DOC_TYPES.map((type) => (
            <DocumentDropzone
              key={type}
              documentType={type}
              document={byType.get(type)}
              isUploading={uploadingType === type}
              onUpload={(file) => handleUpload(type, file)}
            />
          ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button
          disabled={!allUploaded || process.isPending}
          onClick={() =>
            process.mutate(undefined, {
              onSuccess: () => {
                toast.success("Extraction started");
                onProcessed();
              },
              onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not start extraction"),
            })
          }
        >
          {process.isPending ? "Starting extraction…" : "Process documents"}
        </Button>
        {!allUploaded && <span className="text-xs text-muted-foreground">Upload all three documents to continue.</span>}
      </div>
    </div>
  );
}
