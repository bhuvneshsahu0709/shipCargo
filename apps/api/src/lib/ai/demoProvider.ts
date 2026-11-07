import type { DocumentExtractionResult, DocumentType } from "@cargolens/shared";
import { SEED_CATALOG, demoField } from "./seedCatalog.js";
import type { DocumentExtractionProvider, ExtractionInput } from "./types.js";

const DEMO_NOTE = "[DEMO] generated without OCR — configure GEMINI_API_KEY for real AI extraction";

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function synthesize(input: ExtractionInput, documentType: DocumentType): Omit<DocumentExtractionResult, "provider" | "model" | "promptVersion"> {
  // Seeded by shipmentNumber ALONE (not +documentType) so quantity/price/weight agree across
  // the invoice, packing list and bill of lading — only the deliberate drift below should differ.
  const rng = mulberry32(hashSeed(input.shipmentNumber));
  const qty = 50 + Math.floor(rng() * 950);
  const unitPrice = Math.round((5 + rng() * 95) * 100) / 100;
  const lineTotal = Math.round(qty * unitPrice * 100) / 100;
  const netWeight = Math.round((qty * (0.4 + rng() * 1.1)) * 10) / 10;
  // ~35% of synthetic shipments get an intentional invoice/packing-list gross-weight drift so the
  // validation engine has something real to catch even without seeded sample data.
  const injectDrift = hashSeed(input.shipmentNumber) % 100 < 35;
  const driftFactor = injectDrift && documentType === "PACKING_LIST" ? 1.015 : 1;
  const grossWeight = Math.round(netWeight * 1.08 * driftFactor * 10) / 10;

  const includeCommercial = documentType !== "BILL_OF_LADING";
  const container = `DEMU${1000000 + (hashSeed(input.shipmentNumber) % 8999999)}`;
  const seal = `SL${100000 + (hashSeed(input.shipmentNumber + "seal") % 899999)}`;

  return {
    documentType,
    pageCount: 1,
    shipmentFields: {
      shipmentId: demoField(input.shipmentNumber, 0.9, documentType, DEMO_NOTE, 1),
      supplierName: demoField(input.supplier, 0.88, documentType, DEMO_NOTE, 1),
      importerName: demoField(input.importer, 0.88, documentType, DEMO_NOTE, 1),
      consignee: demoField(input.importer, 0.82, documentType, DEMO_NOTE, 1),
      notifyParty: documentType === "INVOICE" ? demoField(null, null, null, null, null) : demoField("Generic Customs Brokers Pvt Ltd", 0.75, documentType, DEMO_NOTE, 1),
      countryOfOrigin: demoField("India", 0.7, documentType, DEMO_NOTE, 1),
      portOfLoading: demoField("Nhava Sheva (INNSA1)", 0.75, documentType, DEMO_NOTE, 1),
      portOfDischarge: demoField("Nhava Sheva (INNSA1)", 0.75, documentType, DEMO_NOTE, 1),
      invoiceNumber: includeCommercial ? demoField(`DEMO-INV-${hashSeed(input.shipmentNumber) % 10000}`, 0.85, documentType, DEMO_NOTE, 1) : demoField(null, null, null, null, null),
      invoiceDate: documentType === "INVOICE" ? demoField(new Date().toISOString().slice(0, 10), 0.8, documentType, DEMO_NOTE, 1) : demoField(null, null, null, null, null),
      currency: includeCommercial ? demoField("USD", 0.85, documentType, DEMO_NOTE, 1) : demoField(null, null, null, null, null),
      incoterm: documentType === "INVOICE" ? demoField("FOB", 0.8, documentType, DEMO_NOTE, 1) : demoField(null, null, null, null, null),
    },
    lineItems:
      documentType === "BILL_OF_LADING"
        ? []
        : [
            {
              description: demoField("Synthetic demo line item", 0.7, documentType, DEMO_NOTE, 1),
              hsnCode: demoField("00000000", 0.6, documentType, DEMO_NOTE, 1),
              quantity: demoField(qty, 0.85, documentType, DEMO_NOTE, 1),
              unit: demoField("PCS", 0.85, documentType, DEMO_NOTE, 1),
              unitPrice: includeCommercial && documentType === "INVOICE" ? demoField(unitPrice, 0.82, documentType, DEMO_NOTE, 1) : demoField(null, null, null, null, null),
              lineTotal: documentType === "INVOICE" ? demoField(lineTotal, 0.82, documentType, DEMO_NOTE, 1) : demoField(null, null, null, null, null),
              countryOfOrigin: demoField("India", 0.65, documentType, DEMO_NOTE, 1),
            },
          ],
    packaging: {
      numberOfPackages: demoField(Math.max(1, Math.round(qty / 20)), 0.78, documentType, DEMO_NOTE, 1),
      packageType: demoField("Cartons", 0.78, documentType, DEMO_NOTE, 1),
      netWeight: demoField(netWeight, 0.75, documentType, DEMO_NOTE, 1),
      grossWeight: demoField(grossWeight, 0.75, documentType, DEMO_NOTE, 1),
      weightUnit: demoField("KG", 0.9, documentType, DEMO_NOTE, 1),
      containerNumbers: demoField([container], 0.8, documentType, DEMO_NOTE, 1),
      sealNumbers: demoField([seal], 0.75, documentType, DEMO_NOTE, 1),
    },
  };
}

export class DemoExtractionProvider implements DocumentExtractionProvider {
  readonly name = "demo";
  readonly model = "deterministic-seed-v1";
  readonly promptVersion = "n/a";

  async extractInvoice(input: ExtractionInput) {
    return this.extract(input, "INVOICE");
  }
  async extractPackingList(input: ExtractionInput) {
    return this.extract(input, "PACKING_LIST");
  }
  async extractBillOfLading(input: ExtractionInput) {
    return this.extract(input, "BILL_OF_LADING");
  }

  private async extract(input: ExtractionInput, documentType: DocumentType): Promise<DocumentExtractionResult> {
    const seeded = SEED_CATALOG[input.shipmentNumber]?.[documentType];
    const base = seeded ?? synthesize(input, documentType);
    return { ...base, provider: this.name, model: this.model, promptVersion: this.promptVersion };
  }
}
