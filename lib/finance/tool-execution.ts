import {
  getFinanceOverridesByProjectId,
  getTransactionsByProjectId,
  saveFinanceOverrides,
} from "@/lib/db/finance-queries";
import { buildFinanceActionKey } from "./action-keys";
import { categorizeTransactions } from "./categorize";
import {
  getFinanceActionsFromOverrides,
  getLockedCategorizationTransactionIds,
  getTransactionMatchStats,
  summarizeFinanceAction,
} from "./overrides";
import {
  type FinanceTransactionQueryInput,
  queryFinanceTransactions,
} from "./query-transactions";
import { getFinanceSnapshot, recomputeFinanceSnapshot } from "./snapshot";
import type { FinanceAction, FinanceSnapshot } from "./types";
import { uniqueBy } from "./utils";

function buildSnapshotSummary(snapshot: FinanceSnapshot) {
  return {
    status: snapshot.status,
    includedOutflow: snapshot.datasetSummary?.includedOutflow ?? null,
    totalMonthlyTarget: snapshot.planSummary?.totalMonthlyTarget ?? null,
    trailingAverageSpend: snapshot.planSummary?.trailingAverageSpend ?? null,
    topBuckets:
      snapshot.planSummary?.bucketTargets.slice(0, 5).map((bucket) => ({
        bucket: bucket.bucket,
        group: bucket.group,
        monthlyTarget: bucket.monthlyTarget,
      })) ?? [],
  };
}

export async function applyFinanceActionsForChat({
  projectId,
  actions,
}: {
  projectId: string;
  actions: FinanceAction[];
}) {
  const dedupedActions = uniqueBy(actions, (action) =>
    buildFinanceActionKey(action)
  );
  const [beforeSnapshot, transactions, existingOverrides] = await Promise.all([
    getFinanceSnapshot({ projectId }),
    getTransactionsByProjectId({ projectId }),
    getFinanceOverridesByProjectId({ projectId }),
  ]);
  const existingActions = getFinanceActionsFromOverrides(existingOverrides);
  const existingActionKeys = new Set(
    existingActions.map((action) => buildFinanceActionKey(action))
  );
  const lockedCategorizationTransactionIds =
    getLockedCategorizationTransactionIds([
      ...existingActions,
      ...dedupedActions,
    ]);

  const appliedActions: Array<{
    action: FinanceAction;
    summary: string;
    matchedTransactions: number | null;
    affectedOutflow: number | null;
  }> = [];
  const skippedActions: Array<{
    action: FinanceAction;
    reason: string;
  }> = [];

  for (const action of dedupedActions) {
    const actionKey = buildFinanceActionKey(action);

    if (existingActionKeys.has(actionKey)) {
      skippedActions.push({
        action,
        reason: "This change is already applied.",
      });
      continue;
    }

    if (
      action.type === "exclude_transactions" ||
      action.type === "include_transactions" ||
      action.type === "categorize_transactions"
    ) {
      const stats = getTransactionMatchStats(action, transactions, {
        excludeTransactionIds:
          action.type === "categorize_transactions"
            ? lockedCategorizationTransactionIds
            : undefined,
      });

      if (stats.matchedTransactions === 0) {
        skippedActions.push({
          action,
          reason:
            action.type === "categorize_transactions"
              ? "No matching transactions were found after excluding manually overridden transactions."
              : "No matching transactions were found for this change.",
        });
        continue;
      }

      appliedActions.push({
        action,
        summary: summarizeFinanceAction(action),
        matchedTransactions: stats.matchedTransactions,
        affectedOutflow: stats.affectedOutflow,
      });
      continue;
    }

    if (action.type === "categorize_transaction") {
      const matchedTransaction = transactions.find(
        (transaction) => transaction.id === action.transactionId
      );

      if (!matchedTransaction) {
        skippedActions.push({
          action,
          reason: "The suggested transaction could not be found anymore.",
        });
        continue;
      }

      appliedActions.push({
        action,
        summary: summarizeFinanceAction(action),
        matchedTransactions: 1,
        affectedOutflow: matchedTransaction.outflowAmount,
      });
      continue;
    }

    appliedActions.push({
      action,
      summary: summarizeFinanceAction(action),
      matchedTransactions: null,
      affectedOutflow: null,
    });
  }

  let afterSnapshot = beforeSnapshot;

  if (appliedActions.length > 0) {
    await saveFinanceOverrides({
      projectId,
      actions: appliedActions.map((item) => item.action),
    });
    afterSnapshot = await recomputeFinanceSnapshot({ projectId });
  }

  return {
    appliedActions,
    skippedActions,
    before: buildSnapshotSummary(beforeSnapshot),
    after: buildSnapshotSummary(afterSnapshot),
    snapshot: afterSnapshot,
  };
}

export async function refreshFinancePlanForChat({
  projectId,
}: {
  projectId: string;
}) {
  const beforeSnapshot = await getFinanceSnapshot({ projectId });
  const afterSnapshot = await recomputeFinanceSnapshot({ projectId });

  return {
    before: buildSnapshotSummary(beforeSnapshot),
    after: buildSnapshotSummary(afterSnapshot),
    snapshot: afterSnapshot,
  };
}

export async function getFinanceSnapshotForChat({
  projectId,
}: {
  projectId: string;
}) {
  const snapshot = await getFinanceSnapshot({ projectId });

  return {
    current: buildSnapshotSummary(snapshot),
    snapshot,
  };
}

export async function queryFinanceTransactionsForChat({
  projectId,
  ...filters
}: {
  projectId: string;
} & FinanceTransactionQueryInput) {
  const [transactions, overrides] = await Promise.all([
    getTransactionsByProjectId({ projectId }),
    getFinanceOverridesByProjectId({ projectId }),
  ]);
  const actions = getFinanceActionsFromOverrides(overrides);
  const categorizedTransactions = categorizeTransactions({
    transactions,
    actions,
  });

  return queryFinanceTransactions({
    transactions: categorizedTransactions,
    filters,
  });
}
