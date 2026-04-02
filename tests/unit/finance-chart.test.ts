import assert from "node:assert/strict";
import test from "node:test";
import { buildFinanceChart } from "@/lib/finance/chart-visualization";
import { buildFinancePlan } from "@/lib/finance/planner";
import type { FinanceSnapshot, FinanceTransaction } from "@/lib/finance/types";

function createTransaction({
  id,
  month,
  amount,
  bucket,
  group,
}: {
  id: string;
  month: string;
  amount: number;
  bucket: string;
  group: FinanceTransaction["bucketGroup"];
}): FinanceTransaction {
  return {
    id,
    projectId: "project-1",
    transactionDate: `${month}-15`,
    account: "Checking",
    description: `${bucket} expense`,
    normalizedMerchant: bucket,
    rawCategory: bucket,
    tags: null,
    amountSigned: -amount,
    outflowAmount: amount,
    mappedBucket: bucket,
    bucketGroup: group,
    includeFlag: true,
    exclusionReason: null,
    notes: null,
    createdAt: new Date(),
  };
}

function buildSnapshot(transactions: FinanceTransaction[]): FinanceSnapshot {
  const plan = buildFinancePlan({
    transactions,
    actions: [],
  });

  return {
    status: "ready",
    cashFlowSummary: {
      totalMonthlyBudgetTarget: null,
      totalMonthlyIncomeTarget: null,
      categoryBudgetTotal: plan.planSummary.totalMonthlyTarget,
      catchAllBudget: null,
      historicalAverageMonthlyIncome: 0,
      historicalAverageMonthlySpend: plan.planSummary.trailingAverageSpend,
    },
    datasetSummary: {
      filename: "transactions.csv",
      totalTransactions: transactions.length,
      includedTransactions: transactions.length,
      excludedTransactions: 0,
      totalOutflow: transactions.reduce(
        (sum, transaction) => sum + transaction.outflowAmount,
        0
      ),
      includedOutflow: transactions.reduce(
        (sum, transaction) => sum + transaction.outflowAmount,
        0
      ),
      dateRange: {
        start: "2026-01-15",
        end: "2026-03-15",
      },
      sampleHeader: ["Date", "Account", "Description", "Category", "Amount"],
      rawCategories: [],
      accounts: [
        {
          name: "Checking",
          count: transactions.length,
        },
      ],
    },
    planSummary: plan.planSummary,
    monthlyChart: plan.monthlyChart,
    cumulativeChart: plan.cumulativeChart,
    categoryCards: plan.categoryCards,
    transactionHighlights: [],
    appliedOverrides: [],
  };
}

const readySnapshot = buildSnapshot([
  createTransaction({
    id: "mortgage-jan",
    month: "2026-01",
    amount: 2000,
    bucket: "Mortgage",
    group: "fixed",
  }),
  createTransaction({
    id: "mortgage-feb",
    month: "2026-02",
    amount: 2000,
    bucket: "Mortgage",
    group: "fixed",
  }),
  createTransaction({
    id: "mortgage-mar",
    month: "2026-03",
    amount: 2100,
    bucket: "Mortgage",
    group: "fixed",
  }),
  createTransaction({
    id: "groceries-feb",
    month: "2026-02",
    amount: 450,
    bucket: "Groceries",
    group: "flexible",
  }),
  createTransaction({
    id: "groceries-mar",
    month: "2026-03",
    amount: 500,
    bucket: "Groceries",
    group: "flexible",
  }),
  createTransaction({
    id: "dining-feb",
    month: "2026-02",
    amount: 150,
    bucket: "Dining",
    group: "flexible",
  }),
  createTransaction({
    id: "dining-mar",
    month: "2026-03",
    amount: 100,
    bucket: "Dining",
    group: "flexible",
  }),
  createTransaction({
    id: "travel-mar",
    month: "2026-03",
    amount: 300,
    bucket: "Travel",
    group: "annual",
  }),
]);

test("month-over-month chart compares the latest observed month to the prior month", () => {
  const result = buildFinanceChart({
    snapshot: readySnapshot,
    input: {
      chartType: "month-over-month",
      bucketLimit: 2,
    },
  });

  assert.equal(result.status, "available");

  if (result.status !== "available") {
    return;
  }

  assert.equal(result.chart.chartType, "month-over-month");
  assert.equal(result.chart.currentMonth, "2026-03");
  assert.equal(result.chart.previousMonth, "2026-02");
  assert.equal(result.chart.totals.currentMonth, 3000);
  assert.equal(result.chart.totals.previousMonth, 2600);
  assert.equal(result.chart.totals.delta, 400);
  assert.equal(result.chart.availableBucketCount, 4);
  assert.equal(result.chart.truncated, true);
  assert.deepEqual(
    result.chart.data.map((bucket) => bucket.bucket),
    ["Mortgage", "Groceries"]
  );
});

test("spending breakdown chart returns top buckets and share percentages", () => {
  const result = buildFinanceChart({
    snapshot: readySnapshot,
    input: {
      chartType: "spending-breakdown",
      bucketLimit: 3,
    },
  });

  assert.equal(result.status, "available");

  if (result.status !== "available") {
    return;
  }

  assert.equal(result.chart.chartType, "spending-breakdown");
  assert.equal(result.chart.month, "2026-03");
  assert.equal(result.chart.total, 3000);
  assert.equal(result.chart.availableBucketCount, 4);
  assert.equal(result.chart.truncated, true);
  assert.deepEqual(
    result.chart.data.map((bucket) => bucket.bucket),
    ["Mortgage", "Groceries", "Travel"]
  );
  assert.equal(result.chart.data[0]?.sharePercentage, 70);
  assert.equal(result.chart.data[1]?.sharePercentage, 16.67);
  assert.equal(result.chart.data[2]?.sharePercentage, 10);
});

test("monthly spend chart uses the latest observed month for its summary", () => {
  const result = buildFinanceChart({
    snapshot: readySnapshot,
    input: {
      chartType: "monthly-spend",
      bucketLimit: 6,
    },
  });

  assert.equal(result.status, "available");

  if (result.status !== "available") {
    return;
  }

  assert.equal(result.chart.chartType, "monthly-spend");
  assert.equal(result.chart.latestMonth, "2026-03");
  assert.equal(result.chart.summary.actual, 3000);
  assert.equal(
    result.chart.summary.target,
    readySnapshot.monthlyChart.find((entry) => entry.month === "2026-03")
      ?.target
  );
});

test("chart requests return a clear unavailable state before finance onboarding is complete", () => {
  const result = buildFinanceChart({
    snapshot: {
      ...readySnapshot,
      status: "needs-onboarding",
      planSummary: null,
      monthlyChart: [],
      cumulativeChart: [],
      categoryCards: [],
    },
    input: {
      chartType: "monthly-spend",
      bucketLimit: 6,
    },
  });

  assert.deepEqual(result, {
    status: "unavailable",
    snapshotStatus: "needs-onboarding",
    chartType: "monthly-spend",
    message: "Finish finance onboarding before asking for charts.",
  });
});
