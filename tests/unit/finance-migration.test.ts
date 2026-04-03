import assert from "node:assert/strict";
import test from "node:test";
import { getTransactionMatchStats } from "@/lib/finance/overrides";
import {
  assertFinanceCategoryMigrationSafety,
  migrateLegacyFinanceAction,
} from "@/lib/finance/legacy-action-migration";
import type { FinanceTransaction } from "@/lib/finance/types";

const transactions: FinanceTransaction[] = [
  {
    id: "tx-1",
    projectId: "project-1",
    transactionDate: "2026-03-01",
    account: "Checking",
    description: "Lunch",
    normalizedMerchant: "Lunch",
    rawCategory: "Restaurants",
    tags: null,
    amountSigned: -18,
    outflowAmount: 18,
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
    transactionDate: "2026-03-02",
    account: "Checking",
    description: "Dinner",
    normalizedMerchant: "Dinner",
    rawCategory: "Restaurants",
    tags: null,
    amountSigned: -42,
    outflowAmount: 42,
    mappedCategory: "Dining",
    categoryGroup: "flexible",
    includeFlag: true,
    exclusionReason: null,
    notes: null,
    createdAt: new Date(),
  },
  {
    id: "tx-3",
    projectId: "project-1",
    transactionDate: "2026-03-03",
    account: "Checking",
    description: "Mortgage",
    normalizedMerchant: "Mortgage",
    rawCategory: "Other Expenses",
    tags: null,
    amountSigned: -2_300,
    outflowAmount: 2_300,
    mappedCategory: "Mortgage",
    categoryGroup: "fixed",
    includeFlag: true,
    exclusionReason: null,
    notes: null,
    createdAt: new Date(),
  },
];

test("legacy remap_raw_category overrides migrate to equivalent categorize_transactions rules", () => {
  const migratedAction = migrateLegacyFinanceAction({
    type: "remap_raw_category",
    from: "Restaurants",
    to: "Dining Out",
  });

  assert.deepEqual(migratedAction, {
    type: "categorize_transactions",
    match: {
      rawCategory: "Restaurants",
    },
    to: "Dining Out",
  });

  assert.equal(migratedAction.type, "categorize_transactions");

  const stats = getTransactionMatchStats(migratedAction, transactions);

  assert.equal(stats.matchedTransactions, 2);
  assert.equal(stats.affectedOutflow, 60);
});

test("legacy bucket monthly targets migrate to category monthly targets", () => {
  assert.deepEqual(
    migrateLegacyFinanceAction({
      type: "set_bucket_monthly_target",
      bucket: "Groceries",
      amount: 600,
      effectiveMonth: "2026-05",
    }),
    {
      type: "set_category_monthly_target",
      category: "Groceries",
      amount: 600,
      effectiveMonth: "2026-05",
    }
  );
});

test("finance category migration safety check aborts when removed override rows exist", () => {
  assert.throws(
    () =>
      assertFinanceCategoryMigrationSafety({
        remapRawCategoryCount: 1,
        renameBucketCount: 1,
        mergeBucketsCount: 0,
      }),
    /rename_bucket=1, merge_buckets=0/
  );

  assert.doesNotThrow(() =>
    assertFinanceCategoryMigrationSafety({
      remapRawCategoryCount: 1,
      renameBucketCount: 0,
      mergeBucketsCount: 0,
    })
  );
});
