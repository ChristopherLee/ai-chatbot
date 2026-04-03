import { z } from "zod";
import type {
  FinanceCategoryCard,
  FinanceChartToolResult,
  FinanceSnapshot,
} from "./types";
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
    "month-over-month",
    "spending-breakdown",
  ]),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  categoryLimit: z.number().int().min(3).max(12).default(6),
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
    "month-over-month" | "spending-breakdown"
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

export function buildFinanceChart({
  snapshot,
  input,
}: {
  snapshot: FinanceSnapshot;
  input: FinanceChartInput;
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
    default:
      return buildUnavailableResult({
        snapshot,
        chartType: input.chartType,
        message: "That chart type is not supported.",
      });
  }
}

