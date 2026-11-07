import { GoogleGenerativeAI } from "@google/generative-ai";
import { documentExtractionResultSchema, type DocumentExtractionResult, type DocumentType } from "@cargolens/shared";
import { env } from "../../config/env.js";
import { buildExtractionPrompt, EXTRACTION_PROMPT_VERSION } from "./prompt.js";
import { ExtractionProviderError, type DocumentExtractionProvider, type ExtractionInput } from "./types.js";

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 45_000;
const BASE_BACKOFF_MS = 1_500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1]! : trimmed;
}

function withSourceDocument(raw: unknown, documentType: DocumentType): unknown {
  if (raw === null || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;
  if ("value" in obj && "confidence" in obj) {
    return { ...obj, sourceDocument: obj.value === null ? null : documentType };
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = withSourceDocument(value, documentType);
  }
  return Array.isArray(raw) ? Object.values(out) : out;
}

export class GeminiExtractionProvider implements DocumentExtractionProvider {
  readonly name = "gemini";
  readonly model: string;
  readonly promptVersion = EXTRACTION_PROMPT_VERSION;
  private client: GoogleGenerativeAI;

  constructor() {
    if (!env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }
    this.client = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    this.model = env.GEMINI_MODEL;
  }

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
    const model = this.client.getGenerativeModel({
      model: this.model,
      generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
    });
    const prompt = buildExtractionPrompt(documentType);

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const result = await this.withTimeout(
          model.generateContent([
            { text: prompt },
            { inlineData: { mimeType: input.mimeType, data: input.fileBuffer.toString("base64") } },
          ]),
        );
        const text = stripCodeFence(result.response.text());
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          throw new ExtractionProviderError("SCHEMA_INVALID", "Gemini did not return valid JSON");
        }

        const withSources = withSourceDocument(json, documentType) as Record<string, unknown>;
        const candidate = {
          ...withSources,
          documentType,
          provider: this.name,
          model: this.model,
          promptVersion: this.promptVersion,
        };

        const parsed = documentExtractionResultSchema.safeParse(candidate);
        if (!parsed.success) {
          throw new ExtractionProviderError(
            "SCHEMA_INVALID",
            `Gemini output failed schema validation: ${parsed.error.message}`,
          );
        }
        return parsed.data;
      } catch (err) {
        lastError = err;
        const classification = this.classify(err);
        if (classification === "SCHEMA_INVALID" || attempt === MAX_ATTEMPTS) {
          break;
        }
        await sleep(BASE_BACKOFF_MS * attempt);
      }
    }

    if (lastError instanceof ExtractionProviderError) throw lastError;
    throw new ExtractionProviderError("PROVIDER_ERROR", `Gemini extraction failed: ${String(lastError)}`);
  }

  private classify(err: unknown): ExtractionProviderError["classification"] {
    if (err instanceof ExtractionProviderError) return err.classification;
    const message = String(err).toLowerCase();
    if (message.includes("timeout")) return "TIMEOUT";
    if (message.includes("429") || message.includes("rate")) return "RATE_LIMIT";
    return "PROVIDER_ERROR";
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new ExtractionProviderError("TIMEOUT", "Gemini request timed out")), TIMEOUT_MS)),
    ]);
  }
}
