"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Loader2, UploadCloud } from "lucide-react";
import { ACCEPTED_MIME_TYPES, MAX_UPLOAD_BYTES, type DocumentType } from "@cargolens/shared";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { apiFileUrl } from "@/lib/api-client";
import type { DocumentDto } from "@/types/shipment";
import { DocumentStatusBadge } from "@/components/domain/status-badge";

const LABELS: Record<DocumentType, string> = {
  INVOICE: "Commercial Invoice",
  PACKING_LIST: "Packing List",
  BILL_OF_LADING: "Bill of Lading",
};

export function DocumentDropzone({
  documentType,
  document,
  onUpload,
  isUploading,
}: {
  documentType: DocumentType;
  document?: DocumentDto;
  onUpload: (file: File) => void;
  isUploading: boolean;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function validateAndUpload(file: File) {
    if (!ACCEPTED_MIME_TYPES.includes(file.type as (typeof ACCEPTED_MIME_TYPES)[number])) {
      toast.error(`${file.name}: unsupported file type. Use PDF, JPG or PNG.`);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`${file.name}: file too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB).`);
      return;
    }
    onUpload(file);
  }

  return (
    <div
      data-testid={`dropzone-${documentType}`}
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-dashed p-4 transition-colors",
        isDragOver ? "border-navy-700 bg-navy-50" : "border-border bg-white",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) validateAndUpload(file);
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{LABELS[documentType]}</span>
        {document && <DocumentStatusBadge status={document.processingStatus} />}
      </div>

      {document ? (
        <div className="flex items-center justify-between rounded-md bg-surface-muted px-3 py-2 text-sm">
          <a href={apiFileUrl(`/documents/${document.id}/file`)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-navy-900 hover:underline">
            <CheckCircle2 className="size-4 text-teal-600" />
            <span className="max-w-[14rem] truncate">{document.originalFilename}</span>
          </a>
          <span className="text-xs text-muted-foreground">{(document.fileSize / 1024).toFixed(0)} KB{document.pageCount ? ` · ${document.pageCount}p` : ""}</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-4 text-center text-muted-foreground">
          <UploadCloud className="size-6" strokeWidth={1.5} />
          <p className="text-xs">Drag and drop, or</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_MIME_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) validateAndUpload(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted disabled:opacity-50"
      >
        {isUploading && <Loader2 className="size-3.5 animate-spin" />}
        {isUploading ? "Uploading…" : document ? "Replace file" : "Choose file"}
      </button>
    </div>
  );
}
