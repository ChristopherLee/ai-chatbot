import assert from "node:assert/strict";
import test from "node:test";
import {
  type FinanceTransactionQueryInput,
  queryFinanceTransactions,
} from "@/lib/finance/query-transactions";
import { summarizeFinanceTransactions } from "@/lib/finance/summarize-transactions";
import type { FinanceTransaction } from "@/lib/finance/types";

const transactions: FinanceTransaction[] = [
  {
    id: "tx-1",
    projectId: "project-1",
    transactionDate: "2026-03-01",
    account: "Checking",
    description: "Starbucks coffee",
    normalizedMerchant: "Starbucks",
    rawCategory: "Restaurants",
    tags: null,
    amountSigned: -8.5,
    outflowAmount: 8.5,
    mappedCategory: "Dining",
    categoryGroup: "flexible",
    includeFlag: true,
    exclusionReason: null,
    notes: null,
    createdAt: new Date(),
  },
  {
    id: "tx-2",
    projectId: "project-1",
    transactionDate: "2026-03-10",
    account: "Checking",
    description: "Whole Foods Market",
    normalizedMerchant: "Whole Foods",
    rawCategory: "Groceries",
    tags: null,
    amountSigned: -95,
    outflowAmount: 95,
    mappedCategory: "Groceries",
    categoryGroup: "flexible",
    includeFlag: true,
    exclusionReason: null,
    notes: null,
    createdAt: new Date(),
  },
  {
    id: "tx-3",
    projectId: "project-1",
    transactionDate: "2026-03-18",
    account: "Checking",
    description: "Direct Debit Crosscountry 1sweb Pymnt",
    normalizedMerchant: "Direct Debit Crosscountry",
    rawCategory: "Other Expenses",
    tags: null,
    amountSigned: -2200,
    outflowAmount: 2200,
    mappedCategory: "Mortgage",
    categoryGroup: "fixed",
    includeFlag: true,
    exclusionReason: null,
    notes: "Manual note",
    createdAt: new Date(),
  },
  {
    id: "tx-4",
    projectId: "project-1",
    transactionDate: "2026-03-22",
    account: "Credit Card",
    description: "Whole Foods Weekly Shop",
    normalizedMerchant: "Whole Foods",
    rawCategory: "Groceries",
    tags: null,
    amountSigned: -140,
    outflowAmount: 140,
    mappedCategory: "Groceries",
    categoryGroup: "flexible",
    includeFlag: true,
    exclusionReason: null,
    notes: null,
    createdAt: new Date(),
  },
  {
    id: "tx-5",
    projectId: "project-1",
    transactionDate: "2026-03-25",
    account: "Checking",
    description: "Internal transfer",
    normalizedMerchant: "Internal Transfer",
    rawCategory: "Transfers",
    tags: null,
    amountSigned: -500,
    outflowAmount: 500,
    mappedCategory: "Transfers",
    categoryGroup: "excluded",
    includeFlag: false,
    exclusionReason: "Manual exclusion",
    notes: null,
    createdAt: new Date(),
  },
];

function runQuery(filters: Partial<FinanceTransactionQueryInput>) {
  return queryFinanceTransactions({
    transactions,
    filters: {
      page: 1,
      sortBy: "date",
      sortDirection: "desc",
      ...filters,
    },
  });
}

test("broad keyword search matches current category and transaction text", () => {
  const result = runQuery({ search: "mortgage" });

  assert.equal(result.matchedCount, 1);
  assert.equal(result.transactions[0]?.id, "tx-3");
});

test("attribute filters support merchant searches with sorting", () => {
  const result = runQuery({
    merchant: "whole",
    includeFlag: true,
    sortBy: "amount",
    sortDirection: "desc",
  });

  assert.equal(result.matchedCount, 2);
  assert.equal(result.transactions[0]?.id, "tx-4");
});

test("query pagination returns the requested page window", () => {
  const paginatedTransactions: FinanceTransaction[] = Array.from(
    { length: 105 },
    (_, index) => ({
      ...transactions[1],
      id: `whole-foods-${index + 1}`,
      transactionDate: `2026-03-${String((index % 28) + 1).padStart(2, "0")}`,
      amountSigned: -(index + 1),
      outflowAmount: index + 1,
    })
  );
  const result = queryFinanceTransactions({
    transactions: paginatedTransactions,
    filters: {
      merchant: "whole",
      page: 2,
      sortBy: "amount",
      sortDirection: "desc",
    },
  });

  assert.equal(result.matchedCount, 105);
  assert.equal(result.page, 2);
  assert.equal(result.totalPages, 2);
  assert.equal(result.startIndex, 101);
  assert.equal(result.endIndex, 105);
  assert.equal(result.returnedCount, 5);
  assert.equal(result.truncated, true);
  assert.equal(result.transactions[0]?.amount, 5);
  assert.equal(result.transactions.at(-1)?.amount, 1);
});

test("exact filters support raw category, category, account, and date ranges", () => {
  const result = runQuery({
    rawCategory: "Other Expenses",
    category: "Mortgage",
    account: "Checking",
    startDate: "2026-03-01",
    endDate: "2026-03-31",
  });

  assert.equal(result.matchedCount, 1);
  assert.equal(result.transactions[0]?.id, "tx-3");
  assert.equal(result.totalMatchedOutflow, 2200);
});

test("transaction summaries group matched outflow by category", () => {
  const result = summarizeFinanceTransactions({
    transactions,
    filters: {
      groupBy: "category",
      includeFlag: true,
      limit: 10,
      sortBy: "totalOutflow",
      sortDirection: "desc",
    },
  });

  assert.equal(result.matchedTransactionCount, 4);
  assert.equal(result.totalMatchedOutflow, 2443.5);
  assert.equal(result.groups[0]?.label, "Mortgage");
  assert.equal(result.groups[0]?.totalOutflow, 2200);
  assert.equal(result.groups[1]?.label, "Groceries");
  assert.equal(result.groups[1]?.transactionCount, 2);
});
