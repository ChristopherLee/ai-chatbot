import assert from "node:assert/strict";
import test from "node:test";
import { buildHeuristicActions } from "@/lib/finance/action-parser";
import { categorizationRuleTypes, type FinanceSnapshot } from "@/lib/finance/types";

function createSnapshot(): FinanceSnapshot {
  return {
    status: "ready",
    cashFlowSummary: {
      totalMonthlyBudgetTarget: null,
      totalMonthlyIncomeTarget: null,
      categoryBudgetTotal: 2_400,
      catchAllBudget: null,
      historicalAverageMonthlyIncome: 0,
      historicalAverageMonthlySpend: 2_400,
    },
    datasetSummary: {
      filename: "transactions.csv",
      totalTransactions: 3,
      includedTransactions: 3,
      excludedTransactions: 0,
      totalOutflow: 2_400,
      includedOutflow: 2_400,
      dateRange: {
        start: "2026-01-01",
        end: "2026-03-31",
      },
      sampleHeader: ["Date", "Account", "Description", "Category", "Amount"],
      rawCategories: [
        {
          name: "Restaurants",
          count: 2,
          totalOutflow: 120,
        },
        {
          name: "Other Expenses",
          count: 1,
          totalOutflow: 2_280,
        },
      ],
      accounts: [
        {
          name: "Checking",
          count: 3,
        },
      ],
    },
    planSummary: {
      mode: "balanced",
      totalMonthlyTarget: 2_400,
      trailingAverageSpend: 2_400,
      totalsByGroup: {
        fixed: 2_000,
        flexible: 400,
        annual: 0,
      },
      categoryTargets: [
        {
          category: "Dining",
          group: "flexible",
          monthlyTarget: 120,
          trailingAverage: 120,
          trailingTotal: 360,
        },
        {
          category: "Mortgage",
          group: "fixed",
          monthlyTarget: 2_280,
          trailingAverage: 2_280,
          trailingTotal: 6_840,
        },
      ],
    },
    monthlyChart: [],
    cumulativeChart: [],
    categoryCards: [],
    transactionHighlights: [],
    appliedOverrides: [],
  };
}

test("heuristic raw-category requests map to categorize_transactions with match.rawCategory", () => {
  const snapshot = createSnapshot();

  const actions = buildHeuristicActions({
    latestUserMessage:
      "Categorize restaurants transactions as dining going forward.",
    snapshot,
  });

  assert.deepEqual(actions, [
    {
      type: "categorize_transactions",
      match: {
        rawCategory: "Restaurants",
      },
      to: "Dining",
    },
  ]);
});

test("heuristic merchant requests map to categorize_transactions with match.merchant", () => {
  const snapshot = createSnapshot();

  const actions = buildHeuristicActions({
    latestUserMessage:
      "Categorize smartwings transactions as dining going forward.",
    snapshot,
  });

  assert.deepEqual(actions, [
    {
      type: "categorize_transactions",
      match: {
        merchant: "smartwings",
      },
      to: "Dining",
    },
  ]);
});

test("heuristics do not emit removed rename or merge action types", () => {
  const snapshot = createSnapshot();

  assert.deepEqual(
    buildHeuristicActions({
      latestUserMessage: "Rename Dining to Household.",
      snapshot,
    }),
    []
  );

  assert.deepEqual(
    buildHeuristicActions({
      latestUserMessage: "Merge Dining into Household.",
      snapshot,
    }),
    []
  );
});

test("reusable categorization rule types only include saved match rules", () => {
  assert.deepEqual(categorizationRuleTypes, ["categorize_transactions"]);
});
