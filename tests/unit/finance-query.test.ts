import assert from "node:assert/strict";
import test from "node:test";
import {
  type FinanceTransactionQueryInput,
  queryFinanceTransactions,
} from "@/lib/finance/query-transactions";
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
    mappedBucket: "Dining",
    bucketGroup: "flexible",
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
    mappedBucket: "Groceries",
    bucketGroup: "flexible",
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
    mappedBucket: "Mortgage",
    bucketGroup: "fixed",
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
    mappedBucket: "Groceries",
    bucketGroup: "flexible",
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
    mappedBucket: "Transfers",
    bucketGroup: "excluded",
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
      limit: 25,
      sortBy: "date",
      sortDirection: "desc",
      ...filters,
    },
  });
}

test("broad keyword search matches current bucket and transaction text", () => {
  const result = runQuery({ search: "mortgage" });

  assert.equal(result.matchedCount, 1);
  assert.equal(result.transactions[0]?.id, "tx-3");
});

test("attribute filters support merchant searches with sorting and truncation", () => {
  const result = runQuery({
    merchant: "whole",
    includeFlag: true,
    minAmount: 90,
    sortBy: "amount",
    sortDirection: "desc",
    limit: 1,
  });

  assert.equal(result.matchedCount, 2);
  assert.equal(result.returnedCount, 1);
  assert.equal(result.truncated, true);
  assert.equal(result.transactions[0]?.id, "tx-4");
});

test("exact filters support raw category, bucket, account, and date ranges", () => {
  const result = runQuery({
    rawCategory: "Other Expenses",
    bucket: "Mortgage",
    account: "Checking",
    startDate: "2026-03-01",
    endDate: "2026-03-31",
  });

  assert.equal(result.matchedCount, 1);
  assert.equal(result.transactions[0]?.id, "tx-3");
  assert.equal(result.totalMatchedOutflow, 2200);
});
