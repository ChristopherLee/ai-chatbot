import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildHeuristicActions } from "@/lib/finance/action-parser";
import { categorizeTransactions } from "@/lib/finance/categorize";
import { parseTransactionsCsv } from "@/lib/finance/csv-ingest";
import { buildFinancePlan } from "@/lib/finance/planner";
import type {
  FinanceAction,
  FinanceSnapshot,
  FinanceTransaction,
} from "@/lib/finance/types";

const csvText = readFileSync("data/transactions.csv.csv", "utf8");

test("CSV ingest accepts the sample header and normalizes signed amounts", () => {
  const parsed = parseTransactionsCsv({
    projectId: "project-1",
    filename: "transactions.csv.csv",
    csvText,
  });

  assert.equal(
    parsed.headers.join(","),
    "Date,Account,Description,Category,Tags,Amount"
  );
  assert.equal(parsed.transactions.length > 1000, true);

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

test("Default categorization excludes transfer-like rows and maps common categories", () => {
  const parsed = parseTransactionsCsv({
    projectId: "project-1",
    filename: "transactions.csv.csv",
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
  assert.equal(transfer.bucketGroup, "excluded");

  assert.ok(restaurant);
  assert.equal(restaurant.mappedBucket, "Dining");
  assert.equal(restaurant.includeFlag, true);
});

test("Heuristic actions prefer match-based categorization for merchant labels", () => {
  const snapshot: FinanceSnapshot = {
    status: "ready",
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
      bucketTargets: [
        {
          bucket: "Mortgage",
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

test("Match-based categorization only updates matching transactions", () => {
  const parsed = parseTransactionsCsv({
    projectId: "project-1",
    filename: "transactions.csv.csv",
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
  assert.equal(crosscountry.mappedBucket, "Mortgage");
  assert.equal(crosscountry.bucketGroup, "fixed");

  assert.ok(otherExpense);
  assert.equal(otherExpense.mappedBucket, "Other / Misc");
  assert.equal(otherExpense.bucketGroup, "flexible");
});

test("Single-transaction categorization only updates the targeted transaction", () => {
  const parsed = parseTransactionsCsv({
    projectId: "project-1",
    filename: "transactions.csv.csv",
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
  assert.equal(updatedTransaction.mappedBucket, "Mortgage");
  assert.equal(updatedTransaction.bucketGroup, "fixed");

  assert.ok(unaffectedTransaction);
  assert.equal(unaffectedTransaction.mappedBucket, "Other / Misc");
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
    mappedBucket: "Mortgage",
    bucketGroup: "fixed",
    includeFlag: true,
    exclusionReason: null,
    notes: null,
    createdAt: new Date(),
  });

  const actions: FinanceAction[] = [
    {
      type: "set_bucket_monthly_target",
      bucket: "Mortgage",
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
