import { describe, expect, it } from "vitest";
import type { DocumentExtractionResult } from "@cargolens/shared";
import { runValidationEngine } from "./validationEngine.js";

function field<T>(value: T | null, overrides: Partial<{ confidence: number | null; sourceDocument: string | null; evidence: string | null; pageNumber: number | null }> = {}) {
  return {
    value,
    confidence: overrides.confidence ?? 0.9,
    sourceDocument: (overrides.sourceDocument as never) ?? null,
    evidence: overrides.evidence ?? null,
    pageNumber: overrides.pageNumber ?? 1,
  };
}

function baseDoc(documentType: DocumentExtractionResult["documentType"]): DocumentExtractionResult {
  return {
    documentType,
    pageCount: 1,
    provider: "test",
    model: "test",
    promptVersion: "test",
    shipmentFields: {
      shipmentId: field("SHP-1"),
      supplierName: field("Acme Supplier"),
      importerName: field("Acme Importer"),
      consignee: field(null),
      notifyParty: field(null),
      countryOfOrigin: field("China"),
      portOfLoading: field("Shanghai"),
      portOfDischarge: field("Nhava Sheva"),
      invoiceNumber: field("INV-1"),
      invoiceDate: field("2026-01-01"),
      currency: field("USD"),
      incoterm: field("FOB"),
    },
    lineItems: [
      {
        description: field("Widget"),
        hsnCode: field("12345678"),
        quantity: field(100),
        unit: field("PCS"),
        unitPrice: field(10),
        lineTotal: field(1000),
        countryOfOrigin: field("China"),
      },
    ],
    packaging: {
      numberOfPackages: field(10),
      packageType: field("Cartons"),
      netWeight: field(900),
      grossWeight: field(1000),
      weightUnit: field("KG"),
      containerNumbers: field(["ABCU1234567"]),
      sealNumbers: field(["SEAL1"]),
    },
  };
}

describe("runValidationEngine", () => {
  it("raises nothing when all three documents agree", () => {
    const issues = runValidationEngine({
      INVOICE: baseDoc("INVOICE"),
      PACKING_LIST: baseDoc("PACKING_LIST"),
      BILL_OF_LADING: baseDoc("BILL_OF_LADING"),
    });
    expect(issues).toHaveLength(0);
  });

  it("flags the canonical 45kg gross weight mismatch (brief example SHP-24811)", () => {
    const invoice = baseDoc("INVOICE");
    invoice.packaging.grossWeight = field(3120);
    const packingList = baseDoc("PACKING_LIST");
    packingList.packaging.grossWeight = field(3165);

    const issues = runValidationEngine({ INVOICE: invoice, PACKING_LIST: packingList });
    const weightIssue = issues.find((i) => i.ruleId === "GROSS_WEIGHT_MATCH");
    expect(weightIssue).toBeDefined();
    expect(weightIssue?.severity).toBe("CRITICAL");
    expect(weightIssue?.message).toContain("45");
  });

  it("does not flag weight differences within tolerance", () => {
    const invoice = baseDoc("INVOICE");
    invoice.packaging.grossWeight = field(1000);
    const packingList = baseDoc("PACKING_LIST");
    packingList.packaging.grossWeight = field(1004); // 0.4% diff, under the 0.5%/5kg threshold

    const issues = runValidationEngine({ INVOICE: invoice, PACKING_LIST: packingList });
    expect(issues.filter((i) => i.ruleId === "GROSS_WEIGHT_MATCH")).toHaveLength(0);
  });

  it("flags invoice arithmetic errors (quantity * unit price != line total)", () => {
    const invoice = baseDoc("INVOICE");
    invoice.lineItems[0]!.lineTotal = field(1500); // should be 1000

    const issues = runValidationEngine({ INVOICE: invoice });
    const arithmeticIssue = issues.find((i) => i.ruleId === "INVOICE_ARITHMETIC");
    expect(arithmeticIssue).toBeDefined();
    expect(arithmeticIssue?.severity).toBe("CRITICAL");
  });

  it("does not flag invoice arithmetic when a line total is missing", () => {
    const invoice = baseDoc("INVOICE");
    invoice.lineItems[0]!.lineTotal = field(null);

    const issues = runValidationEngine({ INVOICE: invoice });
    expect(issues.filter((i) => i.ruleId === "INVOICE_ARITHMETIC")).toHaveLength(0);
  });

  it("flags quantity mismatches between invoice and packing list", () => {
    const invoice = baseDoc("INVOICE");
    const packingList = baseDoc("PACKING_LIST");
    packingList.lineItems[0]!.quantity = field(90);

    const issues = runValidationEngine({ INVOICE: invoice, PACKING_LIST: packingList });
    const qtyIssue = issues.find((i) => i.ruleId === "QUANTITY_MATCH");
    expect(qtyIssue).toBeDefined();
    expect(qtyIssue?.message).toContain("100");
    expect(qtyIssue?.message).toContain("90");
  });

  it("flags package count mismatches across all three documents", () => {
    const invoice = baseDoc("INVOICE");
    const packingList = baseDoc("PACKING_LIST");
    const bol = baseDoc("BILL_OF_LADING");
    packingList.packaging.numberOfPackages = field(12);

    const issues = runValidationEngine({ INVOICE: invoice, PACKING_LIST: packingList, BILL_OF_LADING: bol });
    // Pairwise comparison: packing list (12) disagrees with both invoice (10) and BOL (10).
    expect(issues.filter((i) => i.ruleId === "PACKAGE_MATCH" && i.severity === "CRITICAL")).toHaveLength(2);
  });

  it("flags container number mismatches but not when one side simply lacks the data", () => {
    const packingList = baseDoc("PACKING_LIST");
    const bolWithDifferentContainer = baseDoc("BILL_OF_LADING");
    bolWithDifferentContainer.packaging.containerNumbers = field(["ZZZZ9999999"]);

    const mismatched = runValidationEngine({ PACKING_LIST: packingList, BILL_OF_LADING: bolWithDifferentContainer });
    expect(mismatched.some((i) => i.ruleId === "CONTAINER_MATCH")).toBe(true);

    const bolMissingContainer = baseDoc("BILL_OF_LADING");
    bolMissingContainer.packaging.containerNumbers = field(null);
    const notComparable = runValidationEngine({ PACKING_LIST: packingList, BILL_OF_LADING: bolMissingContainer });
    expect(notComparable.some((i) => i.ruleId === "CONTAINER_MATCH")).toBe(false);
  });

  it("flags supplier/importer name mismatches as warnings, not blocking criticals", () => {
    const invoice = baseDoc("INVOICE");
    const packingList = baseDoc("PACKING_LIST");
    packingList.shipmentFields.supplierName = field("Different Supplier Name Pvt Ltd");

    const issues = runValidationEngine({ INVOICE: invoice, PACKING_LIST: packingList });
    const partyIssue = issues.find((i) => i.ruleId === "PARTY_CONSISTENCY");
    expect(partyIssue).toBeDefined();
    expect(partyIssue?.severity).toBe("WARNING");
  });

  it("handles a shipment with only one document processed without throwing", () => {
    expect(() => runValidationEngine({ INVOICE: baseDoc("INVOICE") })).not.toThrow();
    expect(runValidationEngine({ INVOICE: baseDoc("INVOICE") })).toHaveLength(0);
  });
});
