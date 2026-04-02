import {
  FINANCE_DISPLAY_HISTORY_MONTHS,
  FINANCE_RECOMMENDATION_LOOKBACK_MONTHS,
  resolveBucketGroupFromBucket,
} from "./config";
import { getBucketTargetOverrides, getPlanMode } from "./overrides";
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

type PlannedBucket = {
  bucket: string;
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
  group: PlannedBucket["group"];
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
  bucket,
  month,
  baseTarget,
  actions,
}: {
  bucket: string;
  month: string;
  baseTarget: number;
  actions: ReturnType<typeof getBucketTargetOverrides>;
}) {
  let target = baseTarget;

  for (const action of actions) {
    if (safeLower(action.bucket) !== safeLower(bucket)) {
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
        bucketTargets: [],
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
  const bucketTargetOverrides = getBucketTargetOverrides(actions);
  const displayEndMonth =
    [
      observedEndMonth,
      ...bucketTargetOverrides.map((rule) => rule.effectiveMonth),
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

  const bucketEntries = Array.from(
    (() => {
      const bucketMap = includedTransactions.reduce(
        (map, transaction) => {
          const bucketKey = safeLower(transaction.mappedBucket);
          const existing = map.get(bucketKey);

          if (existing) {
            existing.transactions.push(transaction);
            return map;
          }

          map.set(bucketKey, {
            bucket: transaction.mappedBucket,
            transactions: [transaction],
          });

          return map;
        },
        new Map<
          string,
          {
            bucket: string;
            transactions: FinanceTransaction[];
          }
        >()
      );

      for (const override of bucketTargetOverrides) {
        const bucketKey = safeLower(override.bucket);

        if (!bucketMap.has(bucketKey)) {
          bucketMap.set(bucketKey, {
            bucket: override.bucket,
            transactions: [],
          });
        }
      }

      return bucketMap.values();
    })()
  );

  const plannedBuckets = bucketEntries.map(
    ({ bucket, transactions: bucketTransactions }) => {
      const actualByMonth = new Map<string, number>();

      for (const transaction of bucketTransactions) {
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
      const group = resolveBucketGroupFromBucket({
        bucket,
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
          bucket,
          month,
          baseTarget,
          actions: bucketTargetOverrides,
        }),
      }));

      const topMerchants = Array.from(
        bucketTransactions.reduce((map, transaction) => {
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

      const transactionsForCard = [...bucketTransactions]
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
        bucket,
        group,
        monthlyTarget: monthly.at(-1)?.target ?? 0,
        trailingAverage: roundCurrency(average(observedMonthlyValues)),
        trailingTotal: roundCurrency(
          observedMonthlyValues.reduce((sum, value) => sum + value, 0)
        ),
        monthly,
        totalOutflow: roundCurrency(
          bucketTransactions.reduce(
            (sum, transaction) => sum + transaction.outflowAmount,
            0
          )
        ),
        topMerchants,
        transactions: transactionsForCard,
      } satisfies PlannedBucket;
    }
  );

  const monthlyChart = displayMonths.map((month) => ({
    month,
    label: getMonthLabel(month),
    actual: roundCurrency(
      plannedBuckets.reduce(
        (sum, bucket) =>
          sum +
          (bucket.monthly.find((entry) => entry.month === month)?.actual ?? 0),
        0
      )
    ),
    target: roundCurrency(
      plannedBuckets.reduce(
        (sum, bucket) =>
          sum +
          (bucket.monthly.find((entry) => entry.month === month)?.target ?? 0),
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

  const latestBucketTargets = plannedBuckets.reduce(
    (totals, bucket) => {
      if (bucket.group !== "excluded") {
        totals[bucket.group] = roundCurrency(
          totals[bucket.group] + bucket.monthlyTarget
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
    totalsByGroup: latestBucketTargets,
    bucketTargets: plannedBuckets
      .map((bucket) => ({
        bucket: bucket.bucket,
        group: bucket.group,
        monthlyTarget: bucket.monthlyTarget,
        trailingAverage: bucket.trailingAverage,
        trailingTotal: bucket.trailingTotal,
      }))
      .sort((a, b) => b.monthlyTarget - a.monthlyTarget),
  } satisfies FinancePlanSummary;

  const categoryCards = plannedBuckets
    .map((bucket) => ({
      bucket: bucket.bucket,
      group: bucket.group,
      monthlyTarget: bucket.monthlyTarget,
      trailingAverage: bucket.trailingAverage,
      totalOutflow: bucket.totalOutflow,
      monthly: bucket.monthly,
      topMerchants: bucket.topMerchants,
      transactions: bucket.transactions,
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
      bucket: transaction.mappedBucket,
      group: resolveBucketGroupFromBucket({
        bucket: transaction.mappedBucket,
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
