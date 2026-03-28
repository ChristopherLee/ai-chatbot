"use client";

import { Badge } from "@/components/ui/badge";

function formatCurrency(value: number | null) {
  if (value === null) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function SnapshotSummary({
  label,
  summary,
}: {
  label: string;
  summary: {
    status: string;
    includedOutflow: number | null;
    totalMonthlyTarget: number | null;
    trailingAverageSpend: number | null;
    topBuckets: Array<{
      bucket: string;
      group: string;
      monthlyTarget: number;
    }>;
  };
}) {
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-sm">{label}</div>
        <Badge variant="secondary">{summary.status}</Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-wide">
            Included Outflow
          </div>
          <div className="font-medium text-sm">
            {formatCurrency(summary.includedOutflow)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-wide">
            Monthly Target
          </div>
          <div className="font-medium text-sm">
            {formatCurrency(summary.totalMonthlyTarget)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-wide">
            Trailing Spend
          </div>
          <div className="font-medium text-sm">
            {formatCurrency(summary.trailingAverageSpend)}
          </div>
        </div>
      </div>

      {summary.topBuckets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.topBuckets.slice(0, 3).map((bucket) => (
            <Badge key={bucket.bucket} variant="outline">
              {bucket.bucket}: {formatCurrency(bucket.monthlyTarget)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function FinanceToolResult({
  result,
  type,
}: {
  result: any;
  type: "apply" | "refresh" | "snapshot";
}) {
  return (
    <div className="space-y-4 p-4 text-sm">
      {type === "apply" && (
        <>
          {Array.isArray(result.appliedActions) &&
            result.appliedActions.length > 0 && (
              <div className="space-y-2">
                <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Applied Changes
                </div>
                <div className="space-y-2">
                  {result.appliedActions.map((action: any, index: number) => (
                    <div
                      className="rounded-md border bg-background p-3"
                      key={`${action.summary}-${index}`}
                    >
                      <div className="font-medium">{action.summary}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-muted-foreground text-xs">
                        {action.matchedTransactions !== null && (
                          <Badge variant="secondary">
                            {action.matchedTransactions} matched
                          </Badge>
                        )}
                        {action.affectedOutflow !== null && (
                          <Badge variant="secondary">
                            {formatCurrency(action.affectedOutflow)} affected
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {Array.isArray(result.skippedActions) &&
            result.skippedActions.length > 0 && (
              <div className="space-y-2">
                <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Skipped Changes
                </div>
                <div className="space-y-2">
                  {result.skippedActions.map((item: any, index: number) => (
                    <div
                      className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900"
                      key={`${item.reason}-${index}`}
                    >
                      <div className="font-medium">
                        {item.action?.type ?? "finance_action"}
                      </div>
                      <div className="mt-1 text-xs">{item.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </>
      )}

      {type === "snapshot" && result.current && (
        <SnapshotSummary label="Current" summary={result.current} />
      )}

      {result.before && result.after && (
        <div className="grid gap-3 lg:grid-cols-2">
          <SnapshotSummary label="Before" summary={result.before} />
          <SnapshotSummary label="After" summary={result.after} />
        </div>
      )}
    </div>
  );
}
