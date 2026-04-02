import type {
  BucketGroup,
  FinanceCategoryCard,
  FinanceCumulativeChartPoint,
  FinanceMonthlyChartPoint,
  FinanceSnapshot,
  FinanceTargetsResponse,
} from "./types";
import { getMonthLabel, roundCurrency, safeLower } from "./utils";

export type FinanceDashboardLookbackWindow = 1 | 6 | 12;
export type FinanceDashboardView = "analysis" | "overview";
export type FinanceDashboardAnalysisChart = "cumulative" | "monthly";
export type FinanceDashboardOverviewFilter =
  | "all"
  | "needs-attention"
  | "on-track"
  | "unbudgeted";
export type FinanceDashboardRowStatus =
  | "near"
  | "no-budget"
  | "over"
  | "under"
  | "unbudgeted";

export type FinanceDashboardLookbackRange = {
  endLabel: string;
  endMonth: string;
  monthCount: number;
  monthKeys: string[];
  rangeLabel: string;
  requestedMonthCount: FinanceDashboardLookbackWindow;
  startLabel: string;
  startMonth: string;
};

export type FinanceDashboardBudgetEntry = {
  actual: number;
  budget: number | null;
  month: string;
};

export type FinanceDashboardBudgetSummary = {
  activeMonths: number;
  actualTotal: number;
  averageActual: number;
  averageBudget: number | null;
  budgetTotal: number | null;
  onBudgetMonths: number | null;
  progressPercent: number;
  variance: number | null;
};

export type FinanceDashboardTrendPoint = {
  actual: number;
  budget: number | null;
  label: string;
  month: string;
};

export type FinanceDashboardTransactionItem =
  FinanceCategoryCard["transactions"][number] & {
    bucket: string;
    group: BucketGroup;
  };

export type FinanceDashboardOverviewRow = {
  actual: number;
  budget: number | null;
  deltaFromPrevious: number | null;
  group: BucketGroup | null;
  isCatchAll: boolean;
  key: string;
  label: string;
  leftAmount: number | null;
  progressPercent: number;
  status: FinanceDashboardRowStatus;
  topMerchants: FinanceCategoryCard["topMerchants"];
  transactions: FinanceCategoryCard["transactions"];
  trend: FinanceDashboardTrendPoint[];
  variance: number | null;
};

export type FinanceDashboardHero = {
  actual: number;
  budget: number | null;
  budgetLabel: string;
  label: string;
  leftAmount: number | null;
  monthOverMonthChange: number | null;
  needsAttentionCount: number;
  onTrackCount: number;
  progressPercent: number;
  unbudgetedCount: number;
};

export type FinanceDashboardMover = {
  current: number;
  delta: number;
  isCatchAll: boolean;
  key: string;
  label: string;
  previous: number;
};

export type FinanceDashboardAnalysisRow = {
  activeMonths: number;
  averageBudget: number | null;
  averageSpent: number;
  budgetTotal: number | null;
  group: BucketGroup | null;
  isCatchAll: boolean;
  key: string;
  label: string;
  onBudgetMonths: number | null;
  status: FinanceDashboardRowStatus;
  totalSpent: number;
  trend: FinanceDashboardTrendPoint[];
  variance: number | null;
};

export type FinanceDashboardShareRow = {
  amount: number;
  key: string;
  label: string;
  sharePercentage: number;
  status: FinanceDashboardRowStatus;
};

export type FinanceDashboardViewModel = {
  analysisCategoryRows: FinanceDashboardAnalysisRow[];
  analysisCumulativeChart: FinanceCumulativeChartPoint[];
  analysisMonthlyChart: FinanceMonthlyChartPoint[];
  analysisRange: FinanceDashboardLookbackRange;
  analysisShareRows: FinanceDashboardShareRow[];
  analysisSummary: FinanceDashboardBudgetSummary;
  comparisonBudgetsByMonth: Partial<Record<string, number | null>>;
  detailRows: FinanceDashboardOverviewRow[];
  largestTransactions: FinanceDashboardTransactionItem[];
  monthButtons: FinanceMonthlyChartPoint[];
  overviewHero: FinanceDashboardHero;
  overviewRows: FinanceDashboardOverviewRow[];
  previousMonthEntry: FinanceMonthlyChartPoint | null;
  selectedMonthEntry: FinanceMonthlyChartPoint;
  biggestMovers: FinanceDashboardMover[];
};

function clampProgress(actual: number, budget: number | null) {
  if (budget === null || budget <= 0) {
    return actual > 0 ? 100 : 0;
  }

  return Math.max(0, Math.min(100, (actual / budget) * 100));
}

function classifyRowStatus({
  actual,
  budget,
  progressPercent,
  variance,
}: {
  actual: number;
  budget: number | null;
  progressPercent: number;
  variance: number | null;
}) {
  if (budget === null) {
    return actual > 0 ? "unbudgeted" : "no-budget";
  }

  if (budget <= 0) {
    return actual > 0 ? "over" : "no-budget";
  }

  if (variance !== null && variance < 0) {
    return "over";
  }

  if (progressPercent >= 85) {
    return "near";
  }

  return "under";
}

function getRowUrgencyScore(row: FinanceDashboardOverviewRow) {
  const bucket =
    row.status === "over"
      ? 0
      : row.status === "near"
        ? 1
        : row.status === "unbudgeted"
          ? 2
          : row.status === "under"
            ? 3
            : 4;
  const magnitude = Math.abs(row.variance ?? row.actual);

  return {
    bucket,
    magnitude,
  };
}

function buildFlattenedTransactions(categoryCards: FinanceCategoryCard[]) {
  const seen = new Set<string>();
  const items: FinanceDashboardTransactionItem[] = [];

  for (const category of categoryCards) {
    for (const transaction of category.transactions) {
      if (seen.has(transaction.id)) {
        continue;
      }

      seen.add(transaction.id);
      items.push({
        ...transaction,
        bucket: category.bucket,
        group: category.group,
      });
    }
  }

  return items.sort((left, right) => {
    if (left.transactionDate === right.transactionDate) {
      return right.amount - left.amount;
    }

    return right.transactionDate.localeCompare(left.transactionDate);
  });
}

function aggregateTopMerchants(
  transactions: FinanceCategoryCard["transactions"]
): FinanceCategoryCard["topMerchants"] {
  const merchantTotals = new Map<string, number>();

  for (const transaction of transactions) {
    merchantTotals.set(
      transaction.merchant,
      roundCurrency(
        (merchantTotals.get(transaction.merchant) ?? 0) + transaction.amount
      )
    );
  }

  return [...merchantTotals.entries()]
    .map(([merchant, amount]) => ({ amount, merchant }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 5);
}

function getDashboardLookbackMonths({
  data,
  endMonth,
  requestedMonthCount,
}: {
  data: FinanceMonthlyChartPoint[];
  endMonth: string;
  requestedMonthCount: FinanceDashboardLookbackWindow;
}) {
  const endIndex = data.findIndex((entry) => entry.month === endMonth);

  if (endIndex < 0) {
    return [];
  }

  return data.slice(
    Math.max(0, endIndex - requestedMonthCount + 1),
    endIndex + 1
  );
}

export function getDashboardLookbackRange({
  data,
  endMonth,
  requestedMonthCount,
}: {
  data: FinanceMonthlyChartPoint[];
  endMonth: string;
  requestedMonthCount: FinanceDashboardLookbackWindow;
}) {
  const windowMonths = getDashboardLookbackMonths({
    data,
    endMonth,
    requestedMonthCount,
  });
  const startMonth = windowMonths[0]?.month;
  const resolvedEndMonth = windowMonths.at(-1)?.month;

  if (!startMonth || !resolvedEndMonth) {
    return null;
  }

  return {
    endLabel: getMonthLabel(resolvedEndMonth),
    endMonth: resolvedEndMonth,
    monthCount: windowMonths.length,
    monthKeys: windowMonths.map((entry) => entry.month),
    rangeLabel: `${getMonthLabel(startMonth)} to ${getMonthLabel(resolvedEndMonth)}`,
    requestedMonthCount,
    startLabel: getMonthLabel(startMonth),
    startMonth,
  } satisfies FinanceDashboardLookbackRange;
}

export function summarizeBudgetEntries(
  entries: FinanceDashboardBudgetEntry[]
): FinanceDashboardBudgetSummary {
  if (entries.length === 0) {
    return {
      activeMonths: 0,
      actualTotal: 0,
      averageActual: 0,
      averageBudget: null,
      budgetTotal: null,
      onBudgetMonths: null,
      progressPercent: 0,
      variance: null,
    };
  }

  const actualTotal = roundCurrency(
    entries.reduce((sum, entry) => sum + entry.actual, 0)
  );
  const allBudgetsKnown = entries.every((entry) => entry.budget !== null);
  const budgetTotal = allBudgetsKnown
    ? roundCurrency(
        entries.reduce((sum, entry) => sum + (entry.budget ?? 0), 0)
      )
    : null;
  const variance =
    budgetTotal === null ? null : roundCurrency(budgetTotal - actualTotal);
  const averageActual = roundCurrency(actualTotal / entries.length);
  const averageBudget =
    budgetTotal === null ? null : roundCurrency(budgetTotal / entries.length);
  const activeMonths = entries.filter((entry) => entry.actual > 0).length;
  const onBudgetMonths = allBudgetsKnown
    ? entries.filter((entry) => entry.actual <= (entry.budget ?? 0) + 0.01)
        .length
    : null;

  return {
    activeMonths,
    actualTotal,
    averageActual,
    averageBudget,
    budgetTotal,
    onBudgetMonths,
    progressPercent: clampProgress(actualTotal, budgetTotal),
    variance,
  };
}

export function rowMatchesOverviewFilter({
  filter,
  row,
}: {
  filter: FinanceDashboardOverviewFilter;
  row: FinanceDashboardOverviewRow;
}) {
  if (filter === "all") {
    return true;
  }

  if (filter === "needs-attention") {
    return (
      row.status === "near" ||
      row.status === "over" ||
      row.status === "unbudgeted"
    );
  }

  if (filter === "on-track") {
    return row.status === "under";
  }

  return row.status === "no-budget" || row.status === "unbudgeted";
}

function buildTrendPoints({
  budgetByMonth,
  category,
  monthKeys,
}: {
  budgetByMonth?: Map<string, { actual: number; target: number }>;
  category?: FinanceCategoryCard;
  monthKeys: string[];
}) {
  return monthKeys.map((month) => {
    const monthlyEntry = category?.monthly.find(
      (entry) => entry.month === month
    );
    const budgetTotals = budgetByMonth?.get(month);

    return {
      actual: roundCurrency(monthlyEntry?.actual ?? budgetTotals?.actual ?? 0),
      budget:
        category || budgetByMonth
          ? roundCurrency(monthlyEntry?.target ?? budgetTotals?.target ?? 0)
          : null,
      label: getMonthLabel(month),
      month,
    } satisfies FinanceDashboardTrendPoint;
  });
}

export function buildFinanceDashboardViewModel({
  lookbackWindow,
  selectedMonth,
  snapshot,
  targets,
}: {
  lookbackWindow: FinanceDashboardLookbackWindow;
  selectedMonth: string;
  snapshot: FinanceSnapshot;
  targets: FinanceTargetsResponse;
}) {
  const availableMonths = snapshot.monthlyChart;
  const selectedMonthEntry =
    availableMonths.find((entry) => entry.month === selectedMonth) ??
    availableMonths.at(-1);

  if (!selectedMonthEntry) {
    return null;
  }

  const selectedMonthIndex = availableMonths.findIndex(
    (entry) => entry.month === selectedMonthEntry.month
  );
  const previousMonthEntry =
    selectedMonthIndex > 0 ? availableMonths[selectedMonthIndex - 1] : null;
  const detailMonthKeys = availableMonths
    .slice(Math.max(0, selectedMonthIndex - 2), selectedMonthIndex + 1)
    .map((entry) => entry.month);
  const analysisRange = getDashboardLookbackRange({
    data: availableMonths,
    endMonth: selectedMonthEntry.month,
    requestedMonthCount: lookbackWindow,
  });

  if (!analysisRange) {
    return null;
  }

  const budgetedBucketKeys = new Set(
    targets.categoryBudgets.map((budget) => safeLower(budget.bucket))
  );
  const categoryCardsByBucket = new Map<string, FinanceCategoryCard>(
    snapshot.categoryCards.map((category) => [
      safeLower(category.bucket),
      category,
    ])
  );
  const budgetedCategories = targets.categoryBudgets.map((budget) => ({
    bucket: budget.bucket,
    category: categoryCardsByBucket.get(safeLower(budget.bucket)),
    group:
      categoryCardsByBucket.get(safeLower(budget.bucket))?.group ??
      budget.group,
  }));
  const budgetedTotalsByMonth = new Map<
    string,
    {
      actual: number;
      target: number;
    }
  >();

  for (const month of availableMonths) {
    const actual = roundCurrency(
      budgetedCategories.reduce((sum, category) => {
        const entry = category.category?.monthly.find(
          (monthly) => monthly.month === month.month
        );

        return sum + (entry?.actual ?? 0);
      }, 0)
    );
    const target = roundCurrency(
      budgetedCategories.reduce((sum, category) => {
        const entry = category.category?.monthly.find(
          (monthly) => monthly.month === month.month
        );

        return sum + (entry?.target ?? 0);
      }, 0)
    );

    budgetedTotalsByMonth.set(month.month, { actual, target });
  }

  const selectedMonthBudgetTotals = budgetedTotalsByMonth.get(
    selectedMonthEntry.month
  ) ?? { actual: 0, target: 0 };
  const flattenedTransactions = buildFlattenedTransactions(
    snapshot.categoryCards
  );
  const selectedMonthTransactions = flattenedTransactions
    .filter((transaction) =>
      transaction.transactionDate.startsWith(selectedMonthEntry.month)
    )
    .sort((left, right) => right.amount - left.amount);
  const overviewRows = budgetedCategories.map((category) => {
    const currentMonthEntry = category.category?.monthly.find(
      (entry) => entry.month === selectedMonthEntry.month
    );
    const previousMonthActual = previousMonthEntry
      ? roundCurrency(
          category.category?.monthly.find(
            (entry) => entry.month === previousMonthEntry.month
          )?.actual ?? 0
        )
      : null;
    const actual = roundCurrency(currentMonthEntry?.actual ?? 0);
    const budget = roundCurrency(currentMonthEntry?.target ?? 0);
    const variance = roundCurrency(budget - actual);
    const progressPercent = clampProgress(actual, budget);
    const status = classifyRowStatus({
      actual,
      budget,
      progressPercent,
      variance,
    });
    const selectedTransactions = category.category
      ? category.category.transactions
          .filter((transaction) =>
            transaction.transactionDate.startsWith(selectedMonthEntry.month)
          )
          .sort((left, right) => right.amount - left.amount)
      : [];

    return {
      actual,
      budget,
      deltaFromPrevious:
        previousMonthActual === null
          ? null
          : roundCurrency(actual - previousMonthActual),
      group: category.group,
      isCatchAll: false,
      key: safeLower(category.bucket),
      label: category.bucket,
      leftAmount: variance,
      progressPercent,
      status,
      topMerchants: category.category?.topMerchants.slice(0, 5) ?? [],
      transactions:
        selectedTransactions.length > 0
          ? selectedTransactions.slice(0, 8)
          : (category.category?.transactions.slice(0, 8) ?? []),
      trend: buildTrendPoints({
        category: category.category,
        monthKeys: detailMonthKeys,
      }),
      variance,
    } satisfies FinanceDashboardOverviewRow;
  });
  const unbudgetedCategories = snapshot.categoryCards.filter(
    (category) => !budgetedBucketKeys.has(safeLower(category.bucket))
  );
  const catchAllBudget =
    targets.cashFlowSummary.totalMonthlyBudgetTarget === null
      ? null
      : roundCurrency(
          targets.cashFlowSummary.totalMonthlyBudgetTarget -
            selectedMonthBudgetTotals.target
        );
  const catchAllActual = roundCurrency(
    Math.max(0, selectedMonthEntry.actual - selectedMonthBudgetTotals.actual)
  );
  const catchAllVariance =
    catchAllBudget === null
      ? null
      : roundCurrency(catchAllBudget - catchAllActual);
  const catchAllProgressPercent = clampProgress(catchAllActual, catchAllBudget);
  const unbudgetedTransactions =
    buildFlattenedTransactions(unbudgetedCategories);
  const catchAllSelectedTransactions = unbudgetedTransactions
    .filter((transaction) =>
      transaction.transactionDate.startsWith(selectedMonthEntry.month)
    )
    .sort((left, right) => right.amount - left.amount);
  const catchAllPreviousActual = previousMonthEntry
    ? roundCurrency(
        Math.max(
          0,
          previousMonthEntry.actual -
            (budgetedTotalsByMonth.get(previousMonthEntry.month)?.actual ?? 0)
        )
      )
    : null;
  const catchAllRow = {
    actual: catchAllActual,
    budget: catchAllBudget,
    deltaFromPrevious:
      catchAllPreviousActual === null
        ? null
        : roundCurrency(catchAllActual - catchAllPreviousActual),
    group: null,
    isCatchAll: true,
    key: "__catch_all__",
    label: "Everything else",
    leftAmount: catchAllVariance,
    progressPercent: catchAllProgressPercent,
    status: classifyRowStatus({
      actual: catchAllActual,
      budget: catchAllBudget,
      progressPercent: catchAllProgressPercent,
      variance: catchAllVariance,
    }),
    topMerchants: aggregateTopMerchants(
      catchAllSelectedTransactions.length > 0
        ? catchAllSelectedTransactions
        : unbudgetedTransactions.slice(0, 12)
    ),
    transactions:
      catchAllSelectedTransactions.length > 0
        ? catchAllSelectedTransactions.slice(0, 8)
        : unbudgetedTransactions.slice(0, 8),
    trend: detailMonthKeys.map((month) => {
      const monthlyBudgeted = budgetedTotalsByMonth.get(month) ?? {
        actual: 0,
        target: 0,
      };
      const monthlyActual =
        availableMonths.find((entry) => entry.month === month)?.actual ?? 0;

      return {
        actual: roundCurrency(
          Math.max(0, monthlyActual - monthlyBudgeted.actual)
        ),
        budget:
          targets.cashFlowSummary.totalMonthlyBudgetTarget === null
            ? null
            : roundCurrency(
                targets.cashFlowSummary.totalMonthlyBudgetTarget -
                  monthlyBudgeted.target
              ),
        label: getMonthLabel(month),
        month,
      } satisfies FinanceDashboardTrendPoint;
    }),
    variance: catchAllVariance,
  } satisfies FinanceDashboardOverviewRow;
  const shouldShowCatchAllRow =
    catchAllBudget !== null ||
    catchAllActual > 0 ||
    unbudgetedCategories.length > 0 ||
    overviewRows.length === 0;

  const detailRows = shouldShowCatchAllRow
    ? [...overviewRows, catchAllRow]
    : overviewRows;
  const sortedOverviewRows = [...detailRows].sort((left, right) => {
    const leftScore = getRowUrgencyScore(left);
    const rightScore = getRowUrgencyScore(right);

    return (
      leftScore.bucket - rightScore.bucket ||
      rightScore.magnitude - leftScore.magnitude ||
      right.actual - left.actual ||
      left.label.localeCompare(right.label)
    );
  });
  const comparisonBudgetsByMonth = Object.fromEntries(
    availableMonths.map((month) => [
      month.month,
      targets.cashFlowSummary.totalMonthlyBudgetTarget ??
        budgetedTotalsByMonth.get(month.month)?.target ??
        null,
    ])
  );
  const analysisMonthlyChart = availableMonths
    .filter((month) => analysisRange.monthKeys.includes(month.month))
    .map((month) => ({
      ...month,
      target:
        comparisonBudgetsByMonth[month.month] === null
          ? month.target
          : roundCurrency(
              comparisonBudgetsByMonth[month.month] ?? month.target
            ),
    }));
  let actualRunningTotal = 0;
  let paceRunningTotal = 0;
  const analysisCumulativeChart = analysisMonthlyChart.map((month) => {
    actualRunningTotal = roundCurrency(actualRunningTotal + month.actual);
    paceRunningTotal = roundCurrency(paceRunningTotal + month.target);

    return {
      actualCumulative: actualRunningTotal,
      label: month.label,
      month: month.month,
      paceCumulative: paceRunningTotal,
    } satisfies FinanceCumulativeChartPoint;
  });
  const analysisSummary = summarizeBudgetEntries(
    analysisMonthlyChart.map((month) => ({
      actual: month.actual,
      budget: comparisonBudgetsByMonth[month.month] ?? null,
      month: month.month,
    }))
  );
  const analysisCategoryRows = sortedOverviewRows
    .map((row) => {
      const rowMonthlyEntries = analysisRange.monthKeys.map((month) => {
        const point = row.trend.find(
          (trendPoint) => trendPoint.month === month
        );

        if (point) {
          return {
            actual: point.actual,
            budget: point.budget,
            month,
          };
        }

        if (row.isCatchAll) {
          const monthlyBudgeted = budgetedTotalsByMonth.get(month) ?? {
            actual: 0,
            target: 0,
          };
          const monthlyActual =
            availableMonths.find((entry) => entry.month === month)?.actual ?? 0;

          return {
            actual: roundCurrency(
              Math.max(0, monthlyActual - monthlyBudgeted.actual)
            ),
            budget:
              targets.cashFlowSummary.totalMonthlyBudgetTarget === null
                ? null
                : roundCurrency(
                    targets.cashFlowSummary.totalMonthlyBudgetTarget -
                      monthlyBudgeted.target
                  ),
            month,
          };
        }

        const category = categoryCardsByBucket.get(row.key);
        const categoryMonth = category?.monthly.find(
          (entry) => entry.month === month
        );

        return {
          actual: roundCurrency(categoryMonth?.actual ?? 0),
          budget:
            categoryMonth?.target !== undefined
              ? roundCurrency(categoryMonth.target)
              : null,
          month,
        };
      });
      const summary = summarizeBudgetEntries(rowMonthlyEntries);

      return {
        activeMonths: summary.activeMonths,
        averageBudget: summary.averageBudget,
        averageSpent: summary.averageActual,
        budgetTotal: summary.budgetTotal,
        group: row.group,
        isCatchAll: row.isCatchAll,
        key: row.key,
        label: row.label,
        onBudgetMonths: summary.onBudgetMonths,
        status: classifyRowStatus({
          actual: summary.actualTotal,
          budget: summary.budgetTotal,
          progressPercent: summary.progressPercent,
          variance: summary.variance,
        }),
        totalSpent: summary.actualTotal,
        trend: analysisRange.monthKeys.map((month) => {
          const category = categoryCardsByBucket.get(row.key);
          const categoryMonth = category?.monthly.find(
            (entry) => entry.month === month
          );
          const monthlyBudgeted = budgetedTotalsByMonth.get(month) ?? {
            actual: 0,
            target: 0,
          };
          const monthlyActual =
            availableMonths.find((entry) => entry.month === month)?.actual ?? 0;

          if (row.isCatchAll) {
            return {
              actual: roundCurrency(
                Math.max(0, monthlyActual - monthlyBudgeted.actual)
              ),
              budget:
                targets.cashFlowSummary.totalMonthlyBudgetTarget === null
                  ? null
                  : roundCurrency(
                      targets.cashFlowSummary.totalMonthlyBudgetTarget -
                        monthlyBudgeted.target
                    ),
              label: getMonthLabel(month),
              month,
            } satisfies FinanceDashboardTrendPoint;
          }

          return {
            actual: roundCurrency(categoryMonth?.actual ?? 0),
            budget:
              categoryMonth?.target !== undefined
                ? roundCurrency(categoryMonth.target)
                : null,
            label: getMonthLabel(month),
            month,
          } satisfies FinanceDashboardTrendPoint;
        }),
        variance: summary.variance,
      } satisfies FinanceDashboardAnalysisRow;
    })
    .sort((left, right) => right.totalSpent - left.totalSpent);
  const totalAnalysisSpend = roundCurrency(
    analysisCategoryRows.reduce((sum, row) => sum + row.totalSpent, 0)
  );
  const analysisShareRows = analysisCategoryRows
    .filter((row) => row.totalSpent > 0)
    .map((row) => ({
      amount: row.totalSpent,
      key: row.key,
      label: row.label,
      sharePercentage:
        totalAnalysisSpend === 0
          ? 0
          : roundCurrency((row.totalSpent / totalAnalysisSpend) * 100),
      status: row.status,
    }))
    .slice(0, 8);
  const overviewHeroBudget =
    targets.cashFlowSummary.totalMonthlyBudgetTarget ??
    (selectedMonthBudgetTotals.target > 0
      ? selectedMonthBudgetTotals.target
      : null);
  const needsAttentionCount = sortedOverviewRows.filter((row) =>
    rowMatchesOverviewFilter({ filter: "needs-attention", row })
  ).length;
  const onTrackCount = sortedOverviewRows.filter((row) =>
    rowMatchesOverviewFilter({ filter: "on-track", row })
  ).length;
  const unbudgetedCount = sortedOverviewRows.filter((row) =>
    rowMatchesOverviewFilter({ filter: "unbudgeted", row })
  ).length;

  return {
    analysisCategoryRows,
    analysisCumulativeChart,
    analysisMonthlyChart,
    analysisRange,
    analysisShareRows,
    analysisSummary,
    biggestMovers: sortedOverviewRows
      .filter((row) => row.deltaFromPrevious !== null)
      .map((row) => ({
        current: row.actual,
        delta: row.deltaFromPrevious ?? 0,
        isCatchAll: row.isCatchAll,
        key: row.key,
        label: row.label,
        previous: roundCurrency(row.actual - (row.deltaFromPrevious ?? 0)),
      }))
      .filter((row) => Math.abs(row.delta) > 0.01)
      .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
      .slice(0, 5),
    comparisonBudgetsByMonth,
    detailRows: sortedOverviewRows,
    largestTransactions: selectedMonthTransactions.slice(0, 5),
    monthButtons: [...availableMonths].reverse(),
    overviewHero: {
      actual: selectedMonthEntry.actual,
      budget: overviewHeroBudget,
      budgetLabel:
        targets.cashFlowSummary.totalMonthlyBudgetTarget === null
          ? "Category budgets"
          : "Monthly budget",
      label: selectedMonthEntry.label,
      leftAmount:
        overviewHeroBudget === null
          ? null
          : roundCurrency(overviewHeroBudget - selectedMonthEntry.actual),
      monthOverMonthChange:
        previousMonthEntry === null
          ? null
          : roundCurrency(
              selectedMonthEntry.actual - previousMonthEntry.actual
            ),
      needsAttentionCount,
      onTrackCount,
      progressPercent: clampProgress(
        selectedMonthEntry.actual,
        overviewHeroBudget
      ),
      unbudgetedCount,
    },
    overviewRows: sortedOverviewRows,
    previousMonthEntry,
    selectedMonthEntry,
  } satisfies FinanceDashboardViewModel;
}
