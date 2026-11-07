# CargoLens AI — Technical Design Document

**GitHub repository:** https://github.com/bhuvneshsahu0709/shipCargo
**Live application URL:** none; run locally per [`DEPLOYMENT.md`](DEPLOYMENT.md).

## 1. Architecture and rationale

Two-service architecture instead of a single Next.js full-stack app:

- **`apps/web`** — Next.js 16 (App Router), React 19, TypeScript. Owns presentation and client-side state only; every business rule runs server-side.
- **`apps/api`** — Express + Prisma + PostgreSQL. Owns authentication, file storage, the AI provider, the validation engine, and every write to the database.
- **`packages/shared`** — Zod schemas, TypeScript enums and inferred types used by both apps, compiled to `dist/` and consumed like any other npm package. This is the single source of truth for the shape of a `DocumentExtractionResult`, a `ShipmentStatus`, a login request, etc., so frontend and backend can never silently drift — a schema change is one edit, not two.

Why a separate Express backend rather than Next.js API routes: the brief explicitly asks for a REST API with Express + Prisma, and a brokerage document pipeline (file uploads, multi-step AI extraction, a rules engine, audit logging) benefits from being a distinct service with its own request lifecycle, middleware stack and test suite, independent of the frontend's render/caching model.

**Why the browser never calls the API cross-origin:** `apps/web/next.config.ts` rewrites `/api/*` to the Express origin. The browser only ever talks to one origin (`localhost:3000` in dev), so the httpOnly session cookie's `SameSite=Lax` works correctly for every request type, including the authenticated GET the PDF viewer makes to fetch document bytes. A naive two-origin setup with `credentials: "include"` would silently drop the cookie on several of these requests — this was caught and fixed during development, not assumed.

## 2. Data model

PostgreSQL via Prisma (`apps/api/prisma/schema.prisma`). Key design decision: **AI-extracted, human-corrected and approved values are different things, and the schema keeps them distinct.**

- **`User`** (`EXECUTIVE` | `MANAGER`), **`Shipment`**, **`Document`** (one row per required document type, unique per `(shipmentId, documentType)`, carries a `contentHash` for duplicate detection), **`Extraction`** (the raw + schema-validated AI response per document, with its own `processingStatus` so a failed document doesn't block the other two).
- **`ExtractedField`**: one row per shipment-level or packaging field (`fieldName` e.g. `supplierName`, `packaging.grossWeight`). Carries `originalValue` (what the AI said, preserved for audit) separately from `value` (what's currently approved for export — initially the same, overwritten only by a human correction), plus `confidence`, `sourceDocumentId`, `evidence`, `pageNumber` and a `verificationStatus` (`UNVERIFIED` / `VERIFIED` / `CORRECTED` / `MISSING`). Re-running extraction updates `originalValue` and confidence but **never overwrites a field a human has already corrected or verified** — see `mergeExtractedFields` in `extractionService.ts`.
- **`LineItem`**: one row per invoice/packing-list line, with its own `verificationStatus`/`correctionNote` mirroring `ExtractedField`. Re-extraction upserts by `(shipmentId, lineIndex)` and, like fields, never overwrites a line a human has already corrected or verified — even if a later re-extraction returns fewer or different rows (see `mergeLineItems` in `extractionService.ts`).
- **`ValidationIssue`**: one row per failed deterministic check, with `ruleId`, `severity`, the documents compared, the raw compared values, and a `status` (`OPEN` / `RESOLVED` / `ACCEPTED_EXCEPTION`) plus who resolved it and why. Re-running validation deletes and replaces only `OPEN` issues — a manager-accepted exception's history is never silently erased by a re-extraction.
- **`Approval`** and **`AuditLog`**: append-only. Every correction, verification, extraction run, document upload/replace/delete, validation resolution and approval decision is recorded with who/when/before/after.

## 3. AI pipeline

```
Upload → local/S3-compatible storage → multimodal AI extraction (page-count via pdf-lib)
  → Zod schema validation of the AI's JSON → per-field normalization
  → merge into ExtractedField/LineItem rows (never clobbering human corrections)
  → deterministic cross-document validation → human review → manager approval → XLSX export
```

`DocumentExtractionProvider` (`apps/api/src/lib/ai/types.ts`) is the abstraction: `extractInvoice` / `extractPackingList` / `extractBillOfLading`, each returning a `DocumentExtractionResult` validated against the shared Zod schema before it ever reaches the database. Two implementations:

- **`GeminiExtractionProvider`**: sends the file bytes + a prompt (versioned via `EXTRACTION_PROMPT_VERSION`) to the Gemini multimodal API, requests JSON output, strips code fences, re-attaches `sourceDocument` per field, validates against the shared schema, retries up to 3 times with backoff on timeout/rate-limit, and classifies failures (`TIMEOUT` / `RATE_LIMIT` / `SCHEMA_INVALID` / `PROVIDER_ERROR`) rather than swallowing them.
- **`DemoExtractionProvider`**: used automatically when `AI_PROVIDER=demo` or no `GEMINI_API_KEY` is set. For the two shipments named in the brief (`SHP-24811`, `SHP-24812`) it returns the exact seeded field values from the brief (including the 45kg gross-weight mismatch). For any other shipment it **deterministically synthesizes** plausible field values (seeded by a hash of the shipment number, so re-processing is idempotent) and labels every field's evidence string `"[DEMO] generated without OCR — configure GEMINI_API_KEY for real AI extraction"`. It is never presented as real AI output anywhere in the UI or API response — the `provider` field on every `Extraction` row is `"demo"`, and analytics never average demo and real confidences into a number that implies ground truth.

The pipeline never lets a raw model response reach the "approved" record directly: extraction writes `UNVERIFIED`/`MISSING` fields, and only a human action (`verify`/`correct`) or a manager's final approval changes that.

## 4. Validation logic

`apps/api/src/services/validationEngine.ts` is a pure function (`runValidationEngine(docs) => ValidationIssueDraft[]`) with no I/O, unit-tested in isolation (`validationEngine.test.ts`, 10 cases). Eight rule categories, each comparing only documents that both have the relevant data (a Bill of Lading legitimately lacking a net weight is not a discrepancy):

1. **Invoice arithmetic** — per line item, `quantity × unitPrice ≈ lineTotal` (tolerance: 1% or ₹0.50, whichever is larger). *Scope note:* the brief also mentions checking against a declared invoice subtotal/grand total; the extraction schema (deliberately, see §6) doesn't capture a separate "invoice total" header field, so this check is per-line only.
2. **Quantity match** — invoice vs. packing-list line items, matched by HSN code, then by normalized description, then by index as a last resort.
3. **Gross weight / 4. Net weight match** — pairwise across whichever of the three documents carry the field, tolerance `max(5kg, 0.5% of the larger value)`. This is calibrated so the brief's 3,120kg vs. 3,165kg example (1.4% / 45kg) is correctly flagged `CRITICAL`, while rounding noise under the threshold is not.
5. **Package match** — package count (exact match expected) and package type (fuzzy, `WARNING` only).
6. **Container match** — container and seal numbers compared as sets; only when both sides actually have the field populated.
7. **Party consistency** — supplier/importer name compared with light normalization (case, punctuation, whitespace); mismatches are `WARNING`, not blocking, since minor formatting differences across documents are common and not fraud signals.
8. **Currency/reference consistency** — invoice number cross-referenced between invoice and packing list, and shipment reference compared across all three documents.

A `CRITICAL` open issue blocks both "ready for approval" and export; a `WARNING` does not block but is visible. A manager (or the executive) can resolve an issue as `RESOLVED` (fixed at source) or `ACCEPTED_EXCEPTION` (documented and accepted) — either way the original discrepancy row and the resolution note are kept, never deleted.

## 5. Key UI decisions

- **Visual identity**: white/slate surfaces, a deep-navy sidebar and header accents, teal for verified/approved states, amber for warnings, red for blocking criticals — implemented as a handful of CSS custom properties in `globals.css`, not a sprawling design-token file, since the palette is small and stable.
- **The review workspace (`/shipments/[id]`) got the most engineering effort**, per the brief's explicit priority: a real `pdfjs-dist`-rendered split view (page navigation, zoom) on the left, editable field sections grouped by Parties/Invoice/Packaging/Containers on the right, each row showing confidence, source document + page, evidence text, and a verify checkbox. The line items table is editable the same way (row-level edit toggle, verify checkbox), not just the header/packaging fields. Clicking a field with evidence jumps the viewer to that document and page (`onNavigate`) — this only works because the viewer's `page` is a *controlled* prop owned by the parent, not local state, which was a deliberate refactor during development once the navigate-on-click requirement made local state the wrong owner.
- **Tabs, not five separate screens**, for Review / Validation / Approval on one shipment — the brief's screens 5–7 are really three views of the same shipment and switching between them shouldn't lose your place in the document viewer.
- All interactive primitives (dialog, tabs, select, checkbox, progress) are small Radix-based wrappers in `components/ui/`, not a vendored component library, to keep the bundle and the design surface exactly as large as this product needs.

## 6. Security and privacy

- Sessions are httpOnly, `SameSite=Lax` JWT cookies (not readable from JS); passwords are hashed with bcryptjs (12 rounds).
- Every shipment-scoped route requires authentication; approval/rejection additionally requires the `MANAGER` role (`requireRole` middleware), and `decideApproval` separately rejects a manager approving a shipment they are the assigned executive on — defense in depth beyond the role check.
- No public document URLs: documents are served through an authenticated `GET /documents/:id/file` route reading from the storage adapter, not a signed/static URL.
- Multer uses in-memory storage with a strict size limit and server-side MIME allowlist (PDF/JPG/PNG) — the client-side check in the dropzone is a UX nicety, not the real gate.
- Request logging (`pino-http`) explicitly serializes only method/URL and status code — request/response bodies (which can contain shipment financial data) are never logged.
- `helmet` is applied for standard security headers; the login endpoint is rate-limited.

## 7. Assumptions

- A documentation executive creates and owns a shipment; a documentation manager is a distinct person who did not do the data entry for the shipment they're approving.
- One invoice, one packing list and one bill of lading per shipment (the brief's model); multi-invoice shipments are out of scope.
- "Approved" is a terminal, locking state in this submission — an approved shipment's fields, line items, documents and validation issues are all read-only (enforced server-side, not just hidden in the UI) and it cannot be re-processed. Reverting an approval isn't modeled (only "Request Changes" before approval).
- Demo/synthetic data is always clearly labeled as such in the UI and never presented as a real accuracy claim.

## 8. Limitations

- Cross-document line-item quantity validation reads from the immutable `Extraction.structuredResponse`, not from the mutable `LineItem` table — so correcting a line item in the review workspace fixes the record but doesn't retroactively change a validation issue already raised against the original extracted quantity (re-run "Process documents" to revalidate against corrected source documents instead).
- No dedicated OCR fallback library (e.g. Tesseract) was integrated; Gemini's multimodal model handles scanned PDFs/images directly when configured, and the demo adapter doesn't attempt OCR at all (by design — it never claims to read the document).
- Confidence scores from the AI provider are estimates reported by the model, not statistically calibrated against a labeled ground-truth set — the brief asks explicitly not to overclaim here, and the analytics screen labels every number as "computed live from stored records," not validated accuracy.
- Local filesystem storage only; the `StorageAdapter` interface supports an S3 implementation but one wasn't written (see roadmap).
- No automated responsive/visual regression testing on actual tablet or mobile hardware — Tailwind responsive classes are used throughout, but desktop is the primary target per the brief and that's where verification effort went.
- Rate limiting is applied to login only, not to every mutation endpoint.

## 9. What was deliberately cut

- **Per-field (as opposed to per-line) correction tracking on line items.** Each `LineItem` row has one `verificationStatus`/`correctionNote`, not one per column the way `ExtractedField` tracks one row per field — correcting a line item's description doesn't individually flag just that column as human-owned, the whole row is marked `CORRECTED` and preserved as a unit on re-extraction. A fully granular per-cell model (mirroring `ExtractedField` exactly) was scoped out as lower value than shipping the row-level version end-to-end.
- **A separate OCR pipeline** (see Limitations).
- **An S3 storage adapter implementation** — the interface exists; only the local adapter was written, since local dev and this submission don't need object storage.
- **Multi-tenancy, org switching, SSO** — out of scope for a two-role brokerage desk brief.

## 10. Future roadmap

1. Per-cell line-item correction tracking, fully mirroring the shipment-level `ExtractedField` model.
2. An S3-compatible `StorageAdapter` implementation for multi-instance deployment.
3. A real OCR fallback (Tesseract) for environments without a Gemini key but with scanned-only documents.
4. Confidence calibration against a labeled sample set, with the measured calibration curve surfaced in analytics instead of raw model-reported confidence.
5. Webhook/notification on shipment status change (e.g. notify a manager when a shipment becomes ready for approval).
