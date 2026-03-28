"use client";

import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import type { FinanceSnapshot } from "@/lib/finance/types";
import { fetcher } from "@/lib/utils";
import { CategoryDrilldown } from "./category-drilldown";
import { CumulativePaceChart } from "./cumulative-pace-chart";
import { DatasetSummaryEmptyState } from "./dataset-summary-empty-state";
import { MonthlySpendChart } from "./monthly-spend-chart";
import { PlanSummary } from "./plan-summary";

export function FinanceDashboard({
  projectId,
  initialSnapshot,
}: {
  projectId: string;
  initialSnapshot: FinanceSnapshot | null;
}) {
  const { data: snapshot } = useSWR<FinanceSnapshot>(
    `/api/finance/project/${projectId}`,
    fetcher,
    initialSnapshot ? { fallbackData: initialSnapshot } : undefined
  );

  if (!snapshot) {
    return (
      <div className="space-y-4 p-4">
        <Card>
          <CardContent className="p-4 text-muted-foreground text-sm">
            Loading finance snapshot...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (snapshot.status !== "ready" || !snapshot.planSummary) {
    return (
      <div className="space-y-4 p-4">
        <DatasetSummaryEmptyState snapshot={snapshot} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <PlanSummary planSummary={snapshot.planSummary} />
      <MonthlySpendChart data={snapshot.monthlyChart} />
      <CumulativePaceChart data={snapshot.cumulativeChart} />
      <CategoryDrilldown
        budgetBuckets={snapshot.planSummary.bucketTargets}
        categories={snapshot.categoryCards}
      />
    </div>
  );
}
