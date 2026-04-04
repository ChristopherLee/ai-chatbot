import {
  getFinanceOverridesByProjectId,
  getTransactionsByProjectId,
  saveFinanceOverrides,
} from "@/lib/db/finance-queries";
import { getProjectById } from "@/lib/db/queries";
import { buildFinanceActionKey } from "./action-keys";
import {
  buildCategoryBudgetSuggestions,
  getCurrentCategoryBudgetOverrides,
  resolveCategoryBudgetGroup,
} from "./category-budgets";
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
import { getFinanceRulesViewData } from "./rules";
import { getFinanceSnapshot, recomputeFinanceSnapshot } from "./snapshot";
import {
  summarizeFinanceTransactions,
  type FinanceTransactionSummaryInput,
} from "./summarize-transactions";
import type { FinanceAction, FinanceSnapshot } from "./types";
import { roundCurrency, safeLower, toMonthKey, uniqueBy } from "./utils";

function buildSnapshotSummary(snapshot: FinanceSnapshot) {
  return {
    status: snapshot.status,
    includedOutflow: snapshot.datasetSummary?.includedOutflow ?? null,
    totalMonthlyBudgetTarget:
      snapshot.cashFlowSummary.totalMonthlyBudgetTarget ?? null,
    totalMonthlyIncomeTarget:
      snapshot.cashFlowSummary.totalMonthlyIncomeTarget ?? null,
    categoryBudgetTotal: snapshot.cashFlowSummary.categoryBudgetTotal,
    suggestedMonthlyTarget: snapshot.planSummary?.totalMonthlyTarget ?? null,
    catchAllBudget: snapshot.cashFlowSummary.catchAllBudget,
    historicalAverageMonthlyIncome:
      snapshot.cashFlowSummary.historicalAverageMonthlyIncome,
    historicalAverageMonthlySpend:
      snapshot.cashFlowSummary.historicalAverageMonthlySpend,
    trailingAverageSpend: snapshot.planSummary?.trailingAverageSpend ?? null,
    topCategories:
      snapshot.planSummary?.categoryTargets.slice(0, 5).map((category) => ({
        category: category.category,
        group: category.group,
        monthlyTarget: category.monthlyTarget,
      })) ?? [],
  };
}

async function buildFinanceBudgetTargetsData({
  projectId,
  projectTitle,
  snapshot,
}: {
  projectId: string;
  projectTitle?: string;
  snapshot?: FinanceSnapshot;
}) {
  const [project, resolvedSnapshot, overrides] = await Promise.all([
    projectTitle ? Promise.resolve(null) : getProjectById({ id: projectId }),
    snapshot ? Promise.resolve(snapshot) : getFinanceSnapshot({ projectId }),
    getFinanceOverridesByProjectId({ projectId }),
  ]);
  const currentCategoryBudgets = getCurrentCategoryBudgetOverrides(overrides);
  const latestTransactionDate = resolvedSnapshot.datasetSummary?.dateRange.end ?? null;
  const currentMonth = latestTransactionDate
    ? toMonthKey(latestTransactionDate)
    : null;

  return {
    projectId,
    projectTitle: projectTitle ?? project?.title ?? "Finance project",
    snapshotStatus: resolvedSnapshot.status,
    planMode: resolvedSnapshot.planSummary?.mode ?? null,
    latestTransactionDate,
    cashFlowSummary: resolvedSnapshot.cashFlowSummary,
    suggestedCategoryBudgetTotal:
      resolvedSnapshot.planSummary?.totalMonthlyTarget ?? null,
    categoryBudgets: currentCategoryBudgets
      .map((budget) => {
        const categoryCard = resolvedSnapshot.categoryCards.find(
          (card) => safeLower(card.category) === safeLower(budget.category)
        );
        const currentMonthEntry = currentMonth
          ? categoryCard?.monthly.find((entry) => entry.month === currentMonth)
          : null;

        return {
          category: budget.category,
          group: resolveCategoryBudgetGroup({
            category: budget.category,
            categoryCards: resolvedSnapshot.categoryCards,
          }),
          amount: budget.amount,
          overrideId: budget.overrideId,
          lastMonthActual: roundCurrency(
            currentMonthEntry?.actual ?? categoryCard?.trailingAverage ?? 0
          ),
        };
      })
      .sort(
        (left, right) =>
          right.amount - left.amount || left.category.localeCompare(right.category)
      ),
    suggestedCategoryBudgets: buildCategoryBudgetSuggestions({
      categoryCards: resolvedSnapshot.categoryCards,
      currentBudgets: currentCategoryBudgets,
      latestTransactionDate,
    }),
  };
}

async function getCategorizedTransactionsForProject(projectId: string) {
  const [transactions, overrides] = await Promise.all([
    getTransactionsByProjectId({ projectId }),
    getFinanceOverridesByProjectId({ projectId }),
  ]);
  const actions = getFinanceActionsFromOverrides(overrides);

  return categorizeTransactions({
    transactions,
    actions,
  });
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

    if (action.type === "exclude_transaction") {
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

export async function refreshFinancePlanForChat({
  projectId,
}: {
  projectId: string;
}) {
  const snapshot = await recomputeFinanceSnapshot({ projectId });

  return {
    current: buildSnapshotSummary(snapshot),
  };
}

export async function getFinanceBudgetTargetsForChat({
  projectId,
}: {
  projectId: string;
}) {
  return buildFinanceBudgetTargetsData({ projectId });
}

export async function getFinanceRulesForChat({
  projectId,
}: {
  projectId: string;
}) {
  return getFinanceRulesViewData({ projectId });
}

export async function queryFinanceTransactionsForChat({
  projectId,
  ...filters
}: {
  projectId: string;
} & FinanceTransactionQueryInput) {
  const categorizedTransactions =
    await getCategorizedTransactionsForProject(projectId);

  return queryFinanceTransactions({
    transactions: categorizedTransactions,
    filters,
  });
}

export async function summarizeFinanceTransactionsForChat({
  projectId,
  ...filters
}: {
  projectId: string;
} & FinanceTransactionSummaryInput) {
  const categorizedTransactions =
    await getCategorizedTransactionsForProject(projectId);

  return summarizeFinanceTransactions({
    transactions: categorizedTransactions,
    filters,
  });
}
