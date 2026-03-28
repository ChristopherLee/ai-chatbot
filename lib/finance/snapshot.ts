import {
  getFinanceOverridesByProjectId,
  getLatestFinancePlanByProjectId,
  getTransactionsByProjectId,
  getUploadedFileByProjectId,
  replaceFinancePlan,
} from "@/lib/db/finance-queries";
import type { UploadedFile as UploadedFileRecord } from "@/lib/db/schema";
import { categorizeTransactions } from "./categorize";
import { EXPECTED_TRANSACTION_HEADERS } from "./config";
import {
  buildAppliedOverrides,
  getFinanceActionsFromOverrides,
} from "./overrides";
import { buildFinancePlan } from "./planner";
import type { FinanceSnapshot, FinanceTransaction } from "./types";
import { roundCurrency } from "./utils";

function buildDatasetSummary({
  file,
  transactions,
  categorizedTransactions,
}: {
  file: UploadedFileRecord;
  transactions: Awaited<ReturnType<typeof getTransactionsByProjectId>>;
  categorizedTransactions: FinanceTransaction[];
}) {
  const sortedDates = transactions
    .map((transaction) => transaction.transactionDate)
    .sort();
  const startDate = sortedDates[0];
  const endDate = sortedDates.at(-1);

  if (!startDate || !endDate) {
    throw new Error("Expected transactions to include a valid date range");
  }

  const totalOutflow = roundCurrency(
    categorizedTransactions.reduce(
      (sum, transaction) => sum + transaction.outflowAmount,
      0
    )
  );

  const includedTransactions = categorizedTransactions.filter(
    (transaction) => transaction.includeFlag
  );
  const includedOutflow = roundCurrency(
    includedTransactions.reduce(
      (sum, transaction) => sum + transaction.outflowAmount,
      0
    )
  );

  const rawCategories = Array.from(
    categorizedTransactions.reduce((map, transaction) => {
      const current = map.get(transaction.rawCategory) ?? {
        name: transaction.rawCategory,
        count: 0,
        totalOutflow: 0,
      };

      current.count += 1;
      current.totalOutflow = roundCurrency(
        current.totalOutflow + transaction.outflowAmount
      );
      map.set(transaction.rawCategory, current);
      return map;
    }, new Map<string, { name: string; count: number; totalOutflow: number }>())
  )
    .map(([, value]) => value)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const accounts = Array.from(
    categorizedTransactions.reduce((map, transaction) => {
      const current = map.get(transaction.account) ?? 0;
      map.set(transaction.account, current + 1);
      return map;
    }, new Map<string, number>())
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return {
    filename: file.filename,
    totalTransactions: categorizedTransactions.length,
    includedTransactions: includedTransactions.length,
    excludedTransactions:
      categorizedTransactions.length - includedTransactions.length,
    totalOutflow,
    includedOutflow,
    dateRange: {
      start: startDate,
      end: endDate,
    },
    sampleHeader: [...EXPECTED_TRANSACTION_HEADERS],
    rawCategories,
    accounts,
  };
}

function emptySnapshot(status: FinanceSnapshot["status"]): FinanceSnapshot {
  return {
    status,
    datasetSummary: null,
    planSummary: null,
    monthlyChart: [],
    cumulativeChart: [],
    categoryCards: [],
    transactionHighlights: [],
    appliedOverrides: [],
  };
}

async function loadFinanceContext(projectId: string) {
  const [file, transactions, overrides] = await Promise.all([
    getUploadedFileByProjectId({ projectId }),
    getTransactionsByProjectId({ projectId }),
    getFinanceOverridesByProjectId({ projectId }),
  ]);

  if (!file || transactions.length === 0) {
    return null;
  }

  const actions = getFinanceActionsFromOverrides(overrides);
  const categorizedTransactions = categorizeTransactions({
    transactions,
    actions,
  });

  return {
    file,
    transactions,
    overrides,
    actions,
    categorizedTransactions,
  };
}

export async function buildNeedsOnboardingSnapshot({
  projectId,
}: {
  projectId: string;
}) {
  const context = await loadFinanceContext(projectId);

  if (!context) {
    return emptySnapshot("needs-upload");
  }

  return {
    status: "needs-onboarding",
    datasetSummary: buildDatasetSummary({
      file: context.file,
      transactions: context.transactions,
      categorizedTransactions: context.categorizedTransactions,
    }),
    planSummary: null,
    monthlyChart: [],
    cumulativeChart: [],
    categoryCards: [],
    transactionHighlights: [...context.categorizedTransactions]
      .filter(
        (transaction) =>
          transaction.includeFlag && transaction.outflowAmount > 0
      )
      .sort((a, b) => b.outflowAmount - a.outflowAmount)
      .slice(0, 12)
      .map((transaction) => ({
        id: transaction.id,
        transactionDate: transaction.transactionDate,
        description: transaction.description,
        merchant: transaction.normalizedMerchant,
        amount: transaction.outflowAmount,
        bucket: transaction.mappedBucket,
        group: transaction.bucketGroup,
      })),
    appliedOverrides: buildAppliedOverrides(context.overrides),
  } satisfies FinanceSnapshot;
}

export async function recomputeFinanceSnapshot({
  projectId,
}: {
  projectId: string;
}) {
  const context = await loadFinanceContext(projectId);

  if (!context) {
    return emptySnapshot("needs-upload");
  }

  const plan = buildFinancePlan({
    transactions: context.categorizedTransactions,
    actions: context.actions,
  });

  const snapshot = {
    status: "ready",
    datasetSummary: buildDatasetSummary({
      file: context.file,
      transactions: context.transactions,
      categorizedTransactions: context.categorizedTransactions,
    }),
    planSummary: plan.planSummary,
    monthlyChart: plan.monthlyChart,
    cumulativeChart: plan.cumulativeChart,
    categoryCards: plan.categoryCards,
    transactionHighlights: plan.transactionHighlights,
    appliedOverrides: buildAppliedOverrides(context.overrides),
  } satisfies FinanceSnapshot;

  await replaceFinancePlan({ projectId, snapshot });

  return snapshot;
}

export async function getFinanceSnapshot({
  projectId,
}: {
  projectId: string;
}): Promise<FinanceSnapshot> {
  const storedPlan = await getLatestFinancePlanByProjectId({ projectId });

  if (storedPlan) {
    return storedPlan.planJson as FinanceSnapshot;
  }

  return buildNeedsOnboardingSnapshot({ projectId });
}
