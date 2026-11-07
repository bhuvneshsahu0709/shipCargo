import { prisma } from "../db/prisma.js";

export async function getAnalyticsOverview() {
  const [totalShipments, byStatus, fieldStats, extractions] = await Promise.all([
    prisma.shipment.count(),
    prisma.shipment.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.extractedField.aggregate({ _avg: { confidence: true }, _count: { _all: true } }),
    prisma.extraction.findMany({ select: { createdAt: true, document: { select: { createdAt: true } } } }),
  ]);

  const correctedCount = await prisma.extractedField.count({ where: { verificationStatus: "CORRECTED" } });
  const verifiableCount = await prisma.extractedField.count({ where: { value: { not: null } } });

  const processingTimesMs = extractions
    .map((e) => e.createdAt.getTime() - e.document.createdAt.getTime())
    .filter((ms) => ms >= 0);
  const avgProcessingMs = processingTimesMs.length > 0 ? processingTimesMs.reduce((a, b) => a + b, 0) / processingTimesMs.length : null;

  return {
    totalShipments,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
    averageExtractionConfidence: fieldStats._avg.confidence,
    fieldCorrectionRate: verifiableCount > 0 ? correctedCount / verifiableCount : null,
    averageProcessingTimeMs: avgProcessingMs,
    isMeasured: true,
    note: "Computed live from stored extraction, correction and validation records — not simulated.",
  };
}

export async function getAnalyticsAccuracy() {
  const shipments = await prisma.shipment.findMany({
    select: { supplier: true, extractedFields: { select: { verificationStatus: true, fieldName: true } } },
  });

  const supplierMap = new Map<string, { total: number; corrected: number }>();
  const fieldCorrectionCounts = new Map<string, number>();

  for (const shipment of shipments) {
    const entry = supplierMap.get(shipment.supplier) ?? { total: 0, corrected: 0 };
    for (const field of shipment.extractedFields) {
      entry.total += 1;
      if (field.verificationStatus === "CORRECTED") {
        entry.corrected += 1;
        fieldCorrectionCounts.set(field.fieldName, (fieldCorrectionCounts.get(field.fieldName) ?? 0) + 1);
      }
    }
    supplierMap.set(shipment.supplier, entry);
  }

  const supplierAccuracy = [...supplierMap.entries()]
    .filter(([, v]) => v.total > 0)
    .map(([supplier, v]) => ({ supplier, accuracy: 1 - v.corrected / v.total, sampleSize: v.total }))
    .sort((a, b) => a.accuracy - b.accuracy);

  const mostCorrectedFields = [...fieldCorrectionCounts.entries()]
    .map(([fieldName, count]) => ({ fieldName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const validationByRule = await prisma.validationIssue.groupBy({ by: ["ruleId", "severity"], _count: { _all: true } });

  return {
    supplierAccuracy,
    mostCorrectedFields,
    validationFailureFrequency: validationByRule.map((v) => ({ ruleId: v.ruleId, severity: v.severity, count: v._count._all })),
    isMeasured: true,
  };
}
