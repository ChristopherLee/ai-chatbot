import type { FinanceOverride as StoredFinanceOverride } from "@/lib/db/schema";
import { resolveCategoryGroupFromCategory } from "./config";
import type {
  FinanceCategoryBudgetSuggestionCadence,
  FinanceCategoryBudgetSuggestionRecency,
  FinanceCategoryCard,
  FinanceTargetsCategoryBudgetSuggestion,
} from "./types";
import { financeActionSchema } from "./types";
import { roundCurrency, safeLower, toMonthKey } from "./utils";

export type FinanceCurrentCategoryBudget = {
  category: string;
  amount: number;
  overrideId: string | null;
};

export type FinanceCurrentCategoryBudgetOverrideGroup =
  FinanceCurrentCategoryBudget & {
    categoryKey: string;
    overrideIds: string[];
  };

export type FinanceCategoryBudgetSuggestion =
  FinanceTargetsCategoryBudgetSuggestion;

const SMALL_CATEGORY_BUDGET_THRESHOLD = 75;
const MIN_RECENT_CATEGORY_BUDGET = 150;
const MIN_SIGNIFICANT_CATEGORY_TOTAL = 250;

const recurringBillPattern =
  /mortgage|rent|insurance|electric|energy|water|gas|utility|internet|wifi|comcast|verizon|phone|mobile|subscription|netflix|spotify|hulu|applecare|icloud|gym|daycare|tuition/i;

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle] ?? 0;
}

function standardDeviation(values: number[]) {
  if (values.length <= 1) {
    return 0;
  }

  const mean = average(values);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;

  return Math.sqrt(variance);
}

function detectRecurringBillSignals(card: FinanceCategoryCard) {
  const sampleText = [
    card.category,
    ...card.topMerchants.map((merchant) => merchant.merchant),
    ...card.transactions
      .slice(0, 8)
      .map(
        (transaction) => `${transaction.merchant} ${transaction.description}`
      ),
  ].join(" ");

  return recurringBillPattern.test(sampleText);
}

function categorizeBudgetRecency({
  activeInLatestMonth,
  activeInPreviousMonth,
}: {
  activeInLatestMonth: boolean;
  activeInPreviousMonth: boolean;
}): FinanceCategoryBudgetSuggestionRecency {
  if (activeInLatestMonth) {
    return "active";
  }

  if (activeInPreviousMonth) {
    return "cooling";
  }

  return "inactive";
}

function buildSuggestionReason({
  cadence,
  hasRecurringBillSignals,
  recency,
}: {
  cadence: FinanceCategoryBudgetSuggestionCadence;
  hasRecurringBillSignals: boolean;
  recency: FinanceCategoryBudgetSuggestionRecency;
}) {
  if (hasRecurringBillSignals && cadence !== "occasional") {
    return "Descriptions look like a recurring bill, so this uses a steadier monthly budget.";
  }

  if (cadence === "steady") {
    return "This category shows up consistently, so the starter budget uses a steadier recent amount.";
  }

  if (cadence === "variable") {
    return "Recent spending moves around month to month, so the starter budget uses a softer recent average.";
  }

  if (cadence === "recent") {
    return "This mostly appears in the latest month, so the starter budget leans on the newest activity.";
  }

  if (recency === "inactive") {
    return "This was more active in earlier months, so it is treated as occasional spending instead of a monthly default.";
  }

  return "This looks more occasional than monthly, so the starter budget spreads the spend out over time.";
}

function buildCategoryBudgetSuggestion({
  card,
  currentMonth,
}: {
  card: FinanceCategoryCard;
  currentMonth: string | null;
}): FinanceCategoryBudgetSuggestion | null {
  const observedMonthly = currentMonth
    ? card.monthly.filter((entry) => entry.month <= currentMonth)
    : card.monthly;
  const latestMonthEntry = observedMonthly.at(-1) ?? null;
  const previousMonthEntry =
    observedMonthly.length > 1 ? (observedMonthly.at(-2) ?? null) : null;

  if (!latestMonthEntry) {
    return null;
  }

  const nonZeroValues = observedMonthly
    .map((entry) => entry.actual)
    .filter((value) => value > 0);
  const recentWindow = observedMonthly.slice(-3);
  const recentNonZeroValues = recentWindow
    .map((entry) => entry.actual)
    .filter((value) => value > 0);
  const activeMonthCount = nonZeroValues.length;
  const activeInLatestMonth = latestMonthEntry.actual > 0;
  const activeInPreviousMonth = (previousMonthEntry?.actual ?? 0) > 0;
  const recency = categorizeBudgetRecency({
    activeInLatestMonth,
    activeInPreviousMonth,
  });
  const recurringBillSignals = detectRecurringBillSignals(card);
  const averageNonZero = average(nonZeroValues);
  const variabilityRatio =
    averageNonZero > 0 ? standardDeviation(nonZeroValues) / averageNonZero : 0;
  const looksFixed =
    card.group === "fixed" ||
    recurringBillSignals ||
    (activeMonthCount >= 4 && activeInLatestMonth && variabilityRatio <= 0.18);
  const looksOccasional =
    card.group === "annual" ||
    (!looksFixed && activeMonthCount <= 2 && !activeInLatestMonth);

  let cadence: FinanceCategoryBudgetSuggestionCadence;
  let suggestedAmount: number;

  if (looksFixed) {
    cadence = variabilityRatio <= 0.18 ? "steady" : "variable";
    suggestedAmount = roundCurrency(
      median(
        recentNonZeroValues.length > 0 ? recentNonZeroValues : nonZeroValues
      )
    );
  } else if (looksOccasional) {
    cadence = "occasional";
    suggestedAmount = roundCurrency(
      observedMonthly.reduce((sum, entry) => sum + entry.actual, 0) /
        Math.max(observedMonthly.length, 1)
    );
  } else if (
    activeInLatestMonth &&
    !activeInPreviousMonth &&
    activeMonthCount <= 2
  ) {
    cadence = "recent";
    suggestedAmount = roundCurrency(
      Math.max(latestMonthEntry.actual, average(recentNonZeroValues))
    );
  } else {
    cadence = variabilityRatio > 0.35 ? "variable" : "steady";
    suggestedAmount = roundCurrency(
      average(
        recentNonZeroValues.length > 0 ? recentNonZeroValues : nonZeroValues
      )
    );
  }

  if (suggestedAmount <= 0 || card.group === "excluded") {
    return null;
  }

  if (
    suggestedAmount < SMALL_CATEGORY_BUDGET_THRESHOLD &&
    card.totalOutflow < MIN_SIGNIFICANT_CATEGORY_TOTAL
  ) {
    return null;
  }

  if (
    cadence === "recent" &&
    suggestedAmount < MIN_RECENT_CATEGORY_BUDGET &&
    !looksFixed
  ) {
    return null;
  }

  if (
    recency === "inactive" &&
    !looksFixed &&
    !looksOccasional &&
    suggestedAmount < MIN_RECENT_CATEGORY_BUDGET
  ) {
    return null;
  }

  return {
    category: card.category,
    group: card.group,
    suggestedAmount,
    lastMonthActual: roundCurrency(latestMonthEntry.actual),
    cadence,
    recency,
    reasoning: buildSuggestionReason({
      cadence,
      hasRecurringBillSignals: recurringBillSignals,
      recency,
    }),
  } satisfies FinanceCategoryBudgetSuggestion;
}

export function getCurrentCategoryBudgetOverrideGroups(
  overrides: StoredFinanceOverride[]
): FinanceCurrentCategoryBudgetOverrideGroup[] {
  const latestByCategory = new Map<
    string,
    FinanceCurrentCategoryBudgetOverrideGroup
  >();

  for (const override of overrides) {
    const parsed = financeActionSchema.safeParse(override.valueJson);

    if (!parsed.success || parsed.data.type !== "set_category_monthly_target") {
      continue;
    }

    if (parsed.data.effectiveMonth) {
      continue;
    }

    const categoryKey = safeLower(parsed.data.category);
    const existing = latestByCategory.get(categoryKey);

    if (existing) {
      existing.category = parsed.data.category;
      existing.amount = roundCurrency(parsed.data.amount);
      existing.overrideId = override.id;
      existing.overrideIds.push(override.id);
      continue;
    }

    latestByCategory.set(categoryKey, {
      category: parsed.data.category,
      categoryKey,
      amount: roundCurrency(parsed.data.amount),
      overrideId: override.id,
      overrideIds: [override.id],
    });
  }

  return [...latestByCategory.values()].sort((left, right) =>
    left.category.localeCompare(right.category)
  );
}

export function getCurrentCategoryBudgetOverrides(
  overrides: StoredFinanceOverride[]
): FinanceCurrentCategoryBudget[] {
  return getCurrentCategoryBudgetOverrideGroups(overrides).map(
    ({ category, amount, overrideId }) => ({
      category,
      amount,
      overrideId,
    })
  );
}

export function getCurrentCategoryBudgetTotal(
  overrides: StoredFinanceOverride[]
) {
  return roundCurrency(
    getCurrentCategoryBudgetOverrides(overrides).reduce(
      (sum, budget) => sum + budget.amount,
      0
    )
  );
}

export function buildCategoryBudgetSuggestions({
  categoryCards,
  currentBudgets,
  latestTransactionDate,
}: {
  categoryCards: FinanceCategoryCard[];
  currentBudgets: FinanceCurrentCategoryBudget[];
  latestTransactionDate: string | null;
}) {
  const currentMonth = latestTransactionDate
    ? toMonthKey(latestTransactionDate)
    : null;
  const activeCategories = new Set(
    currentBudgets.map((budget) => safeLower(budget.category))
  );

  return categoryCards
    .filter((card) => !activeCategories.has(safeLower(card.category)))
    .map((card) =>
      buildCategoryBudgetSuggestion({
        card,
        currentMonth,
      })
    )
    .filter(
      (suggestion): suggestion is FinanceCategoryBudgetSuggestion =>
        suggestion !== null
    )
    .sort(
      (left, right) =>
        right.suggestedAmount - left.suggestedAmount ||
        left.category.localeCompare(right.category)
    );
}

export function resolveCategoryBudgetGroup({
  category,
  categoryCards,
}: {
  category: string;
  categoryCards: FinanceCategoryCard[];
}) {
  const matchingCard = categoryCards.find(
    (card) => safeLower(card.category) === safeLower(category)
  );

  return (
    matchingCard?.group ??
    resolveCategoryGroupFromCategory({
      category,
      includeFlag: true,
    })
  );
}
