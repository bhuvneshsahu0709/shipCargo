import { env } from "../../config/env.js";
import { DemoExtractionProvider } from "./demoProvider.js";
import { GeminiExtractionProvider } from "./geminiProvider.js";
import type { DocumentExtractionProvider } from "./types.js";

function createProvider(): DocumentExtractionProvider {
  if (env.AI_PROVIDER === "gemini" && env.GEMINI_API_KEY) {
    return new GeminiExtractionProvider();
  }
  return new DemoExtractionProvider();
}

export const extractionProvider: DocumentExtractionProvider = createProvider();
export type { DocumentExtractionProvider, ExtractionInput } from "./types.js";
export { ExtractionProviderError } from "./types.js";
