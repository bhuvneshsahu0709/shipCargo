import type { DocumentExtractionResult, DocumentType } from "@cargolens/shared";

export type ExtractionInput = {
  documentType: DocumentType;
  shipmentNumber: string;
  supplier: string;
  importer: string;
  fileBuffer: Buffer;
  mimeType: string;
  originalFilename: string;
};

export class ExtractionProviderError extends Error {
  classification: "TIMEOUT" | "RATE_LIMIT" | "SCHEMA_INVALID" | "PROVIDER_ERROR";
  constructor(classification: ExtractionProviderError["classification"], message: string) {
    super(message);
    this.classification = classification;
  }
}

export interface DocumentExtractionProvider {
  readonly name: string;
  readonly model: string;
  readonly promptVersion: string;
  extractInvoice(input: ExtractionInput): Promise<DocumentExtractionResult>;
  extractPackingList(input: ExtractionInput): Promise<DocumentExtractionResult>;
  extractBillOfLading(input: ExtractionInput): Promise<DocumentExtractionResult>;
}
