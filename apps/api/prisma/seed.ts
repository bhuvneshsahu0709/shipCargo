import "dotenv/config";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { prisma } from "../src/db/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import { uploadShipmentDocument } from "../src/services/documentService.js";
import { processShipmentExtraction } from "../src/services/extractionService.js";
import { recomputeShipmentReadiness } from "../src/services/readinessService.js";
import { decideApproval } from "../src/services/approvalService.js";
import type { DocumentType } from "@cargolens/shared";

async function makeSyntheticPdf(lines: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let y = 780;
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 12, font });
    y -= 20;
  }
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function resetDatabase() {
  await prisma.auditLog.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.validationIssue.deleteMany();
  await prisma.lineItem.deleteMany();
  await prisma.extractedField.deleteMany();
  await prisma.extraction.deleteMany();
  await prisma.document.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.user.deleteMany();
}

async function createUsers() {
  const executive = await prisma.user.create({
    data: {
      name: "Priya Nair",
      email: "executive@cargolens.demo",
      passwordHash: await hashPassword("Executive123!"),
      role: "EXECUTIVE",
    },
  });
  const manager = await prisma.user.create({
    data: {
      name: "Arjun Mehta",
      email: "manager@cargolens.demo",
      passwordHash: await hashPassword("Manager123!"),
      role: "MANAGER",
    },
  });
  return { executive, manager };
}

async function uploadSyntheticDocuments(shipmentId: string, shipmentNumber: string, supplier: string, importer: string, uploadedById: string) {
  const docTypes: DocumentType[] = ["INVOICE", "PACKING_LIST", "BILL_OF_LADING"];
  for (const documentType of docTypes) {
    const buffer = await makeSyntheticPdf([
      `CargoLens AI — Synthetic Demo Document`,
      `Document Type: ${documentType.replace(/_/g, " ")}`,
      `Shipment Ref: ${shipmentNumber}`,
      `Supplier: ${supplier}`,
      `Importer: ${importer}`,
      "",
      "This is a seeded synthetic document for demo purposes.",
      "It is not a real customs document.",
    ]);
    await uploadShipmentDocument({
      shipmentId,
      documentType,
      file: { buffer, mimetype: "application/pdf", size: buffer.length, originalname: `${documentType.toLowerCase()}.pdf` },
      uploadedById,
    });
  }
}

async function main() {
  console.log("Seeding CargoLens AI demo data...");
  await resetDatabase();
  const { executive, manager } = await createUsers();

  // SHP-24811: Company B LED panels — the canonical 45kg gross-weight discrepancy example from the brief.
  const shp1 = await prisma.shipment.create({
    data: { shipmentNumber: "SHP-24811", supplier: "Company B Lighting Co., Ltd.", importer: "Nhava Sheva Importers Pvt Ltd", assignedExecutiveId: executive.id, status: "DRAFT" },
  });
  await uploadSyntheticDocuments(shp1.id, shp1.shipmentNumber, shp1.supplier, shp1.importer, executive.id);
  await processShipmentExtraction(shp1.id, executive.id);
  await recomputeShipmentReadiness(shp1.id);

  // SHP-24812: Company C steel valves — clean, fully reviewed and approved end-to-end.
  const shp2 = await prisma.shipment.create({
    data: { shipmentNumber: "SHP-24812", supplier: "Company C Valves AB", importer: "Konkan Industrial Supplies Pvt Ltd", assignedExecutiveId: executive.id, status: "DRAFT" },
  });
  await uploadSyntheticDocuments(shp2.id, shp2.shipmentNumber, shp2.supplier, shp2.importer, executive.id);
  await processShipmentExtraction(shp2.id, executive.id);
  await prisma.extractedField.updateMany({
    where: { shipmentId: shp2.id, verificationStatus: "UNVERIFIED" },
    data: { verificationStatus: "VERIFIED" },
  });
  await prisma.lineItem.updateMany({
    where: { shipmentId: shp2.id, verificationStatus: "UNVERIFIED" },
    data: { verificationStatus: "VERIFIED" },
  });
  await recomputeShipmentReadiness(shp2.id);
  await decideApproval({ shipmentId: shp2.id, managerId: manager.id, request: { decision: "APPROVED", comments: "Looks good, all fields verified and weights reconcile." } });

  // A few additional synthetic shipments for dashboard variety.
  const extras: { shipmentNumber: string; supplier: string; importer: string; uploadDocs: boolean; process: boolean }[] = [
    { shipmentNumber: "SHP-24850", supplier: "Baltic Timber Exports OU", importer: "Western Ghats Timber Traders LLP", uploadDocs: false, process: false },
    { shipmentNumber: "SHP-24855", supplier: "Anatolia Textiles San. Tic.", importer: "Surat Fabrics Import House", uploadDocs: true, process: false },
    { shipmentNumber: "SHP-24860", supplier: "Rhine Precision Tools GmbH", importer: "Pune Engineering Imports Pvt Ltd", uploadDocs: true, process: true },
  ];

  for (const extra of extras) {
    const shipment = await prisma.shipment.create({
      data: { shipmentNumber: extra.shipmentNumber, supplier: extra.supplier, importer: extra.importer, assignedExecutiveId: executive.id, status: "DRAFT" },
    });
    if (extra.uploadDocs) {
      const docTypes: DocumentType[] = extra.process ? ["INVOICE", "PACKING_LIST", "BILL_OF_LADING"] : ["INVOICE", "PACKING_LIST"];
      for (const documentType of docTypes) {
        const buffer = await makeSyntheticPdf([`CargoLens AI — Synthetic Demo Document`, `Document Type: ${documentType}`, `Shipment Ref: ${extra.shipmentNumber}`]);
        await uploadShipmentDocument({
          shipmentId: shipment.id,
          documentType,
          file: { buffer, mimetype: "application/pdf", size: buffer.length, originalname: `${documentType.toLowerCase()}.pdf` },
          uploadedById: executive.id,
        });
      }
    }
    if (extra.process) {
      await processShipmentExtraction(shipment.id, executive.id);
      await recomputeShipmentReadiness(shipment.id);
    }
  }

  console.log("Seed complete.");
  console.log("Demo logins:");
  console.log("  Executive: executive@cargolens.demo / Executive123!");
  console.log("  Manager:   manager@cargolens.demo / Manager123!");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
