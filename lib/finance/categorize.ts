import type { Transaction } from "@/lib/db/schema";
import {
  getDefaultMappedBucket,
  isExcludedRawCategory,
  resolveBucketGroupFromBucket,
} from "./config";
import { applyFinanceOverrides } from "./overrides";
import type { FinanceAction, FinanceTransaction } from "./types";

export function buildBaseFinanceTransaction(
  transaction: Transaction
): FinanceTransaction {
  const includeFlag = !isExcludedRawCategory(transaction.rawCategory);
  const mappedBucket = getDefaultMappedBucket(transaction.rawCategory);

  return {
    id: transaction.id,
    projectId: transaction.projectId,
    transactionDate: transaction.transactionDate,
    account: transaction.account,
    description: transaction.description,
    normalizedMerchant: transaction.normalizedMerchant,
    rawCategory: transaction.rawCategory,
    tags: transaction.tags,
    amountSigned: transaction.amountSigned,
    outflowAmount: transaction.outflowAmount,
    mappedBucket,
    bucketGroup: resolveBucketGroupFromBucket({
      bucket: mappedBucket,
      includeFlag,
    }),
    includeFlag,
    exclusionReason: includeFlag ? null : "Excluded by default category rule",
    notes: transaction.notes,
    createdAt: transaction.createdAt,
  };
}

export function categorizeTransactions({
  transactions,
  actions,
}: {
  transactions: Transaction[];
  actions: FinanceAction[];
}) {
  const baseTransactions = transactions.map(buildBaseFinanceTransaction);
  return applyFinanceOverrides(baseTransactions, actions);
}
