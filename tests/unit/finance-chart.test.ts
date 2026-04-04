import assert from "node:assert/strict";
import test from "node:test";
import { buildFinanceChart } from "@/lib/finance/chart-visualization";
import { buildFinancePlan } from "@/lib/finance/planner";
import type { FinanceSnapshot, FinanceTransaction } from "@/lib/finance/types";

function createTransaction({
  id,
  month,
  amount,
  category,
  group,
}: {
  id: string;
  month: string;
  amount: number;
  category: string;
  group: FinanceTransaction["categoryGroup"];
}): FinanceTransaction {
  return {
    id,
    projectId: "project-1",
    transactionDate: `${month}-15`,
    account: "Checking",
    description: `${category} expense`,
    normalizedMerchant: category,
    rawCategory: category,
    tags: null,
    amountSigned: -amount,
    outflowAmount: amount,
    mappedCategory: category,
    categoryGroup: group,
    includeFlag: true,
    exclusionReason: null,
    notes: null,
    createdAt: new Date(),
  };
}

function createIncomeTransaction({
  amount,
  id,
  month,
  rawCategory = "Paychecks/Salary",
  source,
}: {
  amount: number;
  id: string;
  month: string;
  rawCategory?: string;
  source: string;
}): FinanceTransaction {
  return {
    id,
    projectId: "project-1",
    transactionDate: `${month}-01`,
    account: "Checking",
    description: `${source} income`,
    normalizedMerchant: source,
    rawCategory,
    tags: null,
    amountSigned: amount,
    outflowAmount: 0,
    mappedCategory: rawCategory,
    categoryGroup: "excluded",
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
    category: "Mortgage",
    group: "fixed",
  }),
  createTransaction({
    id: "mortgage-feb",
    month: "2026-02",
    amount: 2000,
    category: "Mortgage",
    group: "fixed",
  }),
  createTransaction({
    id: "mortgage-mar",
    month: "2026-03",
    amount: 2100,
    category: "Mortgage",
    group: "fixed",
  }),
  createTransaction({
    id: "groceries-feb",
    month: "2026-02",
    amount: 450,
    category: "Groceries",
    group: "flexible",
  }),
  createTransaction({
    id: "groceries-mar",
    month: "2026-03",
    amount: 500,
    category: "Groceries",
    group: "flexible",
  }),
  createTransaction({
    id: "dining-feb",
    month: "2026-02",
    amount: 150,
    category: "Dining",
    group: "flexible",
  }),
  createTransaction({
    id: "dining-mar",
    month: "2026-03",
    amount: 100,
    category: "Dining",
    group: "flexible",
  }),
  createTransaction({
    id: "travel-mar",
    month: "2026-03",
    amount: 300,
    category: "Travel",
    group: "annual",
  }),
]);

const sankeyTransactions = [
  createIncomeTransaction({
    id: "income-paycheck-mar",
    month: "2026-03",
    amount: 4200,
    source: "Primary paycheck",
  }),
  createIncomeTransaction({
    id: "income-side-gig-mar",
    month: "2026-03",
    amount: 800,
    rawCategory: "Deposits",
    source: "Side gig",
  }),
  createTransaction({
    id: "mortgage-jan",
    month: "2026-01",
    amount: 2000,
    category: "Mortgage",
    group: "fixed",
  }),
  createTransaction({
    id: "mortgage-feb",
    month: "2026-02",
    amount: 2000,
    category: "Mortgage",
    group: "fixed",
  }),
  createTransaction({
    id: "mortgage-mar",
    month: "2026-03",
    amount: 2100,
    category: "Mortgage",
    group: "fixed",
  }),
  createTransaction({
    id: "groceries-feb",
    month: "2026-02",
    amount: 450,
    category: "Groceries",
    group: "flexible",
  }),
  createTransaction({
    id: "groceries-mar",
    month: "2026-03",
    amount: 500,
    category: "Groceries",
    group: "flexible",
  }),
  createTransaction({
    id: "dining-feb",
    month: "2026-02",
    amount: 150,
    category: "Dining",
    group: "flexible",
  }),
  createTransaction({
    id: "dining-mar",
    month: "2026-03",
    amount: 100,
    category: "Dining",
    group: "flexible",
  }),
  createTransaction({
    id: "travel-mar",
    month: "2026-03",
    amount: 300,
    category: "Travel",
    group: "annual",
  }),
];

const sankeySnapshot = buildSnapshot(sankeyTransactions);

test("month-over-month chart compares the latest observed month to the prior month", () => {
  const result = buildFinanceChart({
    snapshot: readySnapshot,
    input: {
      chartType: "month-over-month",
      categoryLimit: 2,
      sourceLimit: 4,
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
  assert.equal(result.chart.availableCategoryCount, 4);
  assert.equal(result.chart.truncated, true);
  assert.deepEqual(
    result.chart.data.map((category) => category.category),
    ["Mortgage", "Groceries"]
  );
});

test("spending breakdown chart returns top categories and share percentages", () => {
  const result = buildFinanceChart({
    snapshot: readySnapshot,
    input: {
      chartType: "spending-breakdown",
      categoryLimit: 3,
      sourceLimit: 4,
    },
  });

  assert.equal(result.status, "available");

  if (result.status !== "available") {
    return;
  }

  assert.equal(result.chart.chartType, "spending-breakdown");
  assert.equal(result.chart.month, "2026-03");
  assert.equal(result.chart.total, 3000);
  assert.equal(result.chart.availableCategoryCount, 4);
  assert.equal(result.chart.truncated, true);
  assert.deepEqual(
    result.chart.data.map((category) => category.category),
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
      categoryLimit: 6,
      sourceLimit: 4,
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

test("income-to-expenses chart builds a Sankey payload with observed income and leftover cash", () => {
  const result = buildFinanceChart({
    snapshot: sankeySnapshot,
    input: {
      chartType: "income-to-expenses",
      categoryLimit: 2,
      sourceLimit: 3,
    },
    transactions: sankeyTransactions,
  });

  assert.equal(result.status, "available");

  if (result.status !== "available") {
    return;
  }

  assert.equal(result.chart.chartType, "income-to-expenses");
  assert.equal(result.chart.month, "2026-03");
  assert.equal(result.chart.incomeBasis, "observed");
  assert.equal(result.chart.totals.income, 5000);
  assert.equal(result.chart.totals.expenses, 3000);
  assert.equal(result.chart.totals.leftover, 2000);
  assert.equal(result.chart.totals.supplemental, 0);
  assert.deepEqual(
    result.chart.sources.map((source) => source.name),
    ["Primary paycheck", "Side gig"]
  );
  assert.deepEqual(
    result.chart.destinations.map((destination) => destination.name),
    ["Mortgage", "Groceries", "Other expenses", "Left over / savings"]
  );
  assert.equal(result.chart.links.length, 8);
});

test("chart requests return a clear unavailable state while the finance plan is not ready", () => {
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
      categoryLimit: 6,
      sourceLimit: 4,
    },
  });

  assert.deepEqual(result, {
    status: "unavailable",
    snapshotStatus: "needs-onboarding",
    chartType: "monthly-spend",
    message: "The finance plan is still being prepared. Try again in a moment.",
  });
});

