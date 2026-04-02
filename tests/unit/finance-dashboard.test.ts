import assert from "node:assert/strict";
import test from "node:test";
import {
  getDashboardLookbackRange,
  summarizeBudgetEntries,
} from "@/lib/finance/dashboard";
import type { FinanceMonthlyChartPoint } from "@/lib/finance/types";

const monthlyChart: FinanceMonthlyChartPoint[] = [
  { actual: 1000, label: "Jan 2026", month: "2026-01", target: 1200 },
  { actual: 1400, label: "Feb 2026", month: "2026-02", target: 1200 },
  { actual: 900, label: "Mar 2026", month: "2026-03", target: 1200 },
  { actual: 800, label: "Apr 2026", month: "2026-04", target: 1200 },
  { actual: 1500, label: "May 2026", month: "2026-05", target: 1200 },
  { actual: 1100, label: "Jun 2026", month: "2026-06", target: 1200 },
];

test("lookback range ends at the selected month and uses the requested window", () => {
  const range = getDashboardLookbackRange({
    data: monthlyChart,
    endMonth: "2026-06",
    requestedMonthCount: 6,
  });

  assert.ok(range);
  assert.equal(range.monthCount, 6);
  assert.equal(range.startMonth, "2026-01");
  assert.equal(range.endMonth, "2026-06");
  assert.deepEqual(range.monthKeys, [
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
  ]);
});

test("lookback range truncates when less history is available", () => {
  const range = getDashboardLookbackRange({
    data: monthlyChart,
    endMonth: "2026-03",
    requestedMonthCount: 12,
  });

  assert.ok(range);
  assert.equal(range.monthCount, 3);
  assert.equal(range.startMonth, "2026-01");
  assert.equal(range.rangeLabel, "Jan 2026 to Mar 2026");
});

test("budget summaries roll up totals, monthly averages, and month counts", () => {
  const summary = summarizeBudgetEntries([
    { actual: 1000, budget: 1200, month: "2026-01" },
    { actual: 1400, budget: 1200, month: "2026-02" },
    { actual: 900, budget: 1200, month: "2026-03" },
  ]);

  assert.equal(summary.actualTotal, 3300);
  assert.equal(summary.budgetTotal, 3600);
  assert.equal(summary.variance, 300);
  assert.equal(summary.averageActual, 1100);
  assert.equal(summary.averageBudget, 1200);
  assert.equal(summary.activeMonths, 3);
  assert.equal(summary.onBudgetMonths, 2);
  assert.equal(summary.progressPercent, 91.666_666_666_666_66);
});

test("budget summaries stay usable when no budget is set", () => {
  const summary = summarizeBudgetEntries([
    { actual: 0, budget: null, month: "2026-01" },
    { actual: 600, budget: null, month: "2026-02" },
  ]);

  assert.equal(summary.budgetTotal, null);
  assert.equal(summary.variance, null);
  assert.equal(summary.averageBudget, null);
  assert.equal(summary.activeMonths, 1);
  assert.equal(summary.onBudgetMonths, null);
  assert.equal(summary.progressPercent, 100);
});
