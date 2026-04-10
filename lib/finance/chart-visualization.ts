import { z } from "zod";
import type {
  CategoryGroup,
  FinanceCategoryCard,
  FinanceChartToolResult,
  FinanceSnapshot,
  FinanceTransaction,
} from "./types";
import { NON_INCOME_RAW_CATEGORIES } from "./config";
import {
  getFutureMonth,
  getMonthLabel,
  roundCurrency,
  toMonthKey,
} from "./utils";

export const financeChartInputSchema = z.object({
  chartType: z.enum([
    "monthly-spend",
    "cumulative-spend",
    "cash-flow-trend",
    "month-over-month",
    "spending-breakdown",
    "income-to-expenses",
  ]),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  categoryLimit: z.number().int().min(3).max(12).default(6),
  sourceLimit: z.number().int().min(2).max(8).default(4),
});

export type FinanceChartInput = z.infer<typeof financeChartInputSchema>;

function buildUnavailableResult({
  snapshot,
  chartType,
  message,
}: {
  snapshot: FinanceSnapshot;
  chartType: FinanceChartInput["chartType"];
  message: string;
}): FinanceChartToolResult {
  return {
    status: "unavailable",
    snapshotStatus: snapshot.status,
    chartType,
    message,
  };
}

function getObservedMonth(snapshot: FinanceSnapshot) {
  if (!snapshot.datasetSummary) {
    return null;
  }

  return toMonthKey(snapshot.datasetSummary.dateRange.end);
}

function resolveAnchorMonth({
  snapshot,
  chartType,
  requestedMonth,
}: {
  snapshot: FinanceSnapshot;
  chartType: Extract<
    FinanceChartInput["chartType"],
    "month-over-month" | "spending-breakdown" | "income-to-expenses"
  >;
  requestedMonth?: string;
}) {
  const observedMonth = getObservedMonth(snapshot);

  if (!observedMonth) {
    return buildUnavailableResult({
      snapshot,
      chartType,
      message: "There is no finance dataset loaded yet for charting.",
    });
  }

  if (!requestedMonth) {
    return { month: observedMonth } as const;
  }

  if (requestedMonth > observedMonth) {
    return buildUnavailableResult({
      snapshot,
      chartType,
      message: `${getMonthLabel(requestedMonth)} has no recorded spending yet. The latest observed month is ${getMonthLabel(observedMonth)}.`,
    });
  }

  const monthExists = snapshot.monthlyChart.some(
    (entry) => entry.month === requestedMonth
  );

  if (!monthExists) {
    return buildUnavailableResult({
      snapshot,
      chartType,
      message: `${getMonthLabel(requestedMonth)} falls outside the available finance history.`,
    });
  }

  return { month: requestedMonth } as const;
}

function getMonthlyActual(category: FinanceCategoryCard, month: string) {
  return roundCurrency(
    category.monthly.find((entry) => entry.month === month)?.actual ?? 0
  );
}

type FlowBucket = {
  amount: number;
  group?: CategoryGroup;
  kind: "category" | "income" | "leftover" | "supplemental";
  name: string;
};

function collapseBuckets<T extends FlowBucket>({
  buckets,
  limit,
  overflowKind,
  overflowName,
}: {
  buckets: T[];
  limit: number;
  overflowKind: T["kind"];
  overflowName: string;
}) {
  if (buckets.length <= limit) {
    return {
      items: buckets,
      truncated: false,
    };
  }

  const visible = buckets.slice(0, limit);
  const overflowAmount = roundCurrency(
    buckets.slice(limit).reduce((sum, bucket) => sum + bucket.amount, 0)
  );

  return {
    items: [
      ...visible,
      {
        amount: overflowAmount,
        kind: overflowKind,
        name: overflowName,
      } as T,
    ],
    truncated: true,
  };
}

function resolveIncomeSourceLabel(transaction: FinanceTransaction) {
  const merchant = transaction.normalizedMerchant.trim();
  const rawCategory = transaction.rawCategory.trim();

  if (merchant.length > 0 && merchant.toLowerCase() !== rawCategory.toLowerCase()) {
    return merchant;
  }

  if (rawCategory.length > 0) {
    return rawCategory;
  }

  return "Income";
}

function buildIncomeSourcesForMonth({
  month,
  snapshot,
  sourceLimit,
  transactions,
}: {
  month: string;
  snapshot: FinanceSnapshot;
  sourceLimit: number;
  transactions?: FinanceTransaction[];
}) {
  const monthlyIncomeBuckets = Array.from(
    (transactions ?? []).reduce((map, transaction) => {
      if (!transaction.transactionDate.startsWith(month)) {
        return map;
      }

      if (
        transaction.amountSigned <= 0 ||
        NON_INCOME_RAW_CATEGORIES.has(transaction.rawCategory)
      ) {
        return map;
      }

      const sourceName = resolveIncomeSourceLabel(transaction);
      map.set(
        sourceName,
        roundCurrency((map.get(sourceName) ?? 0) + transaction.amountSigned)
      );
      return map;
    }, new Map<string, number>())
  )
    .map(([name, amount]) => ({
      amount,
      kind: "income" as const,
      name,
    }))
    .filter((bucket) => bucket.amount > 0)
    .sort((left, right) => right.amount - left.amount);

  if (monthlyIncomeBuckets.length > 0) {
    const { items, truncated } = collapseBuckets({
      buckets: monthlyIncomeBuckets,
      limit: sourceLimit,
      overflowKind: "income",
      overflowName: "Other income",
    });

    return {
      basis: "observed" as const,
      sources: items,
      totalIncome: roundCurrency(
        monthlyIncomeBuckets.reduce((sum, bucket) => sum + bucket.amount, 0)
      ),
      availableSourceCount: monthlyIncomeBuckets.length,
      truncatedSources: truncated,
    };
  }

  const fallbackIncome =
    snapshot.cashFlowSummary.totalMonthlyIncomeTarget ??
    snapshot.cashFlowSummary.historicalAverageMonthlyIncome;

  if (fallbackIncome <= 0) {
    return {
      basis: null,
      sources: [],
      totalIncome: 0,
      availableSourceCount: 0,
      truncatedSources: false,
    };
  }

  return {
    basis:
      snapshot.cashFlowSummary.totalMonthlyIncomeTarget !== null
        ? ("income-target" as const)
        : ("historical-average" as const),
    sources: [
      {
        amount: roundCurrency(fallbackIncome),
        kind: "income" as const,
        name:
          snapshot.cashFlowSummary.totalMonthlyIncomeTarget !== null
            ? "Income target"
            : "Historical average income",
      },
    ],
    totalIncome: roundCurrency(fallbackIncome),
    availableSourceCount: 1,
    truncatedSources: false,
  };
}

function buildExpenseCategoriesForMonth({
  month,
  snapshot,
  categoryLimit,
}: {
  month: string;
  snapshot: FinanceSnapshot;
  categoryLimit: number;
}) {
  const allCategories = snapshot.categoryCards
    .map((category) => ({
      amount: getMonthlyActual(category, month),
      group: category.group,
      kind: "category" as const,
      name: category.category,
    }))
    .filter((category) => category.amount > 0)
    .sort((left, right) => right.amount - left.amount);

  const { items, truncated } = collapseBuckets({
    buckets: allCategories,
    limit: categoryLimit,
    overflowKind: "category",
    overflowName: "Other expenses",
  });

  return {
    categories: items,
    totalExpenses: roundCurrency(
      allCategories.reduce((sum, category) => sum + category.amount, 0)
    ),
    availableCategoryCount: allCategories.length,
    truncatedCategories: truncated,
  };
}

function buildProportionalFlowLinks({
  destinations,
  sources,
}: {
  destinations: FlowBucket[];
  sources: FlowBucket[];
}) {
  const sourceCount = sources.length;
  const totalDestinationAmount = destinations.reduce(
    (sum, destination) => sum + destination.amount,
    0
  );

  if (sourceCount === 0 || totalDestinationAmount <= 0) {
    return [];
  }

  return sources.flatMap((source, sourceIndex) =>
    destinations
      .map((destination, destinationIndex) => ({
        source: sourceIndex,
        target: sourceCount + destinationIndex,
        value: roundCurrency(
          source.amount * (destination.amount / totalDestinationAmount)
        ),
      }))
      .filter((link) => link.value > 0)
  );
}

function buildMonthlySpendChart(
  snapshot: FinanceSnapshot
): FinanceChartToolResult {
  const latestMonth = getObservedMonth(snapshot);
  const latestPoint = latestMonth
    ? snapshot.monthlyChart.find((entry) => entry.month === latestMonth)
    : null;

  if (!latestMonth || !latestPoint || snapshot.monthlyChart.length === 0) {
    return buildUnavailableResult({
      snapshot,
      chartType: "monthly-spend",
      message: "Monthly spend chart data is not available yet.",
    });
  }

  return {
    status: "available",
    snapshotStatus: snapshot.status,
    chart: {
      chartType: "monthly-spend",
      title: "Spend over time",
      description:
        "Monthly actual spend compared with the plan target across the available timeline.",
      latestMonth,
      latestMonthLabel: getMonthLabel(latestMonth),
      summary: {
        actual: latestPoint.actual,
        target: latestPoint.target,
        delta: roundCurrency(latestPoint.actual - latestPoint.target),
      },
      data: snapshot.monthlyChart,
    },
  };
}

function buildCumulativeSpendChart(
  snapshot: FinanceSnapshot
): FinanceChartToolResult {
  const latestMonth = getObservedMonth(snapshot);
  const latestPoint = latestMonth
    ? snapshot.cumulativeChart.find((entry) => entry.month === latestMonth)
    : null;

  if (!latestMonth || !latestPoint || snapshot.cumulativeChart.length === 0) {
    return buildUnavailableResult({
      snapshot,
      chartType: "cumulative-spend",
      message: "Cumulative spend chart data is not available yet.",
    });
  }

  return {
    status: "available",
    snapshotStatus: snapshot.status,
    chart: {
      chartType: "cumulative-spend",
      title: "Cumulative spend vs pace",
      description:
        "Running actual spend compared with the plan pace through the latest observed month.",
      latestMonth,
      latestMonthLabel: getMonthLabel(latestMonth),
      summary: {
        actualCumulative: latestPoint.actualCumulative,
        paceCumulative: latestPoint.paceCumulative,
        variance: roundCurrency(
          latestPoint.actualCumulative - latestPoint.paceCumulative
        ),
      },
      data: snapshot.cumulativeChart,
    },
  };
}

function buildCashFlowTrendChart(
  snapshot: FinanceSnapshot
): FinanceChartToolResult {
  const latestMonth = getObservedMonth(snapshot);
  const latestPoint = latestMonth
    ? snapshot.monthlyChart.find((entry) => entry.month === latestMonth)
    : null;

  if (!latestMonth || !latestPoint || snapshot.monthlyChart.length === 0) {
    return buildUnavailableResult({
      snapshot,
      chartType: "cash-flow-trend",
      message: "Cash flow trend data is not available yet.",
    });
  }

  const projectionMonths = 6;
  const projectedIncomeBasis =
    snapshot.cashFlowSummary.totalMonthlyIncomeTarget !== null
      ? ("income-target" as const)
      : ("historical-average" as const);
  const projectedExpenseBasis =
    snapshot.cashFlowSummary.totalMonthlyBudgetTarget !== null
      ? ("budget-target" as const)
      : ("historical-average" as const);
  const projectedIncome = roundCurrency(
    snapshot.cashFlowSummary.totalMonthlyIncomeTarget ??
      snapshot.cashFlowSummary.historicalAverageMonthlyIncome
  );
  const projectedExpenses = roundCurrency(
    snapshot.cashFlowSummary.totalMonthlyBudgetTarget ??
      snapshot.cashFlowSummary.historicalAverageMonthlySpend
  );

  let actualCashBalance = 0;
  let projectedCashBalance = 0;

  const historicalData = snapshot.monthlyChart.map((entry) => {
    const actualIncome = roundCurrency(
      snapshot.cashFlowSummary.historicalAverageMonthlyIncome
    );
    const actualExpenses = entry.actual;
    const actualNet = roundCurrency(actualIncome - actualExpenses);
    const projectedNet = roundCurrency(projectedIncome - projectedExpenses);

    actualCashBalance = roundCurrency(actualCashBalance + actualNet);
    projectedCashBalance = roundCurrency(projectedCashBalance + projectedNet);

    return {
      month: entry.month,
      label: entry.label,
      isProjected: false,
      actualIncome,
      actualExpenses,
      actualNet,
      projectedIncome,
      projectedExpenses,
      projectedNet,
      actualCashBalance,
      projectedCashBalance,
    };
  });

  const projectionData = Array.from({ length: projectionMonths }).map(
    (_, index) => {
      const month = getFutureMonth(latestMonth, index + 1);
      const projectedNet = roundCurrency(projectedIncome - projectedExpenses);
      projectedCashBalance = roundCurrency(projectedCashBalance + projectedNet);

      return {
        month,
        label: getMonthLabel(month),
        isProjected: true,
        actualIncome: 0,
        actualExpenses: 0,
        actualNet: 0,
        projectedIncome,
        projectedExpenses,
        projectedNet,
        actualCashBalance,
        projectedCashBalance,
      };
    }
  );

  const data = [...historicalData, ...projectionData];
  const latestDataPoint = data.at(-1);
  const monthlyBreakdown = data.map((monthEntry) => ({
    month: monthEntry.month,
    label: monthEntry.label,
    categories: snapshot.categoryCards
      .map((category) => {
        const monthValue = category.monthly.find(
          (entry) => entry.month === monthEntry.month
        );
        const actual = roundCurrency(monthValue?.actual ?? 0);
        const projected = roundCurrency(
          monthValue?.target ?? category.monthlyTarget
        );

        return {
          category: category.category,
          group: category.group,
          actual,
          projected,
        };
      })
      .filter((category) => category.actual > 0 || category.projected > 0)
      .sort((left, right) => right.projected - left.projected),
  }));

  return {
    status: "available",
    snapshotStatus: snapshot.status,
    chart: {
      chartType: "cash-flow-trend",
      title: "Cash flow trend and projection",
      description:
        "Month-by-month net cash and running cash balance, combining historical actuals with a forward projection.",
      latestMonth,
      latestMonthLabel: getMonthLabel(latestMonth),
      projectionMonths,
      assumptions: {
        projectedIncomeBasis,
        projectedExpenseBasis,
      },
      summary: {
        actualNet: roundCurrency(
          historicalData.at(-1)?.actualNet ?? latestPoint.actual
        ),
        projectedNet: roundCurrency(projectedIncome - projectedExpenses),
        actualCashBalance: roundCurrency(
          historicalData.at(-1)?.actualCashBalance ?? 0
        ),
        projectedCashBalance: roundCurrency(
          latestDataPoint?.projectedCashBalance ?? 0
        ),
      },
      monthlyBreakdown,
      data,
    },
  };
}

function buildMonthOverMonthChart({
  snapshot,
  month,
  categoryLimit,
}: {
  snapshot: FinanceSnapshot;
  month?: string;
  categoryLimit: number;
}): FinanceChartToolResult {
  const resolvedMonth = resolveAnchorMonth({
    snapshot,
    chartType: "month-over-month",
    requestedMonth: month,
  });

  if ("status" in resolvedMonth) {
    return resolvedMonth;
  }

  const currentMonth = resolvedMonth.month;
  const previousMonth = getFutureMonth(currentMonth, -1);
  const allCategories = snapshot.categoryCards
    .map((category) => {
      const currentValue = getMonthlyActual(category, currentMonth);
      const previousValue = getMonthlyActual(category, previousMonth);

      return {
        category: category.category,
        group: category.group,
        currentMonth: currentValue,
        previousMonth: previousValue,
        delta: roundCurrency(currentValue - previousValue),
      };
    })
    .filter(
      (category) => category.currentMonth > 0 || category.previousMonth > 0
    )
    .sort((left, right) => {
      const maxDelta =
        Math.max(right.currentMonth, right.previousMonth) -
        Math.max(left.currentMonth, left.previousMonth);

      if (maxDelta !== 0) {
        return maxDelta;
      }

      return right.delta - left.delta;
    });

  if (allCategories.length === 0) {
    return buildUnavailableResult({
      snapshot,
      chartType: "month-over-month",
      message: `No included spending was recorded for ${getMonthLabel(currentMonth)} or ${getMonthLabel(previousMonth)}.`,
    });
  }

  const totals = allCategories.reduce(
    (summary, category) => ({
      currentMonth: roundCurrency(summary.currentMonth + category.currentMonth),
      previousMonth: roundCurrency(
        summary.previousMonth + category.previousMonth
      ),
      delta: roundCurrency(summary.delta + category.delta),
    }),
    { currentMonth: 0, previousMonth: 0, delta: 0 }
  );

  return {
    status: "available",
    snapshotStatus: snapshot.status,
    chart: {
      chartType: "month-over-month",
      title: "Current month vs last month",
      description:
        "Category-by-category spending comparison for the latest selected month versus the month before it.",
      currentMonth,
      currentMonthLabel: getMonthLabel(currentMonth),
      previousMonth,
      previousMonthLabel: getMonthLabel(previousMonth),
      categoryLimit,
      availableCategoryCount: allCategories.length,
      truncated: allCategories.length > categoryLimit,
      totals,
      data: allCategories.slice(0, categoryLimit),
    },
  };
}

function buildSpendingBreakdownChart({
  snapshot,
  month,
  categoryLimit,
}: {
  snapshot: FinanceSnapshot;
  month?: string;
  categoryLimit: number;
}): FinanceChartToolResult {
  const resolvedMonth = resolveAnchorMonth({
    snapshot,
    chartType: "spending-breakdown",
    requestedMonth: month,
  });

  if ("status" in resolvedMonth) {
    return resolvedMonth;
  }

  const resolvedTargetMonth = resolvedMonth.month;
  const allCategories = snapshot.categoryCards
    .map((category) => ({
      category: category.category,
      group: category.group,
      amount: getMonthlyActual(category, resolvedTargetMonth),
    }))
    .filter((category) => category.amount > 0)
    .sort((left, right) => right.amount - left.amount);

  const total = roundCurrency(
    allCategories.reduce((sum, category) => sum + category.amount, 0)
  );

  if (total === 0 || allCategories.length === 0) {
    return buildUnavailableResult({
      snapshot,
      chartType: "spending-breakdown",
      message: `No included spending was recorded for ${getMonthLabel(resolvedTargetMonth)}.`,
    });
  }

  return {
    status: "available",
    snapshotStatus: snapshot.status,
    chart: {
      chartType: "spending-breakdown",
      title: "Spending mix by category",
      description:
        "Top spending categories for the selected month, sized by their share of total outflow.",
      month: resolvedTargetMonth,
      monthLabel: getMonthLabel(resolvedTargetMonth),
      categoryLimit,
      availableCategoryCount: allCategories.length,
      truncated: allCategories.length > categoryLimit,
      total,
      data: allCategories.slice(0, categoryLimit).map((category) => ({
        ...category,
        sharePercentage: roundCurrency((category.amount / total) * 100),
      })),
    },
  };
}

function buildIncomeToExpensesChart({
  snapshot,
  month,
  categoryLimit,
  sourceLimit,
  transactions,
}: {
  snapshot: FinanceSnapshot;
  month?: string;
  categoryLimit: number;
  sourceLimit: number;
  transactions?: FinanceTransaction[];
}): FinanceChartToolResult {
  const resolvedMonth = resolveAnchorMonth({
    snapshot,
    chartType: "income-to-expenses",
    requestedMonth: month,
  });

  if ("status" in resolvedMonth) {
    return resolvedMonth;
  }

  const resolvedTargetMonth = resolvedMonth.month;
  const expenseBuckets = buildExpenseCategoriesForMonth({
    snapshot,
    month: resolvedTargetMonth,
    categoryLimit,
  });

  if (
    expenseBuckets.totalExpenses === 0 ||
    expenseBuckets.availableCategoryCount === 0
  ) {
    return buildUnavailableResult({
      snapshot,
      chartType: "income-to-expenses",
      message: `No included spending was recorded for ${getMonthLabel(resolvedTargetMonth)}.`,
    });
  }

  const incomeSources = buildIncomeSourcesForMonth({
    month: resolvedTargetMonth,
    snapshot,
    sourceLimit,
    transactions,
  });

  if (incomeSources.totalIncome === 0 || incomeSources.basis === null) {
    return buildUnavailableResult({
      snapshot,
      chartType: "income-to-expenses",
      message: `I could not find income data for ${getMonthLabel(resolvedTargetMonth)} or a saved income target to anchor the Sankey chart.`,
    });
  }

  const supplementalAmount = Math.max(
    0,
    roundCurrency(expenseBuckets.totalExpenses - incomeSources.totalIncome)
  );
  const leftoverAmount = Math.max(
    0,
    roundCurrency(incomeSources.totalIncome - expenseBuckets.totalExpenses)
  );
  const sources = [
    ...incomeSources.sources,
    ...(supplementalAmount > 0
      ? [
          {
            amount: supplementalAmount,
            kind: "supplemental" as const,
            name: "From savings / debt",
          },
        ]
      : []),
  ];
  const destinations = [
    ...expenseBuckets.categories,
    ...(leftoverAmount > 0
      ? [
          {
            amount: leftoverAmount,
            kind: "leftover" as const,
            name: "Left over / savings",
          },
        ]
      : []),
  ];
  const nodes = [...sources, ...destinations];
  const links = buildProportionalFlowLinks({
    destinations,
    sources,
  });

  const basisDescription =
    incomeSources.basis === "observed"
      ? `Observed income sources from ${getMonthLabel(resolvedTargetMonth)} are distributed proportionally across that month's expense categories.`
      : incomeSources.basis === "income-target"
        ? `No income transactions were recorded for ${getMonthLabel(resolvedTargetMonth)}, so this uses the saved monthly income target as the source node.`
        : `No income transactions were recorded for ${getMonthLabel(resolvedTargetMonth)}, so this uses the historical average monthly income as the source node.`;

  return {
    status: "available",
    snapshotStatus: snapshot.status,
    chart: {
      chartType: "income-to-expenses",
      title: "Income to expense categories",
      description: basisDescription,
      month: resolvedTargetMonth,
      monthLabel: getMonthLabel(resolvedTargetMonth),
      incomeBasis: incomeSources.basis,
      sourceLimit,
      availableSourceCount: incomeSources.availableSourceCount,
      truncatedSources: incomeSources.truncatedSources,
      categoryLimit,
      availableCategoryCount: expenseBuckets.availableCategoryCount,
      truncatedCategories: expenseBuckets.truncatedCategories,
      totals: {
        income: incomeSources.totalIncome,
        expenses: expenseBuckets.totalExpenses,
        leftover: leftoverAmount,
        supplemental: supplementalAmount,
      },
      sources,
      destinations,
      nodes,
      links,
    },
  };
}

export function buildFinanceChart({
  snapshot,
  input,
  transactions,
}: {
  snapshot: FinanceSnapshot;
  input: FinanceChartInput;
  transactions?: FinanceTransaction[];
}): FinanceChartToolResult {
  if (
    snapshot.status !== "ready" ||
    !snapshot.planSummary ||
    !snapshot.datasetSummary
  ) {
    const message =
      snapshot.status === "needs-upload"
        ? "Upload a transaction file before asking for charts."
        : "The finance plan is still being prepared. Try again in a moment.";

    return buildUnavailableResult({
      snapshot,
      chartType: input.chartType,
      message,
    });
  }

  switch (input.chartType) {
    case "monthly-spend":
      return buildMonthlySpendChart(snapshot);
    case "cumulative-spend":
      return buildCumulativeSpendChart(snapshot);
    case "cash-flow-trend":
      return buildCashFlowTrendChart(snapshot);
    case "month-over-month":
      return buildMonthOverMonthChart({
        snapshot,
        month: input.month,
        categoryLimit: input.categoryLimit,
      });
    case "spending-breakdown":
      return buildSpendingBreakdownChart({
        snapshot,
        month: input.month,
        categoryLimit: input.categoryLimit,
      });
    case "income-to-expenses":
      return buildIncomeToExpensesChart({
        snapshot,
        month: input.month,
        categoryLimit: input.categoryLimit,
        sourceLimit: input.sourceLimit,
        transactions,
      });
    default:
      return buildUnavailableResult({
        snapshot,
        chartType: input.chartType,
        message: "That chart type is not supported.",
      });
  }
}
