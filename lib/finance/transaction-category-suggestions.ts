import type { FinanceOverride as StoredFinanceOverride } from "@/lib/db/schema";
import { buildFinanceActionKey } from "./action-keys";
import {
  previewFinanceRuleInSequence,
  summarizeFinanceAction,
} from "./overrides";
import {
  categorizeTransactionsActionSchema,
  type FinanceTransaction,
  type FinanceTransactionCategoryRuleSuggestion,
  type FinanceTransactionMatch,
} from "./types";
import { safeLower } from "./utils";

type ExistingCategorizationRule = {
  id: string;
  summary: string;
  action: Extract<
    ReturnType<typeof categorizeTransactionsActionSchema.parse>,
    { type: "categorize_transactions" }
  >;
};

function normalizeMatchKey(match: FinanceTransactionMatch) {
  return JSON.stringify({
    ...(match.account ? { account: safeLower(match.account.trim()) } : {}),
    ...(match.descriptionContains
      ? { descriptionContains: safeLower(match.descriptionContains.trim()) }
      : {}),
    ...(match.rawCategory
      ? { rawCategory: safeLower(match.rawCategory.trim()) }
      : {}),
  });
}

function buildExistingCategorizationRules(overrides: StoredFinanceOverride[]) {
  return overrides
    .map((override) => {
      const parsed = categorizeTransactionsActionSchema.safeParse(
        override.valueJson
      );

      if (!parsed.success) {
        return null;
      }

      return {
        id: override.id,
        summary: summarizeFinanceAction(parsed.data),
        action: parsed.data,
      } satisfies ExistingCategorizationRule;
    })
    .filter((rule): rule is ExistingCategorizationRule => rule !== null);
}

function findReplacementRule({
  action,
  existingRules,
}: {
  action: ExistingCategorizationRule["action"];
  existingRules: ExistingCategorizationRule[];
}) {
  const nextMatchKey = normalizeMatchKey(action.match);

  return (
    existingRules.find(
      (rule) =>
        normalizeMatchKey(rule.action.match) === nextMatchKey &&
        safeLower(rule.action.to) !== safeLower(action.to)
    ) ?? null
  );
}

function transactionMatchesMatch(
  transaction: FinanceTransaction,
  match: FinanceTransactionMatch
) {
  if (
    match.rawCategory &&
    safeLower(transaction.rawCategory) !== safeLower(match.rawCategory)
  ) {
    return false;
  }

  if (
    match.descriptionContains &&
    !safeLower(transaction.description).includes(
      safeLower(match.descriptionContains)
    )
  ) {
    return false;
  }

  if (
    match.account &&
    safeLower(transaction.account) !== safeLower(match.account)
  ) {
    return false;
  }

  return true;
}

function buildDescriptionScopedMatch(
  transaction: FinanceTransaction,
  exactDescriptionMatches: FinanceTransaction[]
) {
  if (exactDescriptionMatches.length < 2) {
    return null;
  }

  const match: FinanceTransactionMatch = {
    descriptionContains: transaction.description,
  };

  let scopedMatches = exactDescriptionMatches;
  const distinctAccounts = new Set(
    exactDescriptionMatches.map((item) => safeLower(item.account))
  );

  if (distinctAccounts.size > 1) {
    scopedMatches = exactDescriptionMatches.filter(
      (item) => safeLower(item.account) === safeLower(transaction.account)
    );

    if (scopedMatches.length < 2) {
      return null;
    }

    match.account = transaction.account;
  }

  const distinctRawCategories = new Set(
    scopedMatches.map((item) => safeLower(item.rawCategory))
  );

  if (distinctRawCategories.size > 1) {
    scopedMatches = scopedMatches.filter(
      (item) =>
        safeLower(item.rawCategory) === safeLower(transaction.rawCategory)
    );

    if (scopedMatches.length < 2) {
      return null;
    }

    match.rawCategory = transaction.rawCategory;
  }

  return match;
}

function buildSuggestionRationale({
  match,
  matchCount,
}: {
  match: FinanceTransactionMatch;
  matchCount: number;
}) {
  const qualifiers = [
    match.account ? `in ${match.account}` : null,
    match.rawCategory ? `with raw category ${match.rawCategory}` : null,
  ].filter((value): value is string => Boolean(value));
  const qualifierText = qualifiers.length > 0 ? ` ${qualifiers.join(" ")}` : "";

  return `${matchCount} transactions share this exact description${qualifierText}, so this is narrow enough to save as a recurring categorization rule.`;
}

export function buildTransactionCategoryRuleSuggestion({
  baseTransactions,
  finalTransactions,
  nextCategory,
  overrides,
  transactionId,
}: {
  baseTransactions: FinanceTransaction[];
  finalTransactions: FinanceTransaction[];
  nextCategory: string;
  overrides: StoredFinanceOverride[];
  transactionId: string;
}): FinanceTransactionCategoryRuleSuggestion | null {
  const transaction = finalTransactions.find(
    (item) => item.id === transactionId
  );

  if (!transaction) {
    return null;
  }

  const exactDescriptionMatches = finalTransactions.filter(
    (item) => safeLower(item.description) === safeLower(transaction.description)
  );
  const match = buildDescriptionScopedMatch(
    transaction,
    exactDescriptionMatches
  );

  if (!match) {
    return null;
  }

  const matchedTransactions = finalTransactions.filter((item) =>
    transactionMatchesMatch(item, match)
  );

  if (
    matchedTransactions.length < 2 ||
    matchedTransactions.some(
      (item) =>
        safeLower(item.description) !== safeLower(transaction.description)
    )
  ) {
    return null;
  }

  const action = {
    type: "categorize_transactions" as const,
    match,
    to: nextCategory,
  };
  const existingRules = buildExistingCategorizationRules(overrides);

  if (
    existingRules.some(
      (rule) =>
        buildFinanceActionKey(rule.action) === buildFinanceActionKey(action)
    )
  ) {
    return null;
  }

  const replacementRule = findReplacementRule({
    action,
    existingRules,
  });
  const preview = previewFinanceRuleInSequence({
    baseTransactions,
    overrides,
    draftAction: action,
    replaceRuleId: replacementRule?.id,
  });

  return {
    ...preview,
    rationale: buildSuggestionRationale({
      match,
      matchCount: matchedTransactions.length,
    }),
    action,
    replaceRuleId: replacementRule?.id ?? null,
    replaceRuleSummary: replacementRule?.summary ?? null,
  };
}
