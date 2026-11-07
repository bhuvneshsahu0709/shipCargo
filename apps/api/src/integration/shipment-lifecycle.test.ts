import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../db/prisma.js";
import { hashPassword } from "../lib/password.js";

const MINIMAL_PDF = Buffer.from(
  `%PDF-1.1
1 0 obj  << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj  << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj  << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj
trailer  << /Root 1 0 R /Size 4 >>
%%EOF`,
);

const app = createApp();

let executiveCookie: string;
let managerCookie: string;
let managerId: string;

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  const cookie = res.headers["set-cookie"];
  return Array.isArray(cookie) ? cookie[0]! : (cookie as unknown as string);
}

beforeAll(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.validationIssue.deleteMany();
  await prisma.lineItem.deleteMany();
  await prisma.extractedField.deleteMany();
  await prisma.extraction.deleteMany();
  await prisma.document.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.create({
    data: { name: "Test Executive", email: "exec@test.local", passwordHash: await hashPassword("TestExec123!"), role: "EXECUTIVE" },
  });
  const manager = await prisma.user.create({
    data: { name: "Test Manager", email: "manager@test.local", passwordHash: await hashPassword("TestManager123!"), role: "MANAGER" },
  });
  managerId = manager.id;

  executiveCookie = await login("exec@test.local", "TestExec123!");
  managerCookie = await login("manager@test.local", "TestManager123!");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("auth", () => {
  it("rejects an invalid password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "exec@test.local", password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("rejects unauthenticated requests to protected routes", async () => {
    const res = await request(app).get("/api/shipments");
    expect(res.status).toBe(401);
  });

  it("returns 401 (not a 500) for a validly-signed session whose user no longer exists in the database", async () => {
    const user = await prisma.user.create({
      data: { name: "Ephemeral User", email: `ephemeral-${Date.now()}@test.local`, passwordHash: await hashPassword("Ephemeral123!"), role: "EXECUTIVE" },
    });
    const cookie = await login(user.email, "Ephemeral123!");

    await prisma.user.delete({ where: { id: user.id } });

    const res = await request(app)
      .post("/api/shipments")
      .set("Cookie", cookie)
      .send({ shipmentNumber: `SHP-STALE-${Date.now()}`, supplier: "S", importer: "I" });
    expect(res.status).toBe(401);
  });
});

describe("role authorization", () => {
  it("forbids an executive from approving a shipment", async () => {
    const res = await request(app).post("/api/shipments/any-id/approve").set("Cookie", executiveCookie).send({});
    expect(res.status).toBe(403);
  });

  it("lets a manager reach the approval endpoint's business logic and 404s on an unknown shipment", async () => {
    const res = await request(app).post("/api/shipments/does-not-exist/approve").set("Cookie", managerCookie).send({});
    expect(res.status).toBe(404);
  });
});

describe("export restrictions", () => {
  it("blocks export of a shipment that is not approved", async () => {
    const createRes = await request(app)
      .post("/api/shipments")
      .set("Cookie", executiveCookie)
      .send({ shipmentNumber: `SHP-TEST-EXPORT-${Date.now()}`, supplier: "Test Supplier", importer: "Test Importer" });
    expect(createRes.status).toBe(201);
    const shipmentId = createRes.body.shipment.id;

    const exportRes = await request(app).get(`/api/shipments/${shipmentId}/export`).set("Cookie", managerCookie);
    expect(exportRes.status).toBe(409);
  });
});

describe("approval state machine", () => {
  it("rejects approval of a shipment that is not ready for approval", async () => {
    const createRes = await request(app)
      .post("/api/shipments")
      .set("Cookie", executiveCookie)
      .send({ shipmentNumber: `SHP-TEST-NOTREADY-${Date.now()}`, supplier: "Test Supplier", importer: "Test Importer" });
    const shipmentId = createRes.body.shipment.id;

    const approveRes = await request(app).post(`/api/shipments/${shipmentId}/approve`).set("Cookie", managerCookie).send({});
    expect(approveRes.status).toBe(409);
  });

  it("prevents a manager from approving their own assigned shipment", async () => {
    const shipmentNumber = `SHP-TEST-SELFAPPROVE-${Date.now()}`;
    const shipment = await prisma.shipment.create({
      data: { shipmentNumber, supplier: "S", importer: "I", assignedExecutiveId: managerId, status: "READY_FOR_APPROVAL" },
    });

    const approveRes = await request(app).post(`/api/shipments/${shipment.id}/approve`).set("Cookie", managerCookie).send({});
    expect(approveRes.status).toBe(403);
  });
});

describe("approved shipments are locked", () => {
  it("rejects field corrections, verification and new document uploads once a shipment is approved", async () => {
    const shipmentNumber = `SHP-TEST-LOCKED-${Date.now()}`;
    const shipment = await prisma.shipment.create({
      data: { shipmentNumber, supplier: "S", importer: "I", status: "APPROVED" },
    });
    const field = await prisma.extractedField.create({
      data: { shipmentId: shipment.id, fieldName: "supplierName", value: "S", verificationStatus: "VERIFIED" },
    });

    const correctRes = await request(app)
      .patch(`/api/shipments/${shipment.id}/fields/${field.id}`)
      .set("Cookie", executiveCookie)
      .send({ value: "Changed" });
    expect(correctRes.status).toBe(409);

    const verifyRes = await request(app)
      .post(`/api/shipments/${shipment.id}/fields/${field.id}/verify`)
      .set("Cookie", executiveCookie)
      .send({ verified: true });
    expect(verifyRes.status).toBe(409);

    const uploadRes = await request(app)
      .post(`/api/shipments/${shipment.id}/documents`)
      .set("Cookie", executiveCookie)
      .field("documentType", "INVOICE")
      .attach("file", MINIMAL_PDF, { filename: "invoice.pdf", contentType: "application/pdf" });
    expect(uploadRes.status).toBe(409);

    const processRes = await request(app).post(`/api/shipments/${shipment.id}/process`).set("Cookie", executiveCookie);
    expect(processRes.status).toBe(409);
  });
});

describe("full happy path via the API", () => {
  it("creates, uploads, extracts, verifies, approves and exports a shipment", async () => {
    const shipmentNumber = `SHP-TEST-HAPPY-${Date.now()}`;
    const createRes = await request(app)
      .post("/api/shipments")
      .set("Cookie", executiveCookie)
      .send({ shipmentNumber, supplier: "Integration Supplier", importer: "Integration Importer" });
    expect(createRes.status).toBe(201);
    const shipmentId = createRes.body.shipment.id;

    for (const documentType of ["INVOICE", "PACKING_LIST", "BILL_OF_LADING"]) {
      const uploadRes = await request(app)
        .post(`/api/shipments/${shipmentId}/documents`)
        .set("Cookie", executiveCookie)
        .field("documentType", documentType)
        .attach("file", MINIMAL_PDF, { filename: `${documentType}.pdf`, contentType: "application/pdf" });
      expect(uploadRes.status).toBe(201);
    }

    const processRes = await request(app).post(`/api/shipments/${shipmentId}/process`).set("Cookie", executiveCookie);
    expect(processRes.status).toBe(200);
    expect(processRes.body.processed).toHaveLength(3);

    const detailRes = await request(app).get(`/api/shipments/${shipmentId}`).set("Cookie", executiveCookie);
    expect(detailRes.status).toBe(200);

    for (const f of detailRes.body.extractedFields) {
      if (f.verificationStatus === "UNVERIFIED") {
        const verifyRes = await request(app)
          .post(`/api/shipments/${shipmentId}/fields/${f.id}/verify`)
          .set("Cookie", executiveCookie)
          .send({ verified: true });
        expect(verifyRes.status).toBe(200);
      }
    }

    const lineItems = detailRes.body.lineItems;
    expect(lineItems.length).toBeGreaterThan(0);
    const correctRes = await request(app)
      .patch(`/api/shipments/${shipmentId}/line-items/${lineItems[0].id}`)
      .set("Cookie", executiveCookie)
      .send({
        description: "Corrected description",
        hsnCode: lineItems[0].hsnCode,
        quantity: lineItems[0].quantity,
        unit: lineItems[0].unit,
        unitPrice: lineItems[0].unitPrice,
        lineTotal: lineItems[0].lineTotal,
        countryOfOrigin: lineItems[0].countryOfOrigin,
        note: "Fixed via integration test",
      });
    expect(correctRes.status).toBe(200);
    expect(correctRes.body.lineItem.verificationStatus).toBe("CORRECTED");
    expect(correctRes.body.lineItem.description).toBe("Corrected description");

    for (const li of lineItems.slice(1)) {
      if (li.verificationStatus === "UNVERIFIED") {
        const verifyLineRes = await request(app)
          .post(`/api/shipments/${shipmentId}/line-items/${li.id}/verify`)
          .set("Cookie", executiveCookie)
          .send({ verified: true });
        expect(verifyLineRes.status).toBe(200);
      }
    }

    // A re-run of extraction must not clobber the correction just made.
    const reprocessRes = await request(app).post(`/api/shipments/${shipmentId}/process`).set("Cookie", executiveCookie);
    expect(reprocessRes.status).toBe(200);
    const afterReprocess = await request(app).get(`/api/shipments/${shipmentId}`).set("Cookie", executiveCookie);
    const correctedLine = afterReprocess.body.lineItems.find((li: { id: string }) => li.id === lineItems[0].id);
    expect(correctedLine.description).toBe("Corrected description");
    expect(correctedLine.verificationStatus).toBe("CORRECTED");

    const validationRes = await request(app).get(`/api/shipments/${shipmentId}/validation`).set("Cookie", executiveCookie);
    for (const issue of validationRes.body.issues) {
      if (issue.status === "OPEN") {
        const resolveRes = await request(app)
          .patch(`/api/validation/${issue.id}/resolve`)
          .set("Cookie", executiveCookie)
          .send({ status: "ACCEPTED_EXCEPTION", resolutionNote: "Integration test acceptance." });
        expect(resolveRes.status).toBe(200);
      }
    }

    const readyDetail = await request(app).get(`/api/shipments/${shipmentId}`).set("Cookie", executiveCookie);
    expect(readyDetail.body.shipment.status).toBe("READY_FOR_APPROVAL");

    const approveRes = await request(app).post(`/api/shipments/${shipmentId}/approve`).set("Cookie", managerCookie).send({});
    expect(approveRes.status).toBe(200);

    const exportRes = await request(app).get(`/api/shipments/${shipmentId}/export`).set("Cookie", managerCookie);
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers["content-type"]).toContain("spreadsheetml");
  });
});
