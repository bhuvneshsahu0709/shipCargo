import ExcelJS from "exceljs";
import { isArrayValueField } from "@cargolens/shared";
import { prisma } from "../db/prisma.js";
import { ConflictError, NotFoundError } from "../lib/errors.js";

function parseFieldValue(fieldName: string, value: string | null): string {
  if (value === null) return "";
  if (isArrayValueField(fieldName)) {
    try {
      return (JSON.parse(value) as string[]).join(", ");
    } catch {
      return value;
    }
  }
  return value;
}

function labelFor(fieldName: string): string {
  const base = fieldName.startsWith("packaging.") ? fieldName.slice("packaging.".length) : fieldName;
  return base.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

export async function buildShipmentExport(shipmentId: string): Promise<ExcelJS.Buffer> {
  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw new NotFoundError("Shipment not found");
  if (shipment.status !== "APPROVED") {
    throw new ConflictError("Only approved shipments can be exported.");
  }

  const [fields, lineItems, issues] = await Promise.all([
    prisma.extractedField.findMany({ where: { shipmentId }, orderBy: { fieldName: "asc" } }),
    prisma.lineItem.findMany({ where: { shipmentId }, orderBy: { lineIndex: "asc" } }),
    prisma.validationIssue.findMany({ where: { shipmentId }, orderBy: { severity: "desc" } }),
  ]);

  const openCritical = issues.filter((i) => i.status === "OPEN" && i.severity === "CRITICAL");
  if (openCritical.length > 0) {
    throw new ConflictError(`Cannot export: ${openCritical.length} unresolved blocking discrepancy(ies) remain.`);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CargoLens AI";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Shipment Summary");
  summary.columns = [
    { header: "Field", key: "field", width: 28 },
    { header: "Value", key: "value", width: 50 },
  ];
  summary.addRows([
    { field: "Shipment Number", value: shipment.shipmentNumber },
    { field: "Supplier", value: shipment.supplier },
    { field: "Importer", value: shipment.importer },
    { field: "Status", value: shipment.status },
    { field: "Created At", value: shipment.createdAt.toISOString() },
    { field: "Updated At", value: shipment.updatedAt.toISOString() },
  ]);
  summary.getRow(1).font = { bold: true };

  const shipmentFields = workbook.addWorksheet("Invoice Details");
  shipmentFields.columns = [
    { header: "Field", key: "field", width: 24 },
    { header: "Value", key: "value", width: 40 },
    { header: "Confidence", key: "confidence", width: 12 },
    { header: "Verification Status", key: "status", width: 18 },
  ];
  for (const f of fields.filter((f) => !f.fieldName.startsWith("packaging."))) {
    shipmentFields.addRow({
      field: labelFor(f.fieldName),
      value: parseFieldValue(f.fieldName, f.value),
      confidence: f.confidence ?? "",
      status: f.verificationStatus,
    });
  }
  shipmentFields.getRow(1).font = { bold: true };

  const lineItemSheet = workbook.addWorksheet("Line Items");
  lineItemSheet.columns = [
    { header: "#", key: "idx", width: 6 },
    { header: "Description", key: "description", width: 32 },
    { header: "HSN Code", key: "hsnCode", width: 14 },
    { header: "Quantity", key: "quantity", width: 12 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Unit Price", key: "unitPrice", width: 14 },
    { header: "Line Total", key: "lineTotal", width: 14 },
    { header: "Country of Origin", key: "countryOfOrigin", width: 18 },
  ];
  lineItems.forEach((item, idx) => {
    lineItemSheet.addRow({
      idx: idx + 1,
      description: item.description ?? "",
      hsnCode: item.hsnCode ?? "",
      quantity: item.quantity ?? "",
      unit: item.unit ?? "",
      unitPrice: item.unitPrice ?? "",
      lineTotal: item.lineTotal ?? "",
      countryOfOrigin: item.countryOfOrigin ?? "",
    });
  });
  lineItemSheet.getRow(1).font = { bold: true };

  const packagingSheet = workbook.addWorksheet("Packaging");
  packagingSheet.columns = [
    { header: "Field", key: "field", width: 24 },
    { header: "Value", key: "value", width: 40 },
  ];
  for (const f of fields.filter((f) => f.fieldName.startsWith("packaging."))) {
    packagingSheet.addRow({ field: labelFor(f.fieldName), value: parseFieldValue(f.fieldName, f.value) });
  }
  packagingSheet.getRow(1).font = { bold: true };

  const validationSheet = workbook.addWorksheet("Validation Status");
  validationSheet.columns = [
    { header: "Rule", key: "rule", width: 26 },
    { header: "Category", key: "category", width: 26 },
    { header: "Severity", key: "severity", width: 12 },
    { header: "Message", key: "message", width: 60 },
    { header: "Status", key: "status", width: 18 },
    { header: "Resolution Note", key: "note", width: 40 },
  ];
  for (const issue of issues) {
    validationSheet.addRow({
      rule: issue.ruleId,
      category: issue.category,
      severity: issue.severity,
      message: issue.message,
      status: issue.status,
      note: issue.resolutionNote ?? "",
    });
  }
  validationSheet.getRow(1).font = { bold: true };

  return workbook.xlsx.writeBuffer();
}
