import type { DocumentExtractionResult, DocumentType, ValidationRuleId, ValidationSeverity } from "@cargolens/shared";

export type ValidationIssueDraft = {
  ruleId: ValidationRuleId;
  category: string;
  severity: ValidationSeverity;
  documentsCompared: DocumentType[];
  comparedValues: Record<string, unknown>;
  difference: string | null;
  message: string;
};

export type ValidationInput = Partial<Record<DocumentType, DocumentExtractionResult>>;

const WEIGHT_TOLERANCE_PCT = 0.005;
const WEIGHT_TOLERANCE_ABS_KG = 5;
const LINE_TOTAL_TOLERANCE_PCT = 0.01;

function normalize(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.trim().toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ");
}

function weightsDiffer(a: number, b: number): boolean {
  const threshold = Math.max(WEIGHT_TOLERANCE_ABS_KG, WEIGHT_TOLERANCE_PCT * Math.max(a, b));
  return Math.abs(a - b) > threshold;
}

function pairDocuments(input: ValidationInput): [DocumentType, DocumentType][] {
  const present = (Object.keys(input) as DocumentType[]).filter((k) => input[k]);
  const pairs: [DocumentType, DocumentType][] = [];
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      pairs.push([present[i]!, present[j]!]);
    }
  }
  return pairs;
}

export function runValidationEngine(input: ValidationInput): ValidationIssueDraft[] {
  const issues: ValidationIssueDraft[] = [];

  issues.push(...checkInvoiceArithmetic(input));
  issues.push(...checkQuantities(input));
  issues.push(...checkWeights(input, "grossWeight", "GROSS_WEIGHT_MATCH", "Gross weight"));
  issues.push(...checkWeights(input, "netWeight", "NET_WEIGHT_MATCH", "Net weight"));
  issues.push(...checkPackages(input));
  issues.push(...checkContainers(input));
  issues.push(...checkParties(input));
  issues.push(...checkCurrencyAndReferenceNumbers(input));

  return issues;
}

function checkInvoiceArithmetic(input: ValidationInput): ValidationIssueDraft[] {
  const invoice = input.INVOICE;
  if (!invoice) return [];
  const issues: ValidationIssueDraft[] = [];

  invoice.lineItems.forEach((item, idx) => {
    const qty = item.quantity.value;
    const unitPrice = item.unitPrice.value;
    const lineTotal = item.lineTotal.value;
    if (qty === null || unitPrice === null || lineTotal === null) return;

    const expected = qty * unitPrice;
    const tolerance = Math.max(0.5, LINE_TOTAL_TOLERANCE_PCT * Math.max(expected, lineTotal));
    if (Math.abs(expected - lineTotal) > tolerance) {
      issues.push({
        ruleId: "INVOICE_ARITHMETIC",
        category: "Invoice arithmetic",
        severity: "CRITICAL",
        documentsCompared: ["INVOICE"],
        comparedValues: { lineIndex: idx, quantity: qty, unitPrice, declaredLineTotal: lineTotal, expectedLineTotal: Math.round(expected * 100) / 100 },
        difference: `${Math.round((lineTotal - expected) * 100) / 100}`,
        message: `Line ${idx + 1} ("${item.description.value ?? "unknown item"}"): declared total ${lineTotal} does not match quantity × unit price (${qty} × ${unitPrice} = ${Math.round(expected * 100) / 100}).`,
      });
    }
  });

  return issues;
}

function checkQuantities(input: ValidationInput): ValidationIssueDraft[] {
  const invoice = input.INVOICE;
  const packingList = input.PACKING_LIST;
  if (!invoice || !packingList) return [];
  const issues: ValidationIssueDraft[] = [];

  const matched = matchLineItems(invoice, packingList);
  for (const { invoiceItem, packingItem, index } of matched) {
    const invQty = invoiceItem?.quantity.value ?? null;
    const packQty = packingItem?.quantity.value ?? null;
    if (invQty === null || packQty === null) continue;
    if (invQty !== packQty) {
      issues.push({
        ruleId: "QUANTITY_MATCH",
        category: "Quantity comparison",
        severity: "CRITICAL",
        documentsCompared: ["INVOICE", "PACKING_LIST"],
        comparedValues: { lineIndex: index, invoiceQuantity: invQty, packingListQuantity: packQty },
        difference: `${packQty - invQty}`,
        message: `Line ${index + 1}: invoice shows ${invQty} units but packing list shows ${packQty} units.`,
      });
    }
  }
  return issues;
}

function matchLineItems(invoice: DocumentExtractionResult, packingList: DocumentExtractionResult) {
  return invoice.lineItems.map((invoiceItem, index) => {
    const byHsn = invoiceItem.hsnCode.value
      ? packingList.lineItems.find((p) => p.hsnCode.value && p.hsnCode.value === invoiceItem.hsnCode.value)
      : undefined;
    const byDescription =
      byHsn ??
      (invoiceItem.description.value
        ? packingList.lineItems.find((p) => normalize(p.description.value) === normalize(invoiceItem.description.value))
        : undefined);
    const packingItem = byDescription ?? packingList.lineItems[index];
    return { invoiceItem, packingItem, index };
  });
}

function checkWeights(
  input: ValidationInput,
  field: "grossWeight" | "netWeight",
  ruleId: ValidationRuleId,
  label: string,
): ValidationIssueDraft[] {
  const issues: ValidationIssueDraft[] = [];
  for (const [docA, docB] of pairDocuments(input)) {
    const a = input[docA]?.packaging[field]?.value;
    const b = input[docB]?.packaging[field]?.value;
    if (typeof a !== "number" || typeof b !== "number") continue;
    if (weightsDiffer(a, b)) {
      issues.push({
        ruleId,
        category: `${label} comparison`,
        severity: "CRITICAL",
        documentsCompared: [docA, docB],
        comparedValues: { [docA]: a, [docB]: b },
        difference: `${Math.round((b - a) * 100) / 100} kg`,
        message: `${label} mismatch: ${docA.replace(/_/g, " ")} shows ${a} kg, ${docB.replace(/_/g, " ")} shows ${b} kg (diff ${Math.abs(Math.round((b - a) * 100) / 100)} kg).`,
      });
    }
  }
  return issues;
}

function checkPackages(input: ValidationInput): ValidationIssueDraft[] {
  const issues: ValidationIssueDraft[] = [];
  for (const [docA, docB] of pairDocuments(input)) {
    const a = input[docA]?.packaging.numberOfPackages?.value;
    const b = input[docB]?.packaging.numberOfPackages?.value;
    if (typeof a === "number" && typeof b === "number" && a !== b) {
      issues.push({
        ruleId: "PACKAGE_MATCH",
        category: "Package count comparison",
        severity: "CRITICAL",
        documentsCompared: [docA, docB],
        comparedValues: { [docA]: a, [docB]: b },
        difference: `${b - a}`,
        message: `Package count mismatch: ${docA.replace(/_/g, " ")} shows ${a}, ${docB.replace(/_/g, " ")} shows ${b}.`,
      });
    }

    const typeA = normalize(input[docA]?.packaging.packageType?.value ?? null);
    const typeB = normalize(input[docB]?.packaging.packageType?.value ?? null);
    if (typeA && typeB && typeA !== typeB) {
      issues.push({
        ruleId: "PACKAGE_MATCH",
        category: "Package type comparison",
        severity: "WARNING",
        documentsCompared: [docA, docB],
        comparedValues: { [docA]: input[docA]?.packaging.packageType?.value, [docB]: input[docB]?.packaging.packageType?.value },
        difference: null,
        message: `Package type differs between ${docA.replace(/_/g, " ")} and ${docB.replace(/_/g, " ")}.`,
      });
    }
  }
  return issues;
}

function checkContainers(input: ValidationInput): ValidationIssueDraft[] {
  const issues: ValidationIssueDraft[] = [];
  for (const [docA, docB] of pairDocuments(input)) {
    for (const [field, label] of [
      ["containerNumbers", "Container numbers"],
      ["sealNumbers", "Seal numbers"],
    ] as const) {
      const a = input[docA]?.packaging[field]?.value;
      const b = input[docB]?.packaging[field]?.value;
      if (!a || !b || a.length === 0 || b.length === 0) continue;
      const setA = new Set(a.map((v) => v.toUpperCase().trim()));
      const setB = new Set(b.map((v) => v.toUpperCase().trim()));
      const onlyInA = [...setA].filter((v) => !setB.has(v));
      const onlyInB = [...setB].filter((v) => !setA.has(v));
      if (onlyInA.length > 0 || onlyInB.length > 0) {
        issues.push({
          ruleId: "CONTAINER_MATCH",
          category: label,
          severity: "CRITICAL",
          documentsCompared: [docA, docB],
          comparedValues: { [docA]: a, [docB]: b },
          difference: null,
          message: `${label} differ between ${docA.replace(/_/g, " ")} and ${docB.replace(/_/g, " ")}.`,
        });
      }
    }
  }
  return issues;
}

function checkParties(input: ValidationInput): ValidationIssueDraft[] {
  const issues: ValidationIssueDraft[] = [];
  for (const [docA, docB] of pairDocuments(input)) {
    for (const field of ["supplierName", "importerName"] as const) {
      const a = input[docA]?.shipmentFields[field]?.value ?? null;
      const b = input[docB]?.shipmentFields[field]?.value ?? null;
      if (!a || !b) continue;
      if (normalize(a) !== normalize(b)) {
        issues.push({
          ruleId: "PARTY_CONSISTENCY",
          category: `${field === "supplierName" ? "Supplier" : "Importer"} consistency`,
          severity: "WARNING",
          documentsCompared: [docA, docB],
          comparedValues: { [docA]: a, [docB]: b },
          difference: null,
          message: `${field === "supplierName" ? "Supplier" : "Importer"} name differs between ${docA.replace(/_/g, " ")} ("${a}") and ${docB.replace(/_/g, " ")} ("${b}").`,
        });
      }
    }
  }
  return issues;
}

function checkCurrencyAndReferenceNumbers(input: ValidationInput): ValidationIssueDraft[] {
  const issues: ValidationIssueDraft[] = [];
  const invoice = input.INVOICE;
  const packingList = input.PACKING_LIST;
  if (invoice && packingList) {
    const a = invoice.shipmentFields.invoiceNumber?.value ?? null;
    const b = packingList.shipmentFields.invoiceNumber?.value ?? null;
    if (a && b && normalize(a) !== normalize(b)) {
      issues.push({
        ruleId: "CURRENCY_DATE_CONSISTENCY",
        category: "Invoice reference consistency",
        severity: "WARNING",
        documentsCompared: ["INVOICE", "PACKING_LIST"],
        comparedValues: { INVOICE: a, PACKING_LIST: b },
        difference: null,
        message: `Invoice number referenced on the packing list ("${b}") does not match the invoice ("${a}").`,
      });
    }
  }

  for (const [docA, docB] of pairDocuments(input)) {
    const idA = input[docA]?.shipmentFields.shipmentId?.value ?? null;
    const idB = input[docB]?.shipmentFields.shipmentId?.value ?? null;
    if (idA && idB && normalize(idA) !== normalize(idB)) {
      issues.push({
        ruleId: "CURRENCY_DATE_CONSISTENCY",
        category: "Shipment reference consistency",
        severity: "WARNING",
        documentsCompared: [docA, docB],
        comparedValues: { [docA]: idA, [docB]: idB },
        difference: null,
        message: `Shipment reference differs between ${docA.replace(/_/g, " ")} ("${idA}") and ${docB.replace(/_/g, " ")} ("${idB}").`,
      });
    }
  }

  return issues;
}
