import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FinanceToolResult } from "@/components/finance/finance-tool-result";

test("FinanceToolResult renders legacy snapshot payloads without crashing", () => {
  const html = renderToStaticMarkup(
    React.createElement(FinanceToolResult, {
      type: "snapshot",
      result: {
        current: {
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
          ],
        },
      },
    })
  );

  assert.match(html, /Mortgage/);
  assert.doesNotMatch(html, /NaN/);
});

test("FinanceToolResult renders budget targets without crashing", () => {
  const html = renderToStaticMarkup(
    React.createElement(FinanceToolResult, {
      type: "budget-targets",
      result: {
        snapshotStatus: "ready",
        planMode: "conservative",
        latestTransactionDate: "2026-03-31",
        cashFlowSummary: {
          totalMonthlyBudgetTarget: 5000,
          totalMonthlyIncomeTarget: 7000,
          categoryBudgetTotal: 4200,
          catchAllBudget: 800,
        },
        categoryBudgets: [
          {
            category: "Mortgage",
            group: "fixed",
            amount: 2200,
            overrideId: "rule-1",
            lastMonthActual: 2200,
          },
        ],
        suggestedCategoryBudgets: [
          {
            category: "Groceries",
            group: "flexible",
            suggestedAmount: 600,
            lastMonthActual: 575,
          },
        ],
      },
    })
  );

  assert.match(html, /Mortgage/);
  assert.match(html, /Groceries/);
  assert.doesNotMatch(html, /NaN/);
});

test("FinanceToolResult renders rules without crashing", () => {
  const html = renderToStaticMarkup(
    React.createElement(FinanceToolResult, {
      type: "rules",
      result: {
        summary: {
          totalRules: 2,
          categorizationRuleCount: 1,
          exclusionRuleCount: 0,
          budgetOverrideCount: 1,
          planModeChangeCount: 0,
        },
        options: {
          accounts: ["Checking"],
          rawCategories: ["Uncategorized"],
          categories: ["Mortgage", "Groceries"],
        },
        rules: [
          {
            id: "rule-1",
            type: "set_category_monthly_target",
            summary: "Set Mortgage category budget to $2200",
            matchedTransactions: null,
            affectedOutflow: null,
          },
        ],
      },
    })
  );

  assert.match(html, /Checking/);
  assert.match(html, /Mortgage/);
  assert.doesNotMatch(html, /NaN/);
});
