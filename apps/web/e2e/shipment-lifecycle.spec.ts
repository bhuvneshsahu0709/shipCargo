import { test, expect } from "@playwright/test";

// The minimal valid single-page PDF fixture used for all three document uploads below.
// Content doesn't matter to the demo extraction adapter (it keys off the shipment number),
// but it must parse as a real PDF so pdf-lib's page-count step and the browser viewer succeed.
const MINIMAL_PDF = Buffer.from(
  `%PDF-1.1
1 0 obj  << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj  << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj  << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj
trailer  << /Root 1 0 R /Size 4 >>
%%EOF`,
);

function pdfFile(name: string) {
  return { name, mimeType: "application/pdf", buffer: MINIMAL_PDF };
}

async function loginAs(page: import("@playwright/test").Page, role: "executive" | "manager") {
  await page.goto("/login");
  await page.click(`text=${role === "executive" ? "Documentation Executive" : "Documentation Manager"}`);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

test("full shipment lifecycle: create -> upload -> extract -> correct -> verify -> approve -> export", async ({ page }) => {
  const shipmentNumber = `SHP-E2E-${Date.now()}`;

  await loginAs(page, "executive");

  // Create shipment
  await page.click("text=New Shipment");
  await page.fill("#shipmentNumber", shipmentNumber);
  await page.fill("#supplier", "E2E Test Supplier Ltd.");
  await page.fill("#importer", "E2E Test Importer Pvt Ltd");
  await page.click('button:has-text("Create and continue to upload")');

  // Upload all three required documents
  await page.waitForSelector('[data-testid="dropzone-INVOICE"]');
  await page.locator('[data-testid="dropzone-INVOICE"] input[type=file]').setInputFiles(pdfFile("invoice.pdf"));
  await expect(page.locator('[data-testid="dropzone-INVOICE"]')).toContainText("invoice.pdf");

  await page.locator('[data-testid="dropzone-PACKING_LIST"] input[type=file]').setInputFiles(pdfFile("packing-list.pdf"));
  await expect(page.locator('[data-testid="dropzone-PACKING_LIST"]')).toContainText("packing-list.pdf");

  await page.locator('[data-testid="dropzone-BILL_OF_LADING"] input[type=file]').setInputFiles(pdfFile("bol.pdf"));
  await expect(page.locator('[data-testid="dropzone-BILL_OF_LADING"]')).toContainText("bol.pdf");

  // Process (deterministic demo extraction)
  await page.click('button:has-text("Process documents")');
  await page.waitForURL("**/shipments/**");
  await page.waitForSelector("text=Parties & Shipment Details", { timeout: 15000 });

  // Correct the synthetic supplier name field
  const supplierRow = page.locator('[data-testid="field-supplierName"]');
  await supplierRow.getByLabel(/^Edit /).click();
  const supplierInput = supplierRow.getByLabel(/ value$/);
  await supplierInput.fill("E2E Corrected Supplier Name");
  await supplierRow.getByLabel("Save correction").click();
  await expect(supplierRow).toContainText("E2E Corrected Supplier Name");

  // Verify every remaining unverified field (skipping fields missing from the documents,
  // whose checkboxes are intentionally disabled) so the shipment can reach Ready for Approval.
  const unverifiedSelector = '[role="checkbox"][aria-checked="false"]:not([disabled])';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const checkbox = page.locator(unverifiedSelector).first();
    if ((await checkbox.count()) === 0) break;
    await checkbox.click();
    await page.waitForTimeout(150);
  }

  // Resolve any open validation issues as accepted exceptions (synthetic data can include a drift)
  await page.getByRole("tab", { name: /^Validation/ }).click();
  let resolveButton = page.getByRole("button", { name: "Resolve" });
  while (await resolveButton.count()) {
    await resolveButton.first().click();
    await page.getByLabel("Note").fill("E2E test: accepted for demo purposes.");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(200);
    resolveButton = page.getByRole("button", { name: "Resolve" });
  }

  await expect(page.locator("text=Needs Review").or(page.locator("text=Ready for Approval")).first()).toBeVisible();

  // Switch to the manager and approve
  await page.click("text=Log out");
  await page.waitForURL("**/login");
  await loginAs(page, "manager");
  await page.fill('input[placeholder*="Search"]', shipmentNumber);
  await page.click(`text=${shipmentNumber}`);

  await page.getByRole("tab", { name: "Approval" }).click();
  const approveButton = page.getByRole("button", { name: "Approve" });
  await expect(approveButton).toBeEnabled({ timeout: 10000 });
  await approveButton.click();
  await expect(page.locator("text=Approved").first()).toBeVisible();

  // Export the approved shipment
  const downloadPromise = page.waitForEvent("download");
  await page.click("text=Export XLSX");
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain(shipmentNumber);
});
