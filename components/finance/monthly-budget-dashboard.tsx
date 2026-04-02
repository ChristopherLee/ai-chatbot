"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  FinanceCategoryCard,
  FinanceSnapshot,
  FinanceTargetsResponse,
} from "@/lib/finance/types";
import { roundCurrency, safeLower } from "@/lib/finance/utils";
import { cn } from "@/lib/utils";
import { MonthlySpendChart } from "./monthly-spend-chart";

type BudgetBreakdownRow = {
  label: string;
  budget: number | null;
  actual: number;
  variance: number | null;
  progressPercent: number;
  isCatchAll: boolean;
};

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

  const formatted = formatCurrency(Math.abs(value));
  return value < 0 ? `-${formatted}` : formatted;
}

function formatSpendSummary({
  actual,
  budget,
}: {
  actual: number;
  budget: number | null;
}) {
  if (budget === null) {
    return `Spent ${formatCurrency(actual)}`;
  }

  if (budget < 0) {
    return `Spent ${formatCurrency(actual)}. Budget is already ${formatSignedCurrency(budget)}.`;
  }

  return `Spent ${formatCurrency(actual)} of ${formatCurrency(budget)}`;
}

function getVarianceCopy(variance: number | null) {
  if (variance === null) {
    return "No budget set";
  }

  if (Math.abs(variance) < 0.01) {
    return "On budget";
  }

  if (variance > 0) {
    return `${formatCurrency(variance)} left`;
  }

  return `${formatCurrency(Math.abs(variance))} over`;
}

function getBudgetStatus(variance: number | null) {
  if (variance === null) {
    return {
      badgeClass:
        "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
      barClass: "bg-slate-400",
      label: "No budget",
    };
  }

  if (Math.abs(variance) < 0.01) {
    return {
      badgeClass:
        "border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
      barClass: "bg-sky-500",
      label: "On budget",
    };
  }

  if (variance > 0) {
    return {
      badgeClass:
        "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
      barClass: "bg-emerald-500",
      label: "Under budget",
    };
  }

  return {
    badgeClass:
      "border-red-300 bg-red-100 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
    barClass: "bg-red-500",
    label: "Over budget",
  };
}

function getProgressPercent({
  actual,
  budget,
}: {
  actual: number;
  budget: number | null;
}) {
  if (budget === null || budget <= 0) {
    return actual > 0 ? 100 : 0;
  }

  return Math.max(0, Math.min(100, (actual / budget) * 100));
}

function getActualForMonth({
  category,
  month,
}: {
  category: FinanceCategoryCard | undefined;
  month: string;
}) {
  if (!category) {
    return 0;
  }

  return roundCurrency(
    category.monthly.find((entry) => entry.month === month)?.actual ?? 0
  );
}

function BudgetRow({ row }: { row: BudgetBreakdownRow }) {
  const status = getBudgetStatus(row.variance);

  return (
    <div className="rounded-2xl border bg-background/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-base">{row.label}</div>
            {row.isCatchAll ? <Badge variant="outline">Catch-all</Badge> : null}
            <Badge className={status.badgeClass} variant="outline">
              {status.label}
            </Badge>
          </div>
          <div className="text-muted-foreground text-sm">
            {formatSpendSummary({
              actual: row.actual,
              budget: row.budget,
            })}
          </div>
        </div>

        <div className="text-right">
          <div className="font-semibold text-lg">
            {formatCurrency(row.actual)}
          </div>
          <div className="text-muted-foreground text-sm">
            {getVarianceCopy(row.variance)}
          </div>
        </div>
      </div>

      <div className="mt-4 h-2 rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", status.barClass)}
          style={{ width: `${row.progressPercent}%` }}
        />
      </div>
    </div>
  );
}

export function MonthlyBudgetDashboard({
  projectId,
  snapshot,
  targets,
}: {
  projectId: string;
  snapshot: FinanceSnapshot;
  targets: FinanceTargetsResponse;
}) {
  const availableMonths = snapshot.monthlyChart;
  const latestMonth = availableMonths.at(-1)?.month ?? "";
  const [selectedMonth, setSelectedMonth] = useState(latestMonth);

  useEffect(() => {
    if (
      !selectedMonth ||
      !availableMonths.some((entry) => entry.month === selectedMonth)
    ) {
      setSelectedMonth(latestMonth);
    }
  }, [availableMonths, latestMonth, selectedMonth]);

  const selectedMonthEntry =
    availableMonths.find((entry) => entry.month === selectedMonth) ??
    availableMonths.at(-1);

  if (!selectedMonthEntry) {
    return null;
  }

  const selectedMonthIndex = availableMonths.findIndex(
    (entry) => entry.month === selectedMonthEntry.month
  );
  const previousMonthEntry =
    selectedMonthIndex > 0 ? availableMonths[selectedMonthIndex - 1] : null;
  const monthOverMonthChange = previousMonthEntry
    ? roundCurrency(selectedMonthEntry.actual - previousMonthEntry.actual)
    : null;
  const totalBudget = targets.cashFlowSummary.totalMonthlyBudgetTarget;
  const totalVariance =
    totalBudget === null
      ? null
      : roundCurrency(totalBudget - selectedMonthEntry.actual);
  const totalStatus = getBudgetStatus(totalVariance);
  const totalProgressPercent = getProgressPercent({
    actual: selectedMonthEntry.actual,
    budget: totalBudget,
  });
  const categoryBudgetTotal = targets.cashFlowSummary.categoryBudgetTotal;
  const budgetedBucketKeys = new Set(
    targets.categoryBudgets.map((budget) => safeLower(budget.bucket))
  );
  const categoryCardsByBucket = new Map<string, FinanceCategoryCard>(
    snapshot.categoryCards.map((category) => [
      safeLower(category.bucket),
      category,
    ])
  );
  const categoryRows: BudgetBreakdownRow[] = targets.categoryBudgets.map(
    (budget) => {
      const actual = getActualForMonth({
        category: categoryCardsByBucket.get(safeLower(budget.bucket)),
        month: selectedMonthEntry.month,
      });
      const variance = roundCurrency(budget.amount - actual);

      return {
        label: budget.bucket,
        budget: budget.amount,
        actual,
        variance,
        progressPercent: getProgressPercent({
          actual,
          budget: budget.amount,
        }),
        isCatchAll: false,
      };
    }
  );
  const budgetedActual = roundCurrency(
    categoryRows.reduce((sum, row) => sum + row.actual, 0)
  );
  const categoryVariance = roundCurrency(categoryBudgetTotal - budgetedActual);
  const catchAllBudget = targets.cashFlowSummary.catchAllBudget;
  const catchAllActual = roundCurrency(
    Math.max(0, selectedMonthEntry.actual - budgetedActual)
  );
  const catchAllRow: BudgetBreakdownRow = {
    label: "Everything else",
    budget: catchAllBudget,
    actual: catchAllActual,
    variance:
      catchAllBudget === null
        ? null
        : roundCurrency(catchAllBudget - catchAllActual),
    progressPercent: getProgressPercent({
      actual: catchAllActual,
      budget: catchAllBudget,
    }),
    isCatchAll: true,
  };
  const showCatchAllRow =
    catchAllBudget !== null || catchAllActual > 0 || categoryRows.length === 0;
  const catchAllCategories = snapshot.categoryCards
    .filter((category) => !budgetedBucketKeys.has(safeLower(category.bucket)))
    .map((category) => ({
      bucket: category.bucket,
      actual: getActualForMonth({
        category,
        month: selectedMonthEntry.month,
      }),
    }))
    .filter((category) => category.actual > 0)
    .sort((left, right) => right.actual - left.actual)
    .slice(0, 5);
  const monthButtons = [...availableMonths].reverse();

  return (
    <div className="space-y-6">
      <Card className="border-slate-900 bg-slate-950 text-white shadow-lg">
        <CardHeader className="gap-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <Badge className="bg-white/10 text-white hover:bg-white/10">
                Budget dashboard
              </Badge>
              <div>
                <CardTitle className="text-3xl tracking-tight text-white">
                  {selectedMonthEntry.label}
                </CardTitle>
                <CardDescription className="mt-2 max-w-2xl text-slate-300">
                  Focus this view on what you spent this month, how that
                  compares to the total budget, and which category budgets are
                  doing the work.
                </CardDescription>
              </div>
            </div>

            <Button asChild type="button" variant="secondary">
              <Link href={`/project/${projectId}/budget`}>Edit budget</Link>
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {monthButtons.map((month) => {
              const isSelected = month.month === selectedMonthEntry.month;

              return (
                <button
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    isSelected
                      ? "border-white bg-white text-slate-950"
                      : "border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
                  )}
                  key={month.month}
                  onClick={() => setSelectedMonth(month.month)}
                  type="button"
                >
                  {month.label}
                </button>
              );
            })}
          </div>
        </CardHeader>

        <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <div>
              <div className="text-slate-300 text-xs uppercase tracking-[0.22em]">
                Monthly spend
              </div>
              <div className="mt-3 font-semibold text-5xl tracking-tight">
                {formatCurrency(selectedMonthEntry.actual)}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge
                  className={cn("border", totalStatus.badgeClass)}
                  variant="outline"
                >
                  {totalStatus.label}
                </Badge>
                {monthOverMonthChange !== null ? (
                  <span className="text-slate-300 text-sm">
                    {monthOverMonthChange >= 0
                      ? `${formatCurrency(monthOverMonthChange)} more than ${previousMonthEntry?.label}`
                      : `${formatCurrency(Math.abs(monthOverMonthChange))} less than ${previousMonthEntry?.label}`}
                  </span>
                ) : (
                  <span className="text-slate-300 text-sm">
                    First month in the current history window.
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-300">
                  {totalBudget === null
                    ? "No total monthly budget is set yet."
                    : `Tracking against ${formatCurrency(totalBudget)} total budget`}
                </span>
                <span className="font-medium text-white">
                  {getVarianceCopy(totalVariance)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/10">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    totalStatus.barClass
                  )}
                  style={{ width: `${totalProgressPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-slate-300 text-xs uppercase tracking-[0.2em]">
                Total budget
              </div>
              <div className="mt-2 font-semibold text-2xl">
                {formatCurrency(totalBudget)}
              </div>
              <div className="mt-1 text-slate-300 text-sm">
                {getVarianceCopy(totalVariance)}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-slate-300 text-xs uppercase tracking-[0.2em]">
                Category budgets
              </div>
              <div className="mt-2 font-semibold text-2xl">
                {formatCurrency(categoryBudgetTotal)}
              </div>
              <div className="mt-1 text-slate-300 text-sm">
                {formatCurrency(budgetedActual)} spent,{" "}
                {getVarianceCopy(categoryVariance)}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-slate-300 text-xs uppercase tracking-[0.2em]">
                Everything else
              </div>
              <div className="mt-2 font-semibold text-2xl">
                {formatSignedCurrency(catchAllBudget)}
              </div>
              <div className="mt-1 text-slate-300 text-sm">
                {formatCurrency(catchAllActual)} spent,{" "}
                {getVarianceCopy(catchAllRow.variance)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <MonthlySpendChart
          comparisonBudget={totalBudget ?? categoryBudgetTotal}
          comparisonLabel={
            totalBudget === null ? "Category budgets" : "Total budget"
          }
          data={availableMonths}
          selectedMonth={selectedMonthEntry.month}
        />

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>Category budget breakdown</CardTitle>
            <CardDescription>
              Compare the selected month against the categories you budgeted
              directly, then let the remainder roll into everything else.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {categoryRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-background/70 px-4 py-6 text-muted-foreground text-sm">
                No category budgets are set yet. Right now this month will all
                land in the catch-all budget.
              </div>
            ) : (
              categoryRows.map((row) => <BudgetRow key={row.label} row={row} />)
            )}

            {showCatchAllRow ? <BudgetRow row={catchAllRow} /> : null}

            {catchAllCategories.length > 0 ? (
              <div className="rounded-2xl bg-muted/40 p-4">
                <div className="font-medium text-sm">
                  Inside everything else
                </div>
                <div className="mt-1 text-muted-foreground text-sm">
                  The biggest unbudgeted categories in{" "}
                  {selectedMonthEntry.label}.
                </div>
                <div className="mt-4 space-y-2">
                  {catchAllCategories.map((category) => (
                    <div
                      className="flex items-center justify-between gap-3 text-sm"
                      key={category.bucket}
                    >
                      <span>{category.bucket}</span>
                      <span className="font-medium">
                        {formatCurrency(category.actual)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
