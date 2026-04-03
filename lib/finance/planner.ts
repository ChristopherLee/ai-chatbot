import {
  FINANCE_DISPLAY_HISTORY_MONTHS,
  FINANCE_RECOMMENDATION_LOOKBACK_MONTHS,
  resolveCategoryGroupFromCategory,
} from "./config";
import { getCategoryTargetOverrides, getPlanMode } from "./overrides";
import type {
  FinanceAction,
  FinanceCategoryCard,
  FinanceCumulativeChartPoint,
  FinanceMonthlyChartPoint,
  FinancePlanSummary,
  FinanceTransaction,
} from "./types";
import {
  getMonthKeysBetween,
  getMonthLabel,
  getTrailingStartMonth,
  roundCurrency,
  safeLower,
  toMonthKey,
} from "./utils";

type PlannedCategory = {
  category: string;
  group: FinanceCategoryCard["group"];
  monthlyTarget: number;
  trailingAverage: number;
  trailingTotal: number;
  monthly: FinanceCategoryCard["monthly"];
  totalOutflow: number;
  topMerchants: FinanceCategoryCard["topMerchants"];
  transactions: FinanceCategoryCard["transactions"];
};

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getTargetForGroup({
  group,
  monthlyValues,
  planMode,
}: {
  group: PlannedCategory["group"];
  monthlyValues: number[];
  planMode: "balanced" | "conservative";
}) {
  const nonZeroValues = monthlyValues.filter((value) => value > 0);
  const trailingAverage = average(monthlyValues);
  let target = trailingAverage;

  if (group === "fixed") {
    target = nonZeroValues.length > 0 ? median(nonZeroValues) : trailingAverage;
  } else if (group === "flexible") {
    target =
      nonZeroValues.length > 0
        ? average(nonZeroValues.slice(-3))
        : trailingAverage;
  } else if (group === "annual") {
    target = monthlyValues.reduce((sum, value) => sum + value, 0) / 12;
  }

  if (planMode === "conservative" && group !== "fixed") {
    target *= 1.1;
  }

  return roundCurrency(target);
}

function getMonthTarget({
  category,
  month,
  baseTarget,
  actions,
}: {
  category: string;
  month: string;
  baseTarget: number;
  actions: ReturnType<typeof getCategoryTargetOverrides>;
}) {
  let target = baseTarget;

  for (const action of actions) {
    if (safeLower(action.category) !== safeLower(category)) {
      continue;
    }

    if (!action.effectiveMonth || action.effectiveMonth <= month) {
      target = roundCurrency(action.amount);
    }
  }

  return target;
}

export function buildFinancePlan({
  transactions,
  actions,
}: {
  transactions: FinanceTransaction[];
  actions: FinanceAction[];
}) {
  const includedTransactions = transactions.filter(
    (transaction) => transaction.includeFlag && transaction.outflowAmount > 0
  );

  if (transactions.length === 0) {
    return {
      planSummary: {
        mode: "balanced",
        totalMonthlyTarget: 0,
        trailingAverageSpend: 0,
        totalsByGroup: {
          fixed: 0,
          flexible: 0,
          annual: 0,
        },
        categoryTargets: [],
      } satisfies FinancePlanSummary,
      monthlyChart: [] as FinanceMonthlyChartPoint[],
      cumulativeChart: [] as FinanceCumulativeChartPoint[],
      categoryCards: [] as FinanceCategoryCard[],
      transactionHighlights: [],
    };
  }

  const sortedTransactions = [...transactions].sort((a, b) =>
    a.transactionDate.localeCompare(b.transactionDate)
  );
  const minDate = sortedTransactions[0]?.transactionDate;
  const maxDate = sortedTransactions.at(-1)?.transactionDate;

  if (!minDate || !maxDate) {
    throw new Error("Expected transaction history to have a date range");
  }

  const earliestObservedMonth = toMonthKey(minDate);
  const observedEndMonth = toMonthKey(maxDate);
  const recommendationStartMonth = getTrailingStartMonth(
    maxDate,
    FINANCE_RECOMMENDATION_LOOKBACK_MONTHS
  );
  const observedStartMonth =
    recommendationStartMonth < earliestObservedMonth
      ? earliestObservedMonth
      : recommendationStartMonth;
  const displayStartMonth = getTrailingStartMonth(
    maxDate,
    FINANCE_DISPLAY_HISTORY_MONTHS
  );
  const boundedDisplayStartMonth =
    displayStartMonth < earliestObservedMonth
      ? earliestObservedMonth
      : displayStartMonth;
  const categoryTargetOverrides = getCategoryTargetOverrides(actions);
  const displayEndMonth =
    [
      observedEndMonth,
      ...categoryTargetOverrides.map((rule) => rule.effectiveMonth),
    ]
      .filter((month): month is string => Boolean(month))
      .sort()
      .at(-1) ?? observedEndMonth;

  const observedMonths = getMonthKeysBetween(
    observedStartMonth,
    observedEndMonth
  );
  const displayMonths = getMonthKeysBetween(
    boundedDisplayStartMonth,
    displayEndMonth
  );
  const planMode = getPlanMode(actions);

  const categoryEntries = Array.from(
    (() => {
      const categoryMap = includedTransactions.reduce(
        (map, transaction) => {
          const categoryKey = safeLower(transaction.mappedCategory);
          const existing = map.get(categoryKey);

          if (existing) {
            existing.transactions.push(transaction);
            return map;
          }

          map.set(categoryKey, {
            category: transaction.mappedCategory,
            transactions: [transaction],
          });

          return map;
        },
        new Map<
          string,
          {
            category: string;
            transactions: FinanceTransaction[];
          }
        >()
      );

      for (const override of categoryTargetOverrides) {
        const categoryKey = safeLower(override.category);

        if (!categoryMap.has(categoryKey)) {
          categoryMap.set(categoryKey, {
            category: override.category,
            transactions: [],
          });
        }
      }

      return categoryMap.values();
    })()
  );

  const plannedCategories = categoryEntries.map(
    ({ category, transactions: categoryTransactions }) => {
      const actualByMonth = new Map<string, number>();

      for (const transaction of categoryTransactions) {
        const month = toMonthKey(transaction.transactionDate);
        const current = actualByMonth.get(month) ?? 0;
        actualByMonth.set(
          month,
          roundCurrency(current + transaction.outflowAmount)
        );
      }

      const observedMonthlyValues = observedMonths.map(
        (month) => actualByMonth.get(month) ?? 0
      );
      const activeMonths = observedMonthlyValues.filter(
        (value) => value > 0
      ).length;
      const group = resolveCategoryGroupFromCategory({
        category,
        includeFlag: true,
        activeMonths: activeMonths > 0 ? activeMonths : undefined,
      });
      const baseTarget = getTargetForGroup({
        group,
        monthlyValues: observedMonthlyValues,
        planMode,
      });

      const monthly = displayMonths.map((month) => ({
        month,
        label: getMonthLabel(month),
        actual: roundCurrency(actualByMonth.get(month) ?? 0),
        target: getMonthTarget({
          category,
          month,
          baseTarget,
          actions: categoryTargetOverrides,
        }),
      }));

      const topMerchants = Array.from(
        categoryTransactions.reduce((map, transaction) => {
          const current = map.get(transaction.normalizedMerchant) ?? 0;
          map.set(
            transaction.normalizedMerchant,
            roundCurrency(current + transaction.outflowAmount)
          );
          return map;
        }, new Map<string, number>())
      )
        .map(([merchant, amount]) => ({ merchant, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      const transactionsForCard = [...categoryTransactions]
        .sort((a, b) => {
          if (a.transactionDate === b.transactionDate) {
            return b.outflowAmount - a.outflowAmount;
          }

          return b.transactionDate.localeCompare(a.transactionDate);
        })
        .slice(0, 25)
        .map((transaction) => ({
          id: transaction.id,
          transactionDate: transaction.transactionDate,
          description: transaction.description,
          merchant: transaction.normalizedMerchant,
          amount: transaction.outflowAmount,
          rawCategory: transaction.rawCategory,
          account: transaction.account,
        }));

      return {
        category,
        group,
        monthlyTarget: monthly.at(-1)?.target ?? 0,
        trailingAverage: roundCurrency(average(observedMonthlyValues)),
        trailingTotal: roundCurrency(
          observedMonthlyValues.reduce((sum, value) => sum + value, 0)
        ),
        monthly,
        totalOutflow: roundCurrency(
          categoryTransactions.reduce(
            (sum, transaction) => sum + transaction.outflowAmount,
            0
          )
        ),
        topMerchants,
        transactions: transactionsForCard,
      } satisfies PlannedCategory;
    }
  );

  const monthlyChart = displayMonths.map((month) => ({
    month,
    label: getMonthLabel(month),
    actual: roundCurrency(
      plannedCategories.reduce(
        (sum, category) =>
          sum +
          (category.monthly.find((entry) => entry.month === month)?.actual ?? 0),
        0
      )
    ),
    target: roundCurrency(
      plannedCategories.reduce(
        (sum, category) =>
          sum +
          (category.monthly.find((entry) => entry.month === month)?.target ?? 0),
        0
      )
    ),
  }));

  let actualRunningTotal = 0;
  let paceRunningTotal = 0;
  const cumulativeChart = monthlyChart.map((month) => {
    actualRunningTotal = roundCurrency(actualRunningTotal + month.actual);
    paceRunningTotal = roundCurrency(paceRunningTotal + month.target);

    return {
      month: month.month,
      label: month.label,
      actualCumulative: actualRunningTotal,
      paceCumulative: paceRunningTotal,
    };
  });

  const latestCategoryTargets = plannedCategories.reduce(
    (totals, category) => {
      if (category.group !== "excluded") {
        totals[category.group] = roundCurrency(
          totals[category.group] + category.monthlyTarget
        );
      }
      return totals;
    },
    { fixed: 0, flexible: 0, annual: 0 }
  );

  const planSummary = {
    mode: planMode,
    totalMonthlyTarget: roundCurrency(monthlyChart.at(-1)?.target ?? 0),
    trailingAverageSpend: roundCurrency(
      (() => {
        if (observedMonths.length === 0) {
          return 0;
        }

        const observedActualTotal = observedMonths.reduce((sum, month) => {
          return (
            sum +
            (monthlyChart.find((entry) => entry.month === month)?.actual ?? 0)
          );
        }, 0);

        return observedActualTotal / observedMonths.length;
      })()
    ),
    totalsByGroup: latestCategoryTargets,
    categoryTargets: plannedCategories
      .map((category) => ({
        category: category.category,
        group: category.group,
        monthlyTarget: category.monthlyTarget,
        trailingAverage: category.trailingAverage,
        trailingTotal: category.trailingTotal,
      }))
      .sort((a, b) => b.monthlyTarget - a.monthlyTarget),
  } satisfies FinancePlanSummary;

  const categoryCards = plannedCategories
    .map((category) => ({
      category: category.category,
      group: category.group,
      monthlyTarget: category.monthlyTarget,
      trailingAverage: category.trailingAverage,
      totalOutflow: category.totalOutflow,
      monthly: category.monthly,
      topMerchants: category.topMerchants,
      transactions: category.transactions,
    }))
    .sort((a, b) => b.totalOutflow - a.totalOutflow);

  const transactionHighlights = [...includedTransactions]
    .sort((a, b) => b.outflowAmount - a.outflowAmount)
    .slice(0, 12)
    .map((transaction) => ({
      id: transaction.id,
      transactionDate: transaction.transactionDate,
      description: transaction.description,
      merchant: transaction.normalizedMerchant,
      amount: transaction.outflowAmount,
      category: transaction.mappedCategory,
      group: resolveCategoryGroupFromCategory({
        category: transaction.mappedCategory,
        includeFlag: transaction.includeFlag,
      }),
    }));

  return {
    planSummary,
    monthlyChart,
    cumulativeChart,
    categoryCards,
    transactionHighlights,
  };
}
