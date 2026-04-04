import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { FinanceOverride } from "@/lib/db/schema";
import { buildHeuristicActions } from "@/lib/finance/action-parser";
import { buildFinanceCashFlowSummary } from "@/lib/finance/cash-flow";
import { categorizeTransactions } from "@/lib/finance/categorize";
import {
  getCurrentCategoryBudgetOverrides,
  getCurrentCategoryBudgetTotal,
} from "@/lib/finance/category-budgets";
import { parseTransactionsCsv } from "@/lib/finance/csv-ingest";
import {
  buildAppliedOverrides,
  previewFinanceRuleInSequence,
} from "@/lib/finance/overrides";
import { buildFinancePlan } from "@/lib/finance/planner";
import type {
  FinanceAction,
  FinanceSnapshot,
  FinanceTransaction,
} from "@/lib/finance/types";

const fixtureFilename = "transactions.sample.csv";
const csvText = readFileSync(`data/${fixtureFilename}`, "utf8");

test("CSV ingest accepts the sample header and normalizes signed amounts", async () => {
  const parsed = await parseTransactionsCsv({
    projectId: "project-1",
    filename: fixtureFilename,
    csvText,
  });

  assert.equal(
    parsed.headers.join(","),
    "Date,Account,Description,Category,Tags,Amount"
  );
  assert.equal(parsed.transactions.length >= 10, true);

  const debit = parsed.transactions.find(
    (transaction) => transaction.rawCategory === "Other Expenses"
  );
  const credit = parsed.transactions.find(
    (transaction) => transaction.rawCategory === "Investment Income"
  );

  assert.ok(debit);
  assert.equal(debit.amountSigned < 0, true);
  assert.equal(debit.outflowAmount > 0, true);

  assert.ok(credit);
  assert.equal(credit.amountSigned > 0, true);
  assert.equal(credit.outflowAmount, 0);
});

test("Default categorization excludes transfer-like rows and maps common categories", async () => {
  const parsed = await parseTransactionsCsv({
    projectId: "project-1",
    filename: fixtureFilename,
    csvText,
  });

  const categorized = categorizeTransactions({
    transactions: parsed.transactions.map((transaction, index) => ({
      id: `tx-${index}`,
      createdAt: new Date(),
      ...transaction,
    })),
    actions: [],
  });

  const transfer = categorized.find(
    (transaction) => transaction.rawCategory === "Transfers"
  );
  const restaurant = categorized.find(
    (transaction) => transaction.rawCategory === "Restaurants"
  );

  assert.ok(transfer);
  assert.equal(transfer.includeFlag, false);
  assert.equal(transfer.categoryGroup, "excluded");

  assert.ok(restaurant);
  assert.equal(restaurant.mappedCategory, "Dining");
  assert.equal(restaurant.includeFlag, true);
});

test("CSV ingest maps common alternate headers", async () => {
  const parsed = await parseTransactionsCsv({
    projectId: "project-1",
    filename: "alt-headers.csv",
    csvText: [
      "Transaction Date,Account Name,Merchant,Type,Labels,Transaction Amount",
      "2026-01-05,Checking,Coffee Shop,Restaurants,Breakfast,-8.99",
    ].join("\n"),
  });

  assert.equal(parsed.transactions.length, 1);
  assert.equal(parsed.transactions[0]?.description, "Coffee Shop");
  assert.equal(parsed.transactions[0]?.rawCategory, "Restaurants");
});

test("CSV ingest errors when required headers are missing", async () => {
  await assert.rejects(
    () =>
      parseTransactionsCsv({
        projectId: "project-1",
        filename: "missing-required.csv",
        csvText: [
          "Date,Account,Description,Tags",
          "2026-01-05,Checking,Coffee Shop,Breakfast",
        ].join("\n"),
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(
        String(error.cause ?? error.message),
        /missing required fields/i
      );
      return true;
    }
  );
});

test("CSV ingest explains common validation issues in one message", async () => {
  await assert.rejects(
    () =>
      parseTransactionsCsv({
        projectId: "project-1",
        filename: "chase-like.csv",
        csvText: [
          "Date,Account,Description,Category,Type,Amount,Tags",
          "12/30/2025,E-ZPass MA,Chase,Travel,Sale,-10.00,",
          "12/22/2025,AUTOMATIC PAYMENT - THANK,Chase,,Payment,1822.21,",
          "12/19/2025,HLU*HULUPLUS,Chase,Bills & Utilities,Sale,-12.99,",
          "12/17/2025,PETCO.COM 6989,Chase,Shopping,Sale,-68.63,",
          "12/16/2025,SQ *ALMA*SMP51F,Chase,Health & Wellness,Sale,-30.00,",
          "12/15/2025,TRADER JOE S #509,Chase,Groceries,Sale,-54.12,",
          "12/14/2025,STOP & SHOP 0446,Chase,Groceries,Sale,-89.31,",
          "12/13/2025,CVS/PHARMACY #01012,Chase,Health & Wellness,Sale,-22.10,",
          "12/12/2025,BJS WHOLESALE #0205,Chase,Groceries,Sale,-101.27,",
          "12/11/2025,MBTA-550021903293,Chase,Travel,Sale,-2.40,",
          "12/10/2025,BROOKLINE PASSPORT PKG,Chase,Travel,Sale,-6.75,",
        ].join("\n"),
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      const message = String(error.cause ?? error.message);
      assert.match(message, /CSV validation failed/i);
      assert.match(message, /MM\/DD\/YYYY/i);
      assert.match(message, /YYYY-MM-DD/i);
      assert.match(message, /blank Category value/i);
      assert.match(message, /Account and Description swapped/i);
      return true;
    }
  );
});

test("Heuristic actions prefer match-based categorization for merchant labels", () => {
  const snapshot: FinanceSnapshot = {
    status: "ready",
    cashFlowSummary: {
      totalMonthlyBudgetTarget: null,
      totalMonthlyIncomeTarget: null,
      categoryBudgetTotal: 3000,
      catchAllBudget: null,
      historicalAverageMonthlyIncome: 0,
      historicalAverageMonthlySpend: 3000,
    },
    datasetSummary: {
      filename: "transactions.csv.csv",
      totalTransactions: 2,
      includedTransactions: 2,
      excludedTransactions: 0,
      totalOutflow: 12_389.51,
      includedOutflow: 12_389.51,
      dateRange: {
        start: "2026-03-12",
        end: "2026-03-26",
      },
      sampleHeader: [
        "Date",
        "Account",
        "Description",
        "Category",
        "Tags",
        "Amount",
      ],
      rawCategories: [
        {
          name: "Other Expenses",
          count: 2,
          totalOutflow: 12_389.51,
        },
      ],
      accounts: [
        {
          name: "Chris's Fidelity Checking",
          count: 1,
        },
      ],
    },
    planSummary: {
      mode: "balanced",
      totalMonthlyTarget: 3000,
      trailingAverageSpend: 3000,
      totalsByGroup: {
        fixed: 3000,
        flexible: 0,
        annual: 0,
      },
      categoryTargets: [
        {
          category: "Mortgage",
          group: "fixed",
          monthlyTarget: 3000,
          trailingAverage: 3000,
          trailingTotal: 3000,
        },
      ],
    },
    monthlyChart: [],
    cumulativeChart: [],
    categoryCards: [],
    transactionHighlights: [],
    appliedOverrides: [],
  };

  const actions = buildHeuristicActions({
    latestUserMessage:
      'Categorize "Direct Debit Crosscountry" transactions always to mortgage going forward.',
    snapshot,
  });

  assert.deepEqual(actions, [
    {
      type: "categorize_transactions",
      match: {
        merchant: "Direct Debit Crosscountry",
      },
      to: "Mortgage",
    },
  ]);
});

test("Heuristic actions preserve the user's requested destination category name", () => {
  const snapshot: FinanceSnapshot = {
    status: "ready",
    cashFlowSummary: {
      totalMonthlyBudgetTarget: null,
      totalMonthlyIncomeTarget: null,
      categoryBudgetTotal: 3000,
      catchAllBudget: null,
      historicalAverageMonthlyIncome: 0,
      historicalAverageMonthlySpend: 3000,
    },
    datasetSummary: {
      filename: "transactions.csv.csv",
      totalTransactions: 2,
      includedTransactions: 2,
      excludedTransactions: 0,
      totalOutflow: 500,
      includedOutflow: 500,
      dateRange: {
        start: "2026-03-12",
        end: "2026-03-26",
      },
      sampleHeader: [
        "Date",
        "Account",
        "Description",
        "Category",
        "Tags",
        "Amount",
      ],
      rawCategories: [
        {
          name: "Other Expenses",
          count: 2,
          totalOutflow: 500,
        },
      ],
      accounts: [
        {
          name: "Checking",
          count: 2,
        },
      ],
    },
    planSummary: {
      mode: "balanced",
      totalMonthlyTarget: 3000,
      trailingAverageSpend: 3000,
      totalsByGroup: {
        fixed: 1500,
        flexible: 1500,
        annual: 0,
      },
      categoryTargets: [
        {
          category: "Household",
          group: "flexible",
          monthlyTarget: 500,
          trailingAverage: 500,
          trailingTotal: 500,
        },
        {
          category: "Electronics",
          group: "flexible",
          monthlyTarget: 200,
          trailingAverage: 200,
          trailingTotal: 200,
        },
      ],
    },
    monthlyChart: [],
    cumulativeChart: [],
    categoryCards: [],
    transactionHighlights: [],
    appliedOverrides: [],
  };

  const actions = buildHeuristicActions({
    latestUserMessage:
      'Categorize "Sp Smartwings" transactions as furniture going forward.',
    snapshot,
  });

  assert.deepEqual(actions, [
    {
      type: "categorize_transactions",
      match: {
        merchant: "Sp Smartwings",
      },
      to: "Furniture",
    },
  ]);
});

test("Match-based categorization only updates matching transactions", async () => {
  const parsed = await parseTransactionsCsv({
    projectId: "project-1",
    filename: fixtureFilename,
    csvText,
  });

  const categorized = categorizeTransactions({
    transactions: parsed.transactions.map((transaction, index) => ({
      id: `tx-${index}`,
      createdAt: new Date(),
      ...transaction,
    })),
    actions: [
      {
        type: "categorize_transactions",
        match: {
          merchant: "Direct Debit Crosscountry",
        },
        to: "Mortgage",
      },
    ],
  });

  const crosscountry = categorized.find((transaction) =>
    transaction.description.includes("Direct Debit Crosscountry")
  );
  const otherExpense = categorized.find(
    (transaction) =>
      transaction.rawCategory === "Other Expenses" &&
      !transaction.description.includes("Direct Debit Crosscountry")
  );

  assert.ok(crosscountry);
  assert.equal(crosscountry.mappedCategory, "Mortgage");
  assert.equal(crosscountry.categoryGroup, "fixed");

  assert.ok(otherExpense);
  assert.equal(otherExpense.mappedCategory, "Other / Misc");
  assert.equal(otherExpense.categoryGroup, "flexible");
});

test("Single-transaction categorization only updates the targeted transaction", async () => {
  const parsed = await parseTransactionsCsv({
    projectId: "project-1",
    filename: fixtureFilename,
    csvText,
  });

  const baseTransactions = parsed.transactions.map((transaction, index) => ({
    id: `tx-${index}`,
    createdAt: new Date(),
    ...transaction,
  }));
  const crosscountry = baseTransactions.find((transaction) =>
    transaction.description.includes("Direct Debit Crosscountry")
  );

  assert.ok(crosscountry);

  const categorized = categorizeTransactions({
    transactions: baseTransactions,
    actions: [
      {
        type: "categorize_transaction",
        transactionId: crosscountry.id,
        to: "Mortgage",
      },
    ],
  });

  const updatedTransaction = categorized.find(
    (transaction) => transaction.id === crosscountry.id
  );
  const unaffectedTransaction = categorized.find(
    (transaction) =>
      transaction.rawCategory === "Other Expenses" &&
      transaction.id !== crosscountry.id
  );

  assert.ok(updatedTransaction);
  assert.equal(updatedTransaction.mappedCategory, "Mortgage");
  assert.equal(updatedTransaction.categoryGroup, "fixed");

  assert.ok(unaffectedTransaction);
  assert.equal(unaffectedTransaction.mappedCategory, "Other / Misc");
});

test("Single-transaction categorization clears the default exclusion state", () => {
  const categorized = categorizeTransactions({
    transactions: [
      {
        id: "tx-1",
        projectId: "project-1",
        transactionDate: "2026-01-05",
        account: "Checking",
        description: "Direct Debit Jpmorgan Chasechase Ach",
        normalizedMerchant: "Direct Debit Jpmorgan Chasechase Ach",
        rawCategory: "Credit Card Payments",
        tags: null,
        amountSigned: -13160.01,
        outflowAmount: 13160.01,
        mappedCategory: "Credit Card Payments",
        categoryGroup: "excluded",
        includeFlag: false,
        exclusionReason: "Excluded by default category rule",
        notes: null,
        createdAt: new Date(),
      },
    ],
    actions: [
      {
        type: "categorize_transaction",
        transactionId: "tx-1",
        to: "Mortgage",
      },
    ],
  });

  const updatedTransaction = categorized[0];

  assert.ok(updatedTransaction);
  assert.equal(updatedTransaction.mappedCategory, "Mortgage");
  assert.equal(updatedTransaction.includeFlag, true);
  assert.equal(updatedTransaction.exclusionReason, null);
  assert.equal(updatedTransaction.categoryGroup, "fixed");
});

test("Manual transaction categorization overrides stay in place when later rules match the same merchant", () => {
  const crosscountryTransactions: FinanceTransaction[] = [
    {
      id: "tx-1",
      projectId: "project-1",
      transactionDate: "2026-03-01",
      account: "Checking",
      description: "Direct Debit Crosscountry 1sweb Pymnt",
      normalizedMerchant: "Direct Debit Crosscountry",
      rawCategory: "Other Expenses",
      tags: null,
      amountSigned: -2500,
      outflowAmount: 2500,
      mappedCategory: "Other / Misc",
      categoryGroup: "flexible",
      includeFlag: true,
      exclusionReason: null,
      notes: null,
      createdAt: new Date(),
    },
    {
      id: "tx-2",
      projectId: "project-1",
      transactionDate: "2026-04-01",
      account: "Checking",
      description: "Direct Debit Crosscountry 1sweb Pymnt",
      normalizedMerchant: "Direct Debit Crosscountry",
      rawCategory: "Other Expenses",
      tags: null,
      amountSigned: -2600,
      outflowAmount: 2600,
      mappedCategory: "Other / Misc",
      categoryGroup: "flexible",
      includeFlag: true,
      exclusionReason: null,
      notes: null,
      createdAt: new Date(),
    },
  ];

  const [manuallyCategorized, ruleMatchedTransaction] =
    crosscountryTransactions;

  const categorized = categorizeTransactions({
    transactions: crosscountryTransactions,
    actions: [
      {
        type: "categorize_transaction",
        transactionId: manuallyCategorized.id,
        to: "Mortgage",
      },
      {
        type: "categorize_transactions",
        match: {
          merchant: "Direct Debit Crosscountry",
        },
        to: "Utilities",
      },
    ],
  });

  const preservedManualOverride = categorized.find(
    (transaction) => transaction.id === manuallyCategorized.id
  );
  const ruleUpdatedTransaction = categorized.find(
    (transaction) => transaction.id === ruleMatchedTransaction.id
  );

  assert.ok(preservedManualOverride);
  assert.ok(ruleUpdatedTransaction);
  assert.equal(preservedManualOverride.mappedCategory, "Mortgage");
  assert.equal(ruleUpdatedTransaction.mappedCategory, "Utilities");
});

test("Applied overrides expose detailed rule context and locked transaction impact", () => {
  const manualTransactionId = "11111111-1111-4111-8111-111111111111";
  const ruleTransactionId = "22222222-2222-4222-8222-222222222222";
  const transactions: FinanceTransaction[] = [
    {
      id: manualTransactionId,
      projectId: "project-1",
      transactionDate: "2026-03-01",
      account: "Checking",
      description: "Direct Debit Crosscountry 1sweb Pymnt",
      normalizedMerchant: "Direct Debit Crosscountry",
      rawCategory: "Other Expenses",
      tags: null,
      amountSigned: -2500,
      outflowAmount: 2500,
      mappedCategory: "Other / Misc",
      categoryGroup: "flexible",
      includeFlag: true,
      exclusionReason: null,
      notes: null,
      createdAt: new Date(),
    },
    {
      id: ruleTransactionId,
      projectId: "project-1",
      transactionDate: "2026-04-01",
      account: "Checking",
      description: "Direct Debit Crosscountry 1sweb Pymnt",
      normalizedMerchant: "Direct Debit Crosscountry",
      rawCategory: "Other Expenses",
      tags: null,
      amountSigned: -2600,
      outflowAmount: 2600,
      mappedCategory: "Other / Misc",
      categoryGroup: "flexible",
      includeFlag: true,
      exclusionReason: null,
      notes: null,
      createdAt: new Date(),
    },
  ];

  const overrides: FinanceOverride[] = [
    {
      id: "override-1",
      projectId: "project-1",
      type: "categorize_transaction",
      key: "categorize-transaction",
      valueJson: {
        type: "categorize_transaction",
        transactionId: manualTransactionId,
        to: "Mortgage",
      },
      createdAt: new Date("2026-03-02T10:00:00.000Z"),
    },
    {
      id: "override-2",
      projectId: "project-1",
      type: "categorize_transactions",
      key: "categorize-rule",
      valueJson: {
        type: "categorize_transactions",
        match: {
          merchant: "Direct Debit Crosscountry",
        },
        to: "Utilities",
      },
      createdAt: new Date("2026-03-03T10:00:00.000Z"),
    },
  ];

  const appliedOverrides = buildAppliedOverrides(overrides, transactions);
  const manualOverride = appliedOverrides.find(
    (override) => override.type === "categorize_transaction"
  );
  const ruleOverride = appliedOverrides.find(
    (override) => override.type === "categorize_transactions"
  );
  assert.ok(manualOverride);
  assert.ok(ruleOverride);

  assert.equal(
    manualOverride.summary,
    "Categorized one transaction as Mortgage"
  );
  assert.equal(manualOverride.affectedOutflow, 2500);
  assert.equal(
    manualOverride.details.find((detail) => detail.label === "Transaction")
      ?.value,
    "2026-03-01 - Direct Debit Crosscountry 1sweb Pymnt"
  );

  assert.equal(ruleOverride.matchedTransactions, 1);
  assert.equal(ruleOverride.affectedOutflow, 2600);
  assert.equal(
    ruleOverride.details.find((detail) => detail.label === "When")?.value,
    'Merchant contains "Direct Debit Crosscountry"'
  );
});

test("Rule previews exclude transactions already locked by one-off overrides", () => {
  const manualTransactionId = "11111111-1111-4111-8111-111111111111";
  const ruleTransactionId = "22222222-2222-4222-8222-222222222222";
  const baseTransactions: FinanceTransaction[] = [
    {
      id: manualTransactionId,
      projectId: "project-1",
      transactionDate: "2026-03-01",
      account: "Checking",
      description: "Direct Debit Crosscountry 1sweb Pymnt",
      normalizedMerchant: "Direct Debit Crosscountry",
      rawCategory: "Other Expenses",
      tags: null,
      amountSigned: -2500,
      outflowAmount: 2500,
      mappedCategory: "Other / Misc",
      categoryGroup: "flexible",
      includeFlag: true,
      exclusionReason: null,
      notes: null,
      createdAt: new Date(),
    },
    {
      id: ruleTransactionId,
      projectId: "project-1",
      transactionDate: "2026-04-01",
      account: "Checking",
      description: "Direct Debit Crosscountry 1sweb Pymnt",
      normalizedMerchant: "Direct Debit Crosscountry",
      rawCategory: "Other Expenses",
      tags: null,
      amountSigned: -2600,
      outflowAmount: 2600,
      mappedCategory: "Other / Misc",
      categoryGroup: "flexible",
      includeFlag: true,
      exclusionReason: null,
      notes: null,
      createdAt: new Date(),
    },
  ];
  const overrides: FinanceOverride[] = [
    {
      id: "override-1",
      projectId: "project-1",
      type: "categorize_transaction",
      key: "categorize-transaction",
      valueJson: {
        type: "categorize_transaction",
        transactionId: manualTransactionId,
        to: "Mortgage",
      },
      createdAt: new Date("2026-03-02T10:00:00.000Z"),
    },
  ];

  const preview = previewFinanceRuleInSequence({
    baseTransactions,
    overrides,
    draftAction: {
      type: "categorize_transactions",
      match: {
        merchant: "Direct Debit Crosscountry",
      },
      to: "Utilities",
    },
  });

  assert.equal(preview.matchedTransactions, 1);
  assert.equal(preview.affectedOutflow, 2600);
  assert.deepEqual(
    preview.affectedTransactions.map((transaction) => transaction.id),
    [ruleTransactionId]
  );
});

test("Effective-month target overrides only affect future months", () => {
  const baseTransaction = (
    month: string,
    amount: number
  ): FinanceTransaction => ({
    id: `${month}-${amount}`,
    projectId: "project-1",
    transactionDate: `${month}-15`,
    account: "Checking",
    description: "Mortgage payment",
    normalizedMerchant: "Mortgage",
    rawCategory: "Mortgages",
    tags: null,
    amountSigned: -amount,
    outflowAmount: amount,
    mappedCategory: "Mortgage",
    categoryGroup: "fixed",
    includeFlag: true,
    exclusionReason: null,
    notes: null,
    createdAt: new Date(),
  });

  const actions: FinanceAction[] = [
    {
      type: "set_category_monthly_target",
      category: "Mortgage",
      amount: 3200,
      effectiveMonth: "2026-04",
    },
  ];

  const plan = buildFinancePlan({
    transactions: [
      baseTransaction("2026-01", 3000),
      baseTransaction("2026-02", 3000),
      baseTransaction("2026-03", 3000),
    ],
    actions,
  });

  const march = plan.monthlyChart.find((entry) => entry.month === "2026-03");
  const april = plan.monthlyChart.find((entry) => entry.month === "2026-04");

  assert.ok(march);
  assert.ok(april);
  assert.equal(march.target, 3000);
  assert.equal(april.target, 3200);
});

test("Current category budget helpers keep only the latest default budget per category", () => {
  const overrides: FinanceOverride[] = [
    {
      id: "override-1",
      projectId: "project-1",
      type: "set_category_monthly_target",
      key: "budget-groceries-300",
      valueJson: {
        type: "set_category_monthly_target",
        category: "Groceries",
        amount: 300,
      },
      createdAt: new Date("2026-03-01T10:00:00.000Z"),
    },
    {
      id: "override-2",
      projectId: "project-1",
      type: "set_category_monthly_target",
      key: "budget-groceries-450",
      valueJson: {
        type: "set_category_monthly_target",
        category: "Groceries",
        amount: 450,
      },
      createdAt: new Date("2026-03-02T10:00:00.000Z"),
    },
    {
      id: "override-3",
      projectId: "project-1",
      type: "set_category_monthly_target",
      key: "budget-groceries-april",
      valueJson: {
        type: "set_category_monthly_target",
        category: "Groceries",
        amount: 500,
        effectiveMonth: "2026-04",
      },
      createdAt: new Date("2026-03-03T10:00:00.000Z"),
    },
    {
      id: "override-4",
      projectId: "project-1",
      type: "set_category_monthly_target",
      key: "budget-dining-200",
      valueJson: {
        type: "set_category_monthly_target",
        category: "Dining",
        amount: 200,
      },
      createdAt: new Date("2026-03-04T10:00:00.000Z"),
    },
  ];

  assert.deepEqual(getCurrentCategoryBudgetOverrides(overrides), [
    {
      category: "Dining",
      amount: 200,
      overrideId: "override-4",
    },
    {
      category: "Groceries",
      amount: 450,
      overrideId: "override-2",
    },
  ]);
  assert.equal(getCurrentCategoryBudgetTotal(overrides), 650);
});

test("Planner includes categories that only exist because of manual category budgets", () => {
  const transaction = (month: string, amount: number): FinanceTransaction => ({
    id: `${month}-${amount}`,
    projectId: "project-1",
    transactionDate: `${month}-15`,
    account: "Checking",
    description: "Groceries",
    normalizedMerchant: "Whole Foods",
    rawCategory: "Groceries",
    tags: null,
    amountSigned: -amount,
    outflowAmount: amount,
    mappedCategory: "Groceries",
    categoryGroup: "flexible",
    includeFlag: true,
    exclusionReason: null,
    notes: null,
    createdAt: new Date(),
  });

  const plan = buildFinancePlan({
    transactions: [
      transaction("2026-01", 400),
      transaction("2026-02", 420),
      transaction("2026-03", 380),
    ],
    actions: [
      {
        type: "set_category_monthly_target",
        category: "Pets",
        amount: 150,
      },
    ],
  });

  const petsCategory = plan.planSummary.categoryTargets.find(
    (category) => category.category === "Pets"
  );
  const petsCard = plan.categoryCards.find((card) => card.category === "Pets");

  assert.ok(petsCategory);
  assert.ok(petsCard);
  assert.equal(petsCategory.group, "flexible");
  assert.equal(petsCategory.monthlyTarget, 150);
  assert.equal(petsCard.monthlyTarget, 150);
  assert.equal(petsCard.totalOutflow, 0);
});

test("Budget recommendations use the latest six months of history", () => {
  const mortgageTransaction = (
    month: string,
    amount: number
  ): FinanceTransaction => ({
    id: `${month}-${amount}`,
    projectId: "project-1",
    transactionDate: `${month}-15`,
    account: "Checking",
    description: "Mortgage payment",
    normalizedMerchant: "Mortgage",
    rawCategory: "Mortgages",
    tags: null,
    amountSigned: -amount,
    outflowAmount: amount,
    mappedCategory: "Mortgage",
    categoryGroup: "fixed",
    includeFlag: true,
    exclusionReason: null,
    notes: null,
    createdAt: new Date(),
  });

  const plan = buildFinancePlan({
    transactions: [
      mortgageTransaction("2026-01", 5000),
      mortgageTransaction("2026-02", 5000),
      mortgageTransaction("2026-03", 1000),
      mortgageTransaction("2026-04", 1000),
      mortgageTransaction("2026-05", 1000),
      mortgageTransaction("2026-06", 1000),
      mortgageTransaction("2026-07", 1000),
      mortgageTransaction("2026-08", 1000),
    ],
    actions: [],
  });

  const mortgageCategory = plan.planSummary.categoryTargets.find(
    (category) => category.category === "Mortgage"
  );

  assert.ok(mortgageCategory);
  assert.equal(mortgageCategory.monthlyTarget, 1000);
  assert.equal(mortgageCategory.trailingAverage, 1000);
  assert.equal(mortgageCategory.trailingTotal, 6000);
  assert.equal(plan.planSummary.trailingAverageSpend, 1000);
});

test("Budget recommendations use available history when less than six months exist", () => {
  const mortgageTransaction = (
    month: string,
    amount: number
  ): FinanceTransaction => ({
    id: `${month}-${amount}`,
    projectId: "project-1",
    transactionDate: `${month}-15`,
    account: "Checking",
    description: "Mortgage payment",
    normalizedMerchant: "Mortgage",
    rawCategory: "Mortgages",
    tags: null,
    amountSigned: -amount,
    outflowAmount: amount,
    mappedCategory: "Mortgage",
    categoryGroup: "fixed",
    includeFlag: true,
    exclusionReason: null,
    notes: null,
    createdAt: new Date(),
  });

  const plan = buildFinancePlan({
    transactions: [
      mortgageTransaction("2026-01", 3000),
      mortgageTransaction("2026-02", 3000),
      mortgageTransaction("2026-03", 3000),
    ],
    actions: [],
  });

  const mortgageCategory = plan.planSummary.categoryTargets.find(
    (category) => category.category === "Mortgage"
  );

  assert.ok(mortgageCategory);
  assert.equal(mortgageCategory.monthlyTarget, 3000);
  assert.equal(mortgageCategory.trailingAverage, 3000);
  assert.equal(mortgageCategory.trailingTotal, 9000);
  assert.equal(plan.planSummary.trailingAverageSpend, 3000);
  assert.deepEqual(
    plan.monthlyChart.map((entry) => entry.month),
    ["2026-01", "2026-02", "2026-03"]
  );
});

test("Cash flow summary separates total budget from category allocations", () => {
  const transactions: FinanceTransaction[] = [
    {
      id: "spend-1",
      projectId: "project-1",
      transactionDate: "2026-03-05",
      account: "Checking",
      description: "Groceries",
      normalizedMerchant: "Whole Foods",
      rawCategory: "Groceries",
      tags: null,
      amountSigned: -400,
      outflowAmount: 400,
      mappedCategory: "Groceries",
      categoryGroup: "flexible",
      includeFlag: true,
      exclusionReason: null,
      notes: null,
      createdAt: new Date(),
    },
    {
      id: "income-1",
      projectId: "project-1",
      transactionDate: "2026-03-20",
      account: "Checking",
      description: "Payroll",
      normalizedMerchant: "Datadog Payroll",
      rawCategory: "Paychecks/Salary",
      tags: null,
      amountSigned: 5000,
      outflowAmount: 0,
      mappedCategory: "Paychecks/Salary",
      categoryGroup: "excluded",
      includeFlag: false,
      exclusionReason: "Excluded by default category rule",
      notes: null,
      createdAt: new Date(),
    },
  ];

  const summary = buildFinanceCashFlowSummary({
    categoryBudgetTotal: 3000,
    targets: {
      totalMonthlyBudgetTarget: 4500,
      totalMonthlyIncomeTarget: 7000,
    },
    transactions,
  });

  assert.equal(summary.totalMonthlyBudgetTarget, 4500);
  assert.equal(summary.totalMonthlyIncomeTarget, 7000);
  assert.equal(summary.categoryBudgetTotal, 3000);
  assert.equal(summary.catchAllBudget, 1500);
  assert.equal(summary.historicalAverageMonthlySpend, 33.33);
  assert.equal(summary.historicalAverageMonthlyIncome, 416.67);
});

