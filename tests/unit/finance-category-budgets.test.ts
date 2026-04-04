import assert from "node:assert/strict";
import test from "node:test";
import { buildCategoryBudgetSuggestions } from "@/lib/finance/category-budgets";
import type { FinanceCategoryCard } from "@/lib/finance/types";

function buildCategoryCard({
  category,
  group,
  monthly,
  totalOutflow,
}: {
  category: string;
  group: FinanceCategoryCard["group"];
  monthly: FinanceCategoryCard["monthly"];
  totalOutflow: number;
}): FinanceCategoryCard {
  return {
    category,
    group,
    monthlyTarget: monthly.at(-1)?.target ?? 0,
    trailingAverage:
      monthly.reduce((sum, entry) => sum + entry.actual, 0) /
      Math.max(monthly.length, 1),
    totalOutflow,
    monthly,
    topMerchants: [
      {
        merchant: `${category} Merchant`,
        amount: totalOutflow,
      },
    ],
    transactions: [
      {
        id: `${category}-tx-1`,
        transactionDate: `${monthly.at(-1)?.month ?? "2026-06"}-15`,
        description: `${category} payment`,
        merchant: `${category} Merchant`,
        amount: monthly.at(-1)?.actual ?? 0,
        rawCategory: category,
        account: "Checking",
      },
    ],
  };
}

test("budget suggestions keep meaningful steady recurring categories", () => {
  const suggestions = buildCategoryBudgetSuggestions({
    categoryCards: [
      buildCategoryCard({
        category: "Mortgage",
        group: "fixed",
        monthly: [
          { month: "2026-01", label: "Jan 2026", actual: 3000, target: 3000 },
          { month: "2026-02", label: "Feb 2026", actual: 3000, target: 3000 },
          { month: "2026-03", label: "Mar 2026", actual: 3000, target: 3000 },
          { month: "2026-04", label: "Apr 2026", actual: 3000, target: 3000 },
          { month: "2026-05", label: "May 2026", actual: 3000, target: 3000 },
          { month: "2026-06", label: "Jun 2026", actual: 3000, target: 3000 },
        ],
        totalOutflow: 18_000,
      }),
    ],
    currentBudgets: [],
    latestTransactionDate: "2026-06-20",
  });

  assert.equal(suggestions.length, 1);
  assert.deepEqual(suggestions[0], {
    category: "Mortgage",
    group: "fixed",
    suggestedAmount: 3000,
    lastMonthActual: 3000,
    cadence: "steady",
    recency: "active",
    reasoning:
      "Descriptions look like a recurring bill, so this uses a steadier monthly budget.",
  });
});

test("budget suggestions skip very small categories", () => {
  const suggestions = buildCategoryBudgetSuggestions({
    categoryCards: [
      buildCategoryCard({
        category: "Coffee",
        group: "flexible",
        monthly: [
          { month: "2026-04", label: "Apr 2026", actual: 18, target: 18 },
          { month: "2026-05", label: "May 2026", actual: 24, target: 24 },
          { month: "2026-06", label: "Jun 2026", actual: 20, target: 20 },
        ],
        totalOutflow: 62,
      }),
    ],
    currentBudgets: [],
    latestTransactionDate: "2026-06-20",
  });

  assert.equal(suggestions.length, 0);
});

test("budget suggestions keep meaningful occasional categories with older activity", () => {
  const suggestions = buildCategoryBudgetSuggestions({
    categoryCards: [
      buildCategoryCard({
        category: "Travel",
        group: "annual",
        monthly: [
          { month: "2026-01", label: "Jan 2026", actual: 0, target: 0 },
          { month: "2026-02", label: "Feb 2026", actual: 0, target: 0 },
          { month: "2026-03", label: "Mar 2026", actual: 0, target: 0 },
          { month: "2026-04", label: "Apr 2026", actual: 0, target: 0 },
          { month: "2026-05", label: "May 2026", actual: 600, target: 50 },
          { month: "2026-06", label: "Jun 2026", actual: 0, target: 50 },
        ],
        totalOutflow: 600,
      }),
    ],
    currentBudgets: [],
    latestTransactionDate: "2026-06-20",
  });

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]?.category, "Travel");
  assert.equal(suggestions[0]?.cadence, "occasional");
  assert.equal(suggestions[0]?.recency, "cooling");
  assert.equal(suggestions[0]?.suggestedAmount, 100);
});
