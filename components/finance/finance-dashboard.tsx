"use client";

import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import type {
  FinanceSnapshot,
  FinanceTargetsResponse,
} from "@/lib/finance/types";
import { fetcher } from "@/lib/utils";
import { DatasetSummaryEmptyState } from "./dataset-summary-empty-state";
import { MonthlyBudgetDashboard } from "./monthly-budget-dashboard";

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
  const { data: targets } = useSWR<FinanceTargetsResponse>(
    `/api/finance/project/${projectId}/targets`,
    fetcher
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

  if (!targets) {
    return (
      <div className="space-y-4 p-4">
        <Card>
          <CardContent className="p-4 text-muted-foreground text-sm">
            Loading budget dashboard...
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <MonthlyBudgetDashboard
        projectId={projectId}
        snapshot={snapshot}
        targets={targets}
      />
    </div>
  );
}
