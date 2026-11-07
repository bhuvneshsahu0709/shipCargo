"use client";

import { useAnalyticsAccuracy, useAnalyticsOverview } from "@/lib/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent, titleCase } from "@/lib/utils";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const { data: overview, isLoading: loadingOverview } = useAnalyticsOverview();
  const { data: accuracy, isLoading: loadingAccuracy } = useAnalyticsAccuracy();

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <h1 className="text-xl font-semibold text-foreground">Analytics</h1>
      <p className="mt-1 text-sm text-muted-foreground">{overview?.note ?? "Computed live from stored extraction and review records."}</p>

      {loadingOverview ? (
        <Skeleton className="mt-6 h-24 w-full" />
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Total Shipments" value={String(overview?.totalShipments ?? 0)} />
          <Stat label="Avg. Extraction Confidence" value={formatPercent(overview?.averageExtractionConfidence)} />
          <Stat label="Field Correction Rate" value={formatPercent(overview?.fieldCorrectionRate)} />
          <Stat
            label="Avg. Processing Time"
            value={overview?.averageProcessingTimeMs ? `${(overview.averageProcessingTimeMs / 1000).toFixed(1)}s` : "—"}
          />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Supplier-wise accuracy</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAccuracy && <Skeleton className="h-32 w-full" />}
            {!loadingAccuracy && accuracy?.supplierAccuracy.length === 0 && (
              <p className="text-sm text-muted-foreground">No supplier data yet.</p>
            )}
            <div className="flex flex-col gap-2">
              {accuracy?.supplierAccuracy.map((s) => (
                <div key={s.supplier} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{s.supplier}</span>
                  <span className="text-muted-foreground">
                    {formatPercent(s.accuracy)} <span className="text-xs">({s.sampleSize} fields)</span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Most frequently corrected fields</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAccuracy && <Skeleton className="h-32 w-full" />}
            {!loadingAccuracy && accuracy?.mostCorrectedFields.length === 0 && (
              <p className="text-sm text-muted-foreground">No corrections recorded yet.</p>
            )}
            <div className="flex flex-col gap-2">
              {accuracy?.mostCorrectedFields.map((f) => (
                <div key={f.fieldName} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{f.fieldName}</span>
                  <span className="text-muted-foreground">{f.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Validation failure frequency</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAccuracy && <Skeleton className="h-32 w-full" />}
            <div className="flex flex-col gap-2">
              {accuracy?.validationFailureFrequency.map((v) => (
                <div key={`${v.ruleId}-${v.severity}`} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    {titleCase(v.ruleId)} <span className="text-xs text-muted-foreground">({titleCase(v.severity)})</span>
                  </span>
                  <span className="text-muted-foreground">{v.count}</span>
                </div>
              ))}
              {accuracy?.validationFailureFrequency.length === 0 && <p className="text-sm text-muted-foreground">No validation issues recorded yet.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
