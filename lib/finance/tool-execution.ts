import {
  getTransactionsByProjectId,
  saveFinanceOverrides,
} from "@/lib/db/finance-queries";
import { getTransactionMatchStats, summarizeFinanceAction } from "./overrides";
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
  const dedupedActions = uniqueBy(actions, (action) => JSON.stringify(action));
  const [beforeSnapshot, transactions] = await Promise.all([
    getFinanceSnapshot({ projectId }),
    getTransactionsByProjectId({ projectId }),
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
    if (
      action.type === "exclude_transactions" ||
      action.type === "include_transactions" ||
      action.type === "categorize_transactions"
    ) {
      const stats = getTransactionMatchStats(action, transactions);

      if (stats.matchedTransactions === 0) {
        skippedActions.push({
          action,
          reason: "No matching transactions were found for this change.",
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
