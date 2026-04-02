import type { Transaction } from "@/lib/db/schema";
import {
  getDefaultMappedBucket,
  getDefaultFinanceExclusionActions,
  resolveBucketGroupFromBucket,
} from "./config";
import { applyFinanceOverrides } from "./overrides";
import type { FinanceAction, FinanceTransaction } from "./types";

export function buildBaseFinanceTransaction(
  transaction: Transaction
): FinanceTransaction {
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
      includeFlag: true,
    }),
    includeFlag: true,
    exclusionReason: null,
    notes: transaction.notes,
    createdAt: transaction.createdAt,
  };
}

export function buildInitialFinanceTransactions(
  transactions: Transaction[]
): FinanceTransaction[] {
  const baseTransactions = transactions.map(buildBaseFinanceTransaction);

  return applyFinanceOverrides(
    baseTransactions,
    getDefaultFinanceExclusionActions()
  );
}

export function categorizeTransactions({
  transactions,
  actions,
}: {
  transactions: Transaction[];
  actions: FinanceAction[];
}) {
  const baseTransactions = buildInitialFinanceTransactions(transactions);
  return applyFinanceOverrides(baseTransactions, actions);
}
