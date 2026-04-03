type FinanceToolSnapshotCategoryInput =
  | {
      category?: unknown;
      group?: unknown;
      monthlyTarget?: unknown;
      bucket?: never;
    }
  | {
      bucket?: unknown;
      group?: unknown;
      monthlyTarget?: unknown;
      category?: never;
    };

export type FinanceToolSnapshotSummaryInput = {
  status?: unknown;
  includedOutflow?: unknown;
  totalMonthlyBudgetTarget?: unknown;
  totalMonthlyIncomeTarget?: unknown;
  categoryBudgetTotal?: unknown;
  suggestedMonthlyTarget?: unknown;
  catchAllBudget?: unknown;
  historicalAverageMonthlyIncome?: unknown;
  historicalAverageMonthlySpend?: unknown;
  trailingAverageSpend?: unknown;
  totalMonthlyTarget?: unknown;
  topCategories?: unknown;
  topBuckets?: unknown;
};

export type FinanceToolSnapshotSummary = {
  status: string;
  includedOutflow: number | null;
  totalMonthlyBudgetTarget: number | null;
  totalMonthlyIncomeTarget: number | null;
  categoryBudgetTotal: number | null;
  suggestedMonthlyTarget: number | null;
  catchAllBudget: number | null;
  historicalAverageMonthlyIncome: number | null;
  historicalAverageMonthlySpend: number | null;
  trailingAverageSpend: number | null;
  topCategories: Array<{
    category: string;
    group: string;
    monthlyTarget: number | null;
  }>;
};

function getOptionalFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeTopCategories(
  rawValue: unknown
): FinanceToolSnapshotSummary["topCategories"] {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  return rawValue
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const rawCategory = entry as FinanceToolSnapshotCategoryInput;
      const category =
        typeof rawCategory.category === "string"
          ? rawCategory.category
          : typeof rawCategory.bucket === "string"
            ? rawCategory.bucket
            : null;

      if (!category) {
        return null;
      }

      return {
        category,
        group:
          typeof rawCategory.group === "string" ? rawCategory.group : "unknown",
        monthlyTarget: getOptionalFiniteNumber(rawCategory.monthlyTarget),
      };
    })
    .filter(
      (
        entry
      ): entry is FinanceToolSnapshotSummary["topCategories"][number] =>
        entry !== null
    );
}

export function normalizeFinanceToolSnapshotSummary(
  summary: FinanceToolSnapshotSummaryInput
): FinanceToolSnapshotSummary {
  const topCategories = normalizeTopCategories(summary.topCategories);

  return {
    status: typeof summary.status === "string" ? summary.status : "unknown",
    includedOutflow: getOptionalFiniteNumber(summary.includedOutflow),
    totalMonthlyBudgetTarget: getOptionalFiniteNumber(
      summary.totalMonthlyBudgetTarget
    ),
    totalMonthlyIncomeTarget: getOptionalFiniteNumber(
      summary.totalMonthlyIncomeTarget
    ),
    categoryBudgetTotal: getOptionalFiniteNumber(summary.categoryBudgetTotal),
    suggestedMonthlyTarget:
      getOptionalFiniteNumber(summary.suggestedMonthlyTarget) ??
      getOptionalFiniteNumber(summary.totalMonthlyTarget),
    catchAllBudget: getOptionalFiniteNumber(summary.catchAllBudget),
    historicalAverageMonthlyIncome: getOptionalFiniteNumber(
      summary.historicalAverageMonthlyIncome
    ),
    historicalAverageMonthlySpend: getOptionalFiniteNumber(
      summary.historicalAverageMonthlySpend
    ),
    trailingAverageSpend: getOptionalFiniteNumber(summary.trailingAverageSpend),
    topCategories:
      topCategories.length > 0
        ? topCategories
        : normalizeTopCategories(summary.topBuckets),
  };
}
