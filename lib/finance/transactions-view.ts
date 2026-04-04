import {
  getFinanceOverridesByProjectId,
  getTransactionsByProjectId,
} from "@/lib/db/finance-queries";
import type { FinanceOverride as StoredFinanceOverride } from "@/lib/db/schema";
import { buildInitialFinanceTransactions } from "./categorize";
import {
  applyFinanceOverrides,
  getFinanceActionsFromOverrides,
} from "./overrides";
import {
  type FinanceTransactionQueryInput,
  queryFinanceTransactions,
} from "./query-transactions";
import type { FinanceSnapshotStatus, FinanceTransaction } from "./types";
import { financeActionSchema } from "./types";

export type FinanceTransactionExclusionSource =
  | "default"
  | "rule"
  | "transaction";

export type FinanceTransactionsViewData = {
  projectId: string;
  projectTitle: string;
  snapshotStatus: FinanceSnapshotStatus;
  filters: FinanceTransactionQueryInput;
  summary: {
    matchedCount: number;
    returnedCount: number;
    truncated: boolean;
    totalMatchedOutflow: number;
    matchedIncludedCount: number;
    matchedExcludedCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
    startIndex: number;
    endIndex: number;
  };
  options: {
    accounts: string[];
    categories: string[];
    dateRange: {
      start: string;
      end: string;
    } | null;
  };
  transactions: Array<{
    id: string;
    transactionDate: string;
    description: string;
    merchant: string;
    account: string;
    amount: number;
    category: string;
    includeFlag: boolean;
    exclusionReason: string | null;
    exclusionSource: FinanceTransactionExclusionSource | null;
    oneOffExcludeRuleId: string | null;
  }>;
};

export type LoadedFinanceTransactionState = {
  overrides: StoredFinanceOverride[];
  baseTransactions: FinanceTransaction[];
  finalTransactions: FinanceTransaction[];
  oneOffExcludeRuleIdsByTransactionId: Map<string, string>;
};

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function buildOneOffExcludeRuleIdsByTransactionId(
  overrides: StoredFinanceOverride[]
) {
  const lookup = new Map<string, string>();

  for (const override of overrides) {
    const parsed = financeActionSchema.safeParse(override.valueJson);

    if (!parsed.success || parsed.data.type !== "exclude_transaction") {
      continue;
    }

    lookup.set(parsed.data.transactionId, override.id);
  }

  return lookup;
}

export function getTransactionScopedOverrideIds({
  overrides,
  transactionId,
}: {
  overrides: StoredFinanceOverride[];
  transactionId: string;
}) {
  return overrides.flatMap((override) => {
    const parsed = financeActionSchema.safeParse(override.valueJson);

    if (
      !parsed.success ||
      (parsed.data.type !== "categorize_transaction" &&
        parsed.data.type !== "exclude_transaction") ||
      parsed.data.transactionId !== transactionId
    ) {
      return [];
    }

    return [override.id];
  });
}

export function getTransactionExclusionSource({
  baseTransaction,
  finalTransaction,
  oneOffExcludeRuleId,
}: {
  baseTransaction: FinanceTransaction | undefined;
  finalTransaction: FinanceTransaction;
  oneOffExcludeRuleId: string | null;
}): FinanceTransactionExclusionSource | null {
  if (finalTransaction.includeFlag) {
    return null;
  }

  if (oneOffExcludeRuleId) {
    return "transaction";
  }

  if (baseTransaction?.includeFlag === false) {
    return "default";
  }

  return "rule";
}

export async function loadFinanceTransactionState({
  projectId,
}: {
  projectId: string;
}): Promise<LoadedFinanceTransactionState> {
  const [transactions, overrides] = await Promise.all([
    getTransactionsByProjectId({ projectId }),
    getFinanceOverridesByProjectId({ projectId }),
  ]);
  const baseTransactions = buildInitialFinanceTransactions(transactions);
  const actions = getFinanceActionsFromOverrides(overrides);

  return {
    overrides,
    baseTransactions,
    finalTransactions: applyFinanceOverrides(baseTransactions, actions),
    oneOffExcludeRuleIdsByTransactionId:
      buildOneOffExcludeRuleIdsByTransactionId(overrides),
  };
}

export async function getFinanceTransactionsViewData({
  projectId,
  projectTitle,
  snapshotStatus,
  filters,
}: {
  projectId: string;
  projectTitle: string;
  snapshotStatus: FinanceSnapshotStatus;
  filters: FinanceTransactionQueryInput;
}): Promise<FinanceTransactionsViewData> {
  const state = await loadFinanceTransactionState({ projectId });
  const query = queryFinanceTransactions({
    transactions: state.finalTransactions,
    filters,
  });
  const baseTransactionsById = new Map(
    state.baseTransactions.map((transaction) => [transaction.id, transaction])
  );
  const finalTransactionsById = new Map(
    state.finalTransactions.map((transaction) => [transaction.id, transaction])
  );
  const sortedDates = state.finalTransactions
    .map((transaction) => transaction.transactionDate)
    .sort();
  const startDate = sortedDates[0];
  const endDate = sortedDates.at(-1);

  return {
    projectId,
    projectTitle,
    snapshotStatus,
    filters: query.filters,
    summary: {
      matchedCount: query.matchedCount,
      returnedCount: query.returnedCount,
      truncated: query.truncated,
      totalMatchedOutflow: query.totalMatchedOutflow,
      matchedIncludedCount: query.matchedIncludedCount,
      matchedExcludedCount: query.matchedExcludedCount,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: query.totalPages,
      hasPreviousPage: query.hasPreviousPage,
      hasNextPage: query.hasNextPage,
      startIndex: query.startIndex,
      endIndex: query.endIndex,
    },
    options: {
      accounts: uniqueSorted(
        state.finalTransactions.map((transaction) => transaction.account)
      ),
      categories: uniqueSorted(
        state.finalTransactions.map((transaction) => transaction.mappedCategory)
      ),
      dateRange:
        startDate && endDate
          ? {
              start: startDate,
              end: endDate,
            }
          : null,
    },
    transactions: query.transactions
      .map((transaction) => {
        const finalTransaction = finalTransactionsById.get(transaction.id);

        if (!finalTransaction) {
          return null;
        }

        const oneOffExcludeRuleId =
          state.oneOffExcludeRuleIdsByTransactionId.get(transaction.id) ?? null;

        return {
          id: finalTransaction.id,
          transactionDate: finalTransaction.transactionDate,
          description: finalTransaction.description,
          merchant: finalTransaction.normalizedMerchant,
          account: finalTransaction.account,
          amount: finalTransaction.outflowAmount,
          category: finalTransaction.mappedCategory,
          includeFlag: finalTransaction.includeFlag,
          exclusionReason: finalTransaction.exclusionReason,
          exclusionSource: getTransactionExclusionSource({
            baseTransaction: baseTransactionsById.get(finalTransaction.id),
            finalTransaction,
            oneOffExcludeRuleId,
          }),
          oneOffExcludeRuleId,
        };
      })
      .filter(
        (
          transaction
        ): transaction is FinanceTransactionsViewData["transactions"][number] =>
          transaction !== null
      ),
  };
}
