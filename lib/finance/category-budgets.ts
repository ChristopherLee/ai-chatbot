import type { FinanceOverride as StoredFinanceOverride } from "@/lib/db/schema";
import { resolveBucketGroupFromBucket } from "./config";
import type { FinanceCategoryCard } from "./types";
import { financeActionSchema } from "./types";
import { roundCurrency, safeLower, toMonthKey } from "./utils";

export type FinanceCurrentCategoryBudget = {
  bucket: string;
  amount: number;
  overrideId: string | null;
};

export type FinanceCurrentCategoryBudgetOverrideGroup =
  FinanceCurrentCategoryBudget & {
    bucketKey: string;
    overrideIds: string[];
  };

export type FinanceCategoryBudgetSuggestion = {
  bucket: string;
  group: FinanceCategoryCard["group"];
  suggestedAmount: number;
  lastMonthActual: number;
};

export function getCurrentCategoryBudgetOverrideGroups(
  overrides: StoredFinanceOverride[]
): FinanceCurrentCategoryBudgetOverrideGroup[] {
  const latestByBucket = new Map<
    string,
    FinanceCurrentCategoryBudgetOverrideGroup
  >();

  for (const override of overrides) {
    const parsed = financeActionSchema.safeParse(override.valueJson);

    if (!parsed.success || parsed.data.type !== "set_bucket_monthly_target") {
      continue;
    }

    if (parsed.data.effectiveMonth) {
      continue;
    }

    const bucketKey = safeLower(parsed.data.bucket);
    const existing = latestByBucket.get(bucketKey);

    if (existing) {
      existing.bucket = parsed.data.bucket;
      existing.amount = roundCurrency(parsed.data.amount);
      existing.overrideId = override.id;
      existing.overrideIds.push(override.id);
      continue;
    }

    latestByBucket.set(bucketKey, {
      bucket: parsed.data.bucket,
      bucketKey,
      amount: roundCurrency(parsed.data.amount),
      overrideId: override.id,
      overrideIds: [override.id],
    });
  }

  return [...latestByBucket.values()].sort((left, right) =>
    left.bucket.localeCompare(right.bucket)
  );
}

export function getCurrentCategoryBudgetOverrides(
  overrides: StoredFinanceOverride[]
): FinanceCurrentCategoryBudget[] {
  return getCurrentCategoryBudgetOverrideGroups(overrides).map(
    ({ bucket, amount, overrideId }) => ({
      bucket,
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
  const activeBuckets = new Set(
    currentBudgets.map((budget) => safeLower(budget.bucket))
  );

  return categoryCards
    .filter((card) => !activeBuckets.has(safeLower(card.bucket)))
    .map((card) => {
      const currentMonthEntry = currentMonth
        ? card.monthly.find((entry) => entry.month === currentMonth)
        : null;

      return {
        bucket: card.bucket,
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
  bucket,
  categoryCards,
}: {
  bucket: string;
  categoryCards: FinanceCategoryCard[];
}) {
  const matchingCard = categoryCards.find(
    (card) => safeLower(card.bucket) === safeLower(bucket)
  );

  return (
    matchingCard?.group ??
    resolveBucketGroupFromBucket({
      bucket,
      includeFlag: true,
    })
  );
}
