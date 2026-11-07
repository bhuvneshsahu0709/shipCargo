import { Router } from "express";
import multer from "multer";
import { uploadDocumentRequestSchema, MAX_UPLOAD_BYTES } from "@cargolens/shared";
import { prisma } from "../db/prisma.js";
import { storage } from "../lib/storage/index.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { deleteShipmentDocument, uploadShipmentDocument } from "../services/documentService.js";
import { assertShipmentEditable } from "../services/readinessService.js";
import { NotFoundError } from "../lib/errors.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

documentsRouter.post(
  "/shipments/:id/documents",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new NotFoundError("No file uploaded (expected multipart field 'file')");
    await assertShipmentEditable(req.params.id!);
    const { documentType } = uploadDocumentRequestSchema.parse(req.body);

    const result = await uploadShipmentDocument({
      shipmentId: req.params.id!,
      documentType,
      file: { buffer: req.file.buffer, mimetype: req.file.mimetype, size: req.file.size, originalname: req.file.originalname },
      uploadedById: req.user!.id,
    });

    res.status(201).json({
      document: result.document,
      warnings: result.isDuplicateContent ? ["This file's content is identical to a previously uploaded document."] : [],
      wasReplaced: result.wasReplaced,
    });
  }),
);

documentsRouter.get(
  "/shipments/:id/documents",
  asyncHandler(async (req, res) => {
    const documents = await prisma.document.findMany({ where: { shipmentId: req.params.id! }, orderBy: { createdAt: "asc" } });
    res.json({ documents });
  }),
);

documentsRouter.get(
  "/documents/:documentId/file",
  asyncHandler(async (req, res) => {
    const document = await prisma.document.findUnique({ where: { id: req.params.documentId! } });
    if (!document) throw new NotFoundError("Document not found");
    const buffer = await storage.get(document.storageKey);
    res.setHeader("Content-Type", document.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${document.originalFilename}"`);
    res.send(buffer);
  }),
);

documentsRouter.delete(
  "/documents/:documentId",
  asyncHandler(async (req, res) => {
    await deleteShipmentDocument(req.params.documentId!, req.user!.id);
    res.status(204).send();
  }),
);
