import type { DocumentType } from "@cargolens/shared";

export const EXTRACTION_PROMPT_VERSION = "v1.2026-11-07";

const FIELD_SHAPE = `{"value": <string|number|array|null>, "confidence": <0..1|null>, "evidence": "<short supporting quote from the document, or null>", "pageNumber": <integer|null>}`;

export function buildExtractionPrompt(documentType: DocumentType): string {
  return `You are a customs documentation extraction engine. Read the attached ${documentType.replace(/_/g, " ").toLowerCase()} document image/PDF carefully.

Return ONLY valid JSON (no markdown fences, no commentary) matching this exact shape:

{
  "pageCount": <integer>,
  "shipmentFields": {
    "shipmentId": ${FIELD_SHAPE},
    "supplierName": ${FIELD_SHAPE},
    "importerName": ${FIELD_SHAPE},
    "consignee": ${FIELD_SHAPE},
    "notifyParty": ${FIELD_SHAPE},
    "countryOfOrigin": ${FIELD_SHAPE},
    "portOfLoading": ${FIELD_SHAPE},
    "portOfDischarge": ${FIELD_SHAPE},
    "invoiceNumber": ${FIELD_SHAPE},
    "invoiceDate": ${FIELD_SHAPE},
    "currency": ${FIELD_SHAPE},
    "incoterm": ${FIELD_SHAPE}
  },
  "lineItems": [
    {
      "description": ${FIELD_SHAPE},
      "hsnCode": ${FIELD_SHAPE},
      "quantity": ${FIELD_SHAPE},
      "unit": ${FIELD_SHAPE},
      "unitPrice": ${FIELD_SHAPE},
      "lineTotal": ${FIELD_SHAPE},
      "countryOfOrigin": ${FIELD_SHAPE}
    }
  ],
  "packaging": {
    "numberOfPackages": ${FIELD_SHAPE},
    "packageType": ${FIELD_SHAPE},
    "netWeight": ${FIELD_SHAPE},
    "grossWeight": ${FIELD_SHAPE},
    "weightUnit": ${FIELD_SHAPE},
    "containerNumbers": ${FIELD_SHAPE},
    "sealNumbers": ${FIELD_SHAPE}
  }
}

Rules:
- Only this document's type is "${documentType}" — set every field's "sourceDocument" implicitly to that (the caller fills it in).
- If a field is not present in this document, set "value" to null and "confidence" to null. Never invent a value.
- Do not guess illegible text; set value null instead and note it in evidence as "illegible".
- Omit a shipmentFields/packaging key entirely only if it is structurally absent from this document type; prefer null value over omission when the field is expected but missing.
- "quantity", "unitPrice", "lineTotal", "netWeight", "grossWeight", "numberOfPackages" must be numbers (no currency symbols or thousands separators).
- "confidence" reflects your certainty this is the correct field value as printed on the document, between 0 and 1.
- Line items: include one entry per distinct line item visible on the document; if this document type has no line items (e.g. a bill of lading), return an empty array.`;
}
