import type { FinanceOverride as StoredFinanceOverride } from "@/lib/db/schema";
import { resolveCategoryGroupFromCategory } from "./config";
import type { FinanceCategoryCard } from "./types";
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

export type FinanceCategoryBudgetSuggestion = {
  category: string;
  group: FinanceCategoryCard["group"];
  suggestedAmount: number;
  lastMonthActual: number;
};

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
    .map((card) => {
      const currentMonthEntry = currentMonth
        ? card.monthly.find((entry) => entry.month === currentMonth)
        : null;

      return {
        category: card.category,
        group: card.group,
        suggestedAmount: roundCurrency(
          currentMonthEntry?.target ?? card.trailingAverage ?? 0
        ),
        lastMonthActual: roundCurrency(
          currentMonthEntry?.actual ?? card.trailingAverage ?? 0
        ),
      } satisfies FinanceCategoryBudgetSuggestion;
    })
    .filter((suggestion) => suggestion.suggestedAmount > 0)
    .sort((left, right) => right.suggestedAmount - left.suggestedAmount);
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

