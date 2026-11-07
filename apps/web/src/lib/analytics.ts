"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api-client";

export type AnalyticsOverview = {
  totalShipments: number;
  byStatus: Record<string, number>;
  averageExtractionConfidence: number | null;
  fieldCorrectionRate: number | null;
  averageProcessingTimeMs: number | null;
  isMeasured: true;
  note: string;
};

export type AnalyticsAccuracy = {
  supplierAccuracy: { supplier: string; accuracy: number; sampleSize: number }[];
  mostCorrectedFields: { fieldName: string; count: number }[];
  validationFailureFrequency: { ruleId: string; severity: string; count: number }[];
  isMeasured: true;
};

export function useAnalyticsOverview() {
  return useQuery({ queryKey: ["analytics", "overview"], queryFn: () => apiGet<AnalyticsOverview>("/analytics/overview") });
}

export function useAnalyticsAccuracy() {
  return useQuery({ queryKey: ["analytics", "accuracy"], queryFn: () => apiGet<AnalyticsAccuracy>("/analytics/accuracy") });
}
