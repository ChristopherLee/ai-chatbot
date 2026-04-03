import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFinanceToolSnapshotSummary } from "@/lib/finance/tool-result-summary";

test("snapshot summary normalization maps legacy topBuckets payloads to topCategories", () => {
  const normalized = normalizeFinanceToolSnapshotSummary({
    status: "ready",
    includedOutflow: 2400,
    totalMonthlyTarget: 2600,
    trailingAverageSpend: 2500,
    topBuckets: [
      {
        bucket: "Mortgage",
        group: "fixed",
        monthlyTarget: 1800,
      },
      {
        bucket: "Dining",
        group: "flexible",
        monthlyTarget: 250,
      },
    ],
  });

  assert.equal(normalized.status, "ready");
  assert.equal(normalized.includedOutflow, 2400);
  assert.equal(normalized.totalMonthlyBudgetTarget, null);
  assert.equal(normalized.suggestedMonthlyTarget, 2600);
  assert.equal(normalized.trailingAverageSpend, 2500);
  assert.deepEqual(normalized.topCategories, [
    {
      category: "Mortgage",
      group: "fixed",
      monthlyTarget: 1800,
    },
    {
      category: "Dining",
      group: "flexible",
      monthlyTarget: 250,
    },
  ]);
});

test("snapshot summary normalization preserves current topCategories payloads", () => {
  const normalized = normalizeFinanceToolSnapshotSummary({
    status: "ready",
    categoryBudgetTotal: 1200,
    topCategories: [
      {
        category: "Groceries",
        group: "flexible",
        monthlyTarget: 500,
      },
    ],
  });

  assert.equal(normalized.categoryBudgetTotal, 1200);
  assert.deepEqual(normalized.topCategories, [
    {
      category: "Groceries",
      group: "flexible",
      monthlyTarget: 500,
    },
  ]);
});
