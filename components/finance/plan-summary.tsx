import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FINANCE_RECOMMENDATION_LOOKBACK_MONTHS } from "@/lib/finance/config";
import type {
  FinanceCashFlowSummary,
  FinancePlanSummary,
} from "@/lib/finance/types";

function formatCurrency(value: number | null) {
  if (value === null) {
    return "Not set";
  }

  return `$${value.toLocaleString()}`;
}

function formatSignedCurrency(value: number | null) {
  if (value === null) {
    return "Not set";
  }

  const formatted = `$${Math.abs(value).toLocaleString()}`;
  return value < 0 ? `-${formatted}` : formatted;
}

export function PlanSummary({
  cashFlowSummary,
  planSummary,
  projectId,
}: {
  cashFlowSummary: FinanceCashFlowSummary;
  planSummary: FinancePlanSummary;
  projectId: string;
}) {
  const targetNet =
    cashFlowSummary.totalMonthlyBudgetTarget !== null &&
    cashFlowSummary.totalMonthlyIncomeTarget !== null
      ? cashFlowSummary.totalMonthlyIncomeTarget -
        cashFlowSummary.totalMonthlyBudgetTarget
      : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Plan summary</CardTitle>
            <div className="text-muted-foreground text-sm">
              Overall budget targets are now separate from bucket-level
              allocations and the {FINANCE_RECOMMENDATION_LOOKBACK_MONTHS}-month
              recommendation pace.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{planSummary.mode}</Badge>
            <Button asChild size="sm" type="button" variant="outline">
              <Link href={`/project/${projectId}/budget`}>Edit budget</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl bg-muted/70 p-3">
            <div className="text-muted-foreground">Total monthly budget</div>
            <div className="font-semibold text-xl">
              {formatCurrency(cashFlowSummary.totalMonthlyBudgetTarget)}
            </div>
          </div>
          <div className="rounded-xl bg-muted/70 p-3">
            <div className="text-muted-foreground">Total monthly income</div>
            <div className="font-semibold text-xl">
              {formatCurrency(cashFlowSummary.totalMonthlyIncomeTarget)}
            </div>
          </div>
          <div className="rounded-xl bg-muted/70 p-3">
            <div className="text-muted-foreground">Category budgets set</div>
            <div className="font-semibold text-xl">
              {formatCurrency(cashFlowSummary.categoryBudgetTotal)}
            </div>
          </div>
          <div className="rounded-xl bg-muted/70 p-3">
            <div className="text-muted-foreground">Catch-all budget</div>
            <div className="font-semibold text-xl">
              {formatSignedCurrency(cashFlowSummary.catchAllBudget)}
            </div>
          </div>
          <div className="rounded-xl bg-muted/70 p-3">
            <div className="text-muted-foreground">
              {FINANCE_RECOMMENDATION_LOOKBACK_MONTHS}-mo suggested bucket pace
            </div>
            <div className="font-semibold text-xl">
              {formatCurrency(planSummary.totalMonthlyTarget)}
            </div>
          </div>
          <div className="rounded-xl bg-muted/70 p-3">
            <div className="text-muted-foreground">Historical spend</div>
            <div className="font-semibold text-xl">
              {formatCurrency(cashFlowSummary.historicalAverageMonthlySpend)}
            </div>
          </div>
          <div className="rounded-xl bg-muted/70 p-3">
            <div className="text-muted-foreground">Historical income</div>
            <div className="font-semibold text-xl">
              {formatCurrency(cashFlowSummary.historicalAverageMonthlyIncome)}
            </div>
          </div>
          <div className="rounded-xl bg-muted/70 p-3">
            <div className="text-muted-foreground">Suggested fixed</div>
            <div className="font-semibold">
              ${planSummary.totalsByGroup.fixed.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl bg-muted/70 p-3">
            <div className="text-muted-foreground">
              Suggested flexible + annual
            </div>
            <div className="font-semibold">
              $
              {(
                planSummary.totalsByGroup.flexible +
                planSummary.totalsByGroup.annual
              ).toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl bg-muted/70 p-3">
            <div className="text-muted-foreground">Target monthly net</div>
            <div className="font-semibold">
              {formatSignedCurrency(targetNet)}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
