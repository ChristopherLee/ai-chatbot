import { generateObject } from "ai";
import { z } from "zod";
import { getLanguageModel } from "@/lib/ai/providers";
import { isTestEnvironment } from "@/lib/constants";
import {
  getFinanceCategorizationDenialsByProjectId,
  getFinanceOverridesByProjectId,
  getTransactionsByProjectId,
  saveFinanceCategorizationDenials,
  updateFinanceOverrideById,
} from "@/lib/db/finance-queries";
import type {
  FinanceCategorizationDenial,
  FinanceOverride,
} from "@/lib/db/schema";
import {
  buildAcceptedSelectionPlan,
  buildFinanceActionReviewKey,
  buildRuleSuggestionKey,
  buildTransactionSuggestionKey,
  type FinanceCategorizationMemory,
  type FinanceCategorizationMemoryItem,
  type FinanceCategorizationReview,
  type FinanceCategorizationRuleSuggestion,
  type FinanceCategorizationTransactionSuggestion,
} from "./categorization-review-shared";
import { categorizeTransactions } from "./categorize";
import {
  ANNUAL_CATEGORIES,
  FIXED_CATEGORIES,
  FLEXIBLE_CATEGORIES,
  RAW_CATEGORY_CATEGORY_MAP,
} from "./config";
import {
  getFinanceActionsFromOverrides,
  summarizeFinanceAction,
} from "./overrides";
import { getFinanceSnapshot, recomputeFinanceSnapshot } from "./snapshot";
import { applyFinanceActionsForChat } from "./tool-execution";
import {
  categorizeTransactionsActionSchema,
  type FinanceAction,
  type FinanceTransaction,
  type FinanceTransactionMatch,
  financeActionSchema,
} from "./types";
import { roundCurrency, safeLower, uniqueBy } from "./utils";

const reviewDraftRuleSchema = z.object({
  rationale: z.string().min(1),
  action: categorizeTransactionsActionSchema,
});

const reviewDraftTransactionSchema = z.object({
  transactionId: z.string().uuid(),
  rationale: z.string().min(1),
  suggestedCategory: z.string().min(1),
});

const reviewDraftSchema = z.object({
  ruleSuggestions: z.array(reviewDraftRuleSchema).max(8),
  transactionSuggestions: z.array(reviewDraftTransactionSchema).max(16),
});

type ReviewCandidateTransaction = Pick<
  FinanceTransaction,
  | "account"
  | "description"
  | "id"
  | "includeFlag"
  | "mappedCategory"
  | "normalizedMerchant"
  | "outflowAmount"
  | "rawCategory"
  | "transactionDate"
>;

type MemoryItem = FinanceCategorizationMemoryItem;
type ExistingCategorizationRule = {
  id: string;
  summary: string;
  action: z.infer<typeof categorizeTransactionsActionSchema>;
};

const AMBIGUOUS_RAW_CATEGORIES = new Set([
  "Other Expenses",
  "Service Charges/Fees",
  "Checks",
  "Uncategorized",
]);

const KEYWORD_CATEGORY_HINTS = [
  {
    pattern: /mortgage|crosscountry|newrez|chase ach|jpmorgan chase/i,
    category: "Mortgage",
  },
  { pattern: /insurance|geico|liberty mutual|travelers/i, category: "Insurance" },
  {
    pattern: /electric|energy|water|gas|utility|eversource|comcast|verizon/i,
    category: "Utilities",
  },
  {
    pattern:
      /whole foods|trader joe|market basket|stop & shop|costco|instacart/i,
    category: "Groceries",
  },
  {
    pattern: /restaurant|pizza|cafe|coffee|doordash|uber eats|grubhub/i,
    category: "Dining",
  },
];

function buildAvailableCategories(transactions: ReviewCandidateTransaction[]) {
  return Array.from(
    new Set([
      ...Object.values(RAW_CATEGORY_CATEGORY_MAP),
      ...Array.from(FIXED_CATEGORIES),
      ...Array.from(FLEXIBLE_CATEGORIES),
      ...Array.from(ANNUAL_CATEGORIES),
      ...transactions.map((transaction) => transaction.mappedCategory),
    ])
  ).sort((first, second) => first.localeCompare(second));
}

function buildCategorizationRuleMatchKey(match: FinanceTransactionMatch) {
  return JSON.stringify({
    account: match.account ? safeLower(match.account.trim()) : null,
    descriptionContains: match.descriptionContains
      ? safeLower(match.descriptionContains.trim())
      : null,
    merchant: match.merchant ? safeLower(match.merchant.trim()) : null,
    rawCategory: match.rawCategory ? safeLower(match.rawCategory.trim()) : null,
  });
}

function buildExistingCategorizationRules(
  overrides: FinanceOverride[]
): ExistingCategorizationRule[] {
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

function findSuggestedRuleReplacement({
  action,
  existingCategorizationRules,
}: {
  action: z.infer<typeof categorizeTransactionsActionSchema>;
  existingCategorizationRules: ExistingCategorizationRule[];
}) {
  const nextMatchKey = buildCategorizationRuleMatchKey(action.match);

  return (
    existingCategorizationRules.find(
      (rule) =>
        buildCategorizationRuleMatchKey(rule.action.match) === nextMatchKey &&
        safeLower(rule.action.to) !== safeLower(action.to)
    ) ?? null
  );
}

function transactionMatchesReviewMatch(
  transaction: ReviewCandidateTransaction,
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
    match.merchant &&
    !safeLower(transaction.normalizedMerchant).includes(
      safeLower(match.merchant)
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

function resolveCategoryName(value: string, availableCategories: string[]) {
  const normalized = value.trim().toLowerCase();

  return (
    availableCategories.find((category) => category.toLowerCase() === normalized) ??
    availableCategories.find((category) =>
      category.toLowerCase().includes(normalized)
    ) ??
    availableCategories.find((category) =>
      normalized.includes(category.toLowerCase())
    ) ??
    value.trim()
  );
}

function buildReviewCandidateTransactions(
  transactions: ReviewCandidateTransaction[]
) {
  const includedTransactions = transactions.filter(
    (transaction) => transaction.includeFlag && transaction.outflowAmount > 0
  );
  const ambiguousTransactions = includedTransactions.filter(
    (transaction) =>
      transaction.mappedCategory === "Other / Misc" ||
      AMBIGUOUS_RAW_CATEGORIES.has(transaction.rawCategory)
  );
  const largestTransactions = [...includedTransactions]
    .sort((first, second) => second.outflowAmount - first.outflowAmount)
    .slice(0, 20);

  return uniqueBy(
    [...ambiguousTransactions, ...largestTransactions].sort(
      (first, second) => second.outflowAmount - first.outflowAmount
    ),
    (transaction) => transaction.id
  ).slice(0, 60);
}

function buildMerchantSummaries(
  transactions: ReviewCandidateTransaction[],
  candidateTransactions: ReviewCandidateTransaction[]
) {
  const candidateMerchantNames = new Set(
    candidateTransactions.map((transaction) => transaction.normalizedMerchant)
  );

  return Array.from(
    transactions.reduce(
      (map, transaction) => {
        if (
          !transaction.includeFlag ||
          transaction.outflowAmount <= 0 ||
          !candidateMerchantNames.has(transaction.normalizedMerchant)
        ) {
          return map;
        }

        const current = map.get(transaction.normalizedMerchant) ?? {
          merchant: transaction.normalizedMerchant,
          accounts: new Set<string>(),
          categories: new Map<string, number>(),
          descriptions: new Set<string>(),
          count: 0,
          totalOutflow: 0,
        };

        current.accounts.add(transaction.account);
        current.categories.set(
          transaction.mappedCategory,
          (current.categories.get(transaction.mappedCategory) ?? 0) + 1
        );
        current.descriptions.add(transaction.description);
        current.count += 1;
        current.totalOutflow = roundCurrency(
          current.totalOutflow + transaction.outflowAmount
        );
        map.set(transaction.normalizedMerchant, current);
        return map;
      },
      new Map<
        string,
        {
          merchant: string;
          accounts: Set<string>;
          categories: Map<string, number>;
          descriptions: Set<string>;
          count: number;
          totalOutflow: number;
        }
      >()
    )
  )
    .map(([, value]) => ({
      merchant: value.merchant,
      accounts: Array.from(value.accounts),
      categories: Array.from(value.categories.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((first, second) => second.count - first.count),
      descriptions: Array.from(value.descriptions).slice(0, 4),
      count: value.count,
      totalOutflow: value.totalOutflow,
    }))
    .sort((first, second) => second.totalOutflow - first.totalOutflow)
    .slice(0, 25);
}

function buildHeuristicReviewDraft({
  availableCategories,
  candidateTransactions,
}: {
  availableCategories: string[];
  candidateTransactions: ReviewCandidateTransaction[];
}) {
  const ruleSuggestions: z.infer<typeof reviewDraftRuleSchema>[] = [];
  const transactionSuggestions: z.infer<typeof reviewDraftTransactionSchema>[] =
    [];
  const seenRuleKeys = new Set<string>();

  for (const transaction of candidateTransactions) {
    const matchedHint = KEYWORD_CATEGORY_HINTS.find((hint) =>
      hint.pattern.test(
        `${transaction.normalizedMerchant} ${transaction.description}`
      )
    );

    if (!matchedHint) {
      continue;
    }

    const suggestedCategory = resolveCategoryName(
      matchedHint.category,
      availableCategories
    );

    if (
      !suggestedCategory ||
      safeLower(suggestedCategory) === safeLower(transaction.mappedCategory)
    ) {
      continue;
    }

    const action = {
      type: "categorize_transactions" as const,
      match: {
        merchant: transaction.normalizedMerchant,
      },
      to: suggestedCategory,
    };
    const key = buildFinanceActionReviewKey(action);

    if (!seenRuleKeys.has(key)) {
      ruleSuggestions.push({
        rationale: `This merchant looks like it belongs under ${suggestedCategory}.`,
        action,
      });
      seenRuleKeys.add(key);
    }

    transactionSuggestions.push({
      transactionId: transaction.id,
      rationale: `This transaction looks like ${suggestedCategory} instead of ${transaction.mappedCategory}.`,
      suggestedCategory,
    });
  }

  return {
    ruleSuggestions: ruleSuggestions.slice(0, 6),
    transactionSuggestions: transactionSuggestions.slice(0, 12),
  };
}

function buildDenialItems(
  denials: FinanceCategorizationDenial[]
): MemoryItem[] {
  return uniqueBy(
    denials.map((denial) => ({
      id: denial.id,
      key: denial.key,
      summary: denial.summary,
      createdAt: denial.createdAt.toISOString(),
      source: "denied" as const,
      kind:
        denial.kind === "transaction"
          ? ("transaction" as const)
          : ("rule" as const),
      valueJson: denial.valueJson,
    })),
    (item) => item.key
  );
}

function buildAcceptedMemoryItems(overrides: FinanceOverride[]) {
  const items = overrides
    .map<MemoryItem | null>((override) => {
      const [action] = getFinanceActionsFromOverrides([override]);

      if (
        !action ||
        (action.type !== "categorize_transactions" &&
          action.type !== "categorize_transaction")
      ) {
        return null;
      }

      const key = buildFinanceActionReviewKey(action);

      return {
        id: override.id,
        key,
        summary: summarizeFinanceAction(action),
        createdAt: override.createdAt.toISOString(),
        source: "accepted" as const,
        kind:
          action.type === "categorize_transaction"
            ? ("transaction" as const)
            : ("rule" as const),
        valueJson: override.valueJson,
      } satisfies MemoryItem;
    })
    .filter((item): item is MemoryItem => item !== null);

  return uniqueBy(items, (item) => item.key);
}

function filterSuggestionsAgainstMemory({
  acceptedKeys,
  deniedKeys,
  suggestedRules,
  suggestedTransactions,
}: {
  acceptedKeys: Set<string>;
  deniedKeys: Set<string>;
  suggestedRules: FinanceCategorizationRuleSuggestion[];
  suggestedTransactions: FinanceCategorizationTransactionSuggestion[];
}) {
  const rules = uniqueBy(
    suggestedRules.filter(
      (suggestion) =>
        !acceptedKeys.has(suggestion.key) && !deniedKeys.has(suggestion.key)
    ),
    (suggestion) => suggestion.key
  );
  const transactions = uniqueBy(
    suggestedTransactions.filter(
      (suggestion) =>
        !acceptedKeys.has(suggestion.key) && !deniedKeys.has(suggestion.key)
    ),
    (suggestion) => suggestion.key
  );

  return {
    suggestedRules: rules,
    suggestedTransactions: transactions,
  };
}

function enrichRuleSuggestion({
  action,
  availableCategories,
  categorizedTransactions,
  existingCategorizationRules,
  index,
  rationale,
}: {
  action: z.infer<typeof categorizeTransactionsActionSchema>;
  availableCategories: string[];
  categorizedTransactions: ReviewCandidateTransaction[];
  existingCategorizationRules: ExistingCategorizationRule[];
  index: number;
  rationale: string;
}): FinanceCategorizationRuleSuggestion | null {
  const resolvedAction = {
    ...action,
    to: resolveCategoryName(action.to, availableCategories),
  };

  if (
    !availableCategories.some(
      (category) => safeLower(category) === safeLower(resolvedAction.to)
    )
  ) {
    return null;
  }

  const matchedTransactions = categorizedTransactions.filter((transaction) =>
    transactionMatchesReviewMatch(transaction, resolvedAction.match)
  );

  if (
    matchedTransactions.length === 0 ||
    matchedTransactions.every(
      (transaction) =>
        safeLower(transaction.mappedCategory) === safeLower(resolvedAction.to)
    )
  ) {
    return null;
  }

  const replacementRule = findSuggestedRuleReplacement({
    action: resolvedAction,
    existingCategorizationRules,
  });

  return {
    id: `rule-${index + 1}`,
    key: buildRuleSuggestionKey(resolvedAction),
    summary: summarizeFinanceAction(resolvedAction),
    rationale,
    action: resolvedAction,
    matchedTransactionIds: matchedTransactions.map(
      (transaction) => transaction.id
    ),
    matchedTransactionCount: matchedTransactions.length,
    affectedOutflow: roundCurrency(
      matchedTransactions.reduce(
        (sum, transaction) => sum + transaction.outflowAmount,
        0
      )
    ),
    replaceRuleId: replacementRule?.id,
    replaceRuleSummary: replacementRule?.summary,
  } satisfies FinanceCategorizationRuleSuggestion;
}

function enrichTransactionSuggestion({
  availableCategories,
  categorizedTransactions,
  candidateTransactions,
  index,
  rationale,
  suggestedCategory,
  transactionId,
}: {
  availableCategories: string[];
  categorizedTransactions: ReviewCandidateTransaction[];
  candidateTransactions: ReviewCandidateTransaction[];
  index: number;
  rationale: string;
  suggestedCategory: string;
  transactionId: string;
}): FinanceCategorizationTransactionSuggestion | null {
  const transaction = categorizedTransactions.find(
    (candidateTransaction) => candidateTransaction.id === transactionId
  );

  if (!transaction) {
    return null;
  }

  const resolvedCategory = resolveCategoryName(suggestedCategory, availableCategories);

  if (
    !availableCategories.some(
      (category) => safeLower(category) === safeLower(resolvedCategory)
    ) ||
    !candidateTransactions.some(
      (candidateTransaction) => candidateTransaction.id === transactionId
    ) ||
    safeLower(transaction.mappedCategory) === safeLower(resolvedCategory)
  ) {
    return null;
  }

  const action = {
    type: "categorize_transaction" as const,
    transactionId: transaction.id,
    to: resolvedCategory,
  };

  return {
    id: `transaction-${index + 1}`,
    key: buildTransactionSuggestionKey(action),
    summary: `Categorize ${transaction.normalizedMerchant} on ${transaction.transactionDate} as ${resolvedCategory}`,
    rationale,
    transactionId: transaction.id,
    transactionDate: transaction.transactionDate,
    description: transaction.description,
    merchant: transaction.normalizedMerchant,
    account: transaction.account,
    amount: transaction.outflowAmount,
    currentCategory: transaction.mappedCategory,
    rawCategory: transaction.rawCategory,
    suggestedCategory: resolvedCategory,
    matchingRuleIds: [] as string[],
    action,
  } satisfies FinanceCategorizationTransactionSuggestion;
}

function attachMatchingRules({
  suggestedRules,
  suggestedTransactions,
}: {
  suggestedRules: FinanceCategorizationRuleSuggestion[];
  suggestedTransactions: FinanceCategorizationTransactionSuggestion[];
}): FinanceCategorizationTransactionSuggestion[] {
  return suggestedTransactions.map((suggestion) => ({
    ...suggestion,
    matchingRuleIds: suggestedRules
      .filter(
        (rule) =>
          safeLower(rule.action.to) === safeLower(suggestion.suggestedCategory) &&
          transactionMatchesReviewMatch(
            {
              account: suggestion.account,
              description: suggestion.description,
              id: suggestion.transactionId,
              includeFlag: true,
              mappedCategory: suggestion.currentCategory,
              normalizedMerchant: suggestion.merchant,
              outflowAmount: suggestion.amount,
              rawCategory: suggestion.rawCategory,
              transactionDate: suggestion.transactionDate,
            },
            rule.action.match
          )
      )
      .map((rule) => rule.id),
  }));
}

export async function getFinanceCategorizationMemory({
  projectId,
}: {
  projectId: string;
}) {
  const [overrides, denials] = await Promise.all([
    getFinanceOverridesByProjectId({ projectId }),
    getFinanceCategorizationDenialsByProjectId({ projectId }),
  ]);

  const acceptedItems = buildAcceptedMemoryItems(overrides);
  const acceptedKeys = new Set(acceptedItems.map((item) => item.key));
  const deniedItems = buildDenialItems(denials).filter(
    (item) => !acceptedKeys.has(item.key)
  );

  return {
    projectId,
    acceptedRules: acceptedItems.filter((item) => item.kind === "rule"),
    acceptedTransactions: acceptedItems.filter(
      (item) => item.kind === "transaction"
    ),
    deniedRules: deniedItems.filter((item) => item.kind === "rule"),
    deniedTransactions: deniedItems.filter(
      (item) => item.kind === "transaction"
    ),
  } satisfies FinanceCategorizationMemory;
}

export async function findMiscategorizedTransactions({
  projectId,
  selectedChatModel,
  maxRules = 6,
  maxTransactions = 12,
}: {
  projectId: string;
  selectedChatModel: string;
  maxRules?: number;
  maxTransactions?: number;
}) {
  const [transactions, overrides, categorizationMemory] = await Promise.all([
    getTransactionsByProjectId({ projectId }),
    getFinanceOverridesByProjectId({ projectId }),
    getFinanceCategorizationMemory({ projectId }),
  ]);

  const actions = getFinanceActionsFromOverrides(overrides);
  const categorizedTransactions = categorizeTransactions({
    transactions,
    actions,
  });
  const existingCategorizationRules =
    buildExistingCategorizationRules(overrides);
  const candidateTransactions = buildReviewCandidateTransactions(
    categorizedTransactions
  );
  const availableCategories = buildAvailableCategories(categorizedTransactions);
  const merchantSummaries = buildMerchantSummaries(
    categorizedTransactions,
    candidateTransactions
  );

  const acceptedKeys = new Set(
    [
      ...categorizationMemory.acceptedRules,
      ...categorizationMemory.acceptedTransactions,
    ].map((item) => item.key)
  );
  const deniedKeys = new Set(
    [
      ...categorizationMemory.deniedRules,
      ...categorizationMemory.deniedTransactions,
    ].map((item) => item.key)
  );

  const draft = isTestEnvironment
    ? buildHeuristicReviewDraft({
        availableCategories,
        candidateTransactions,
      })
    : await (async () => {
        try {
          const { object } = await generateObject({
            model: getLanguageModel(selectedChatModel),
            schema: reviewDraftSchema,
            system: `You audit finance transactions for likely miscategorizations.

Only suggest rules that can be safely saved going forward.
- Use categorize_transactions only when the same merchant, description pattern, or account-scoped pattern reliably maps to one category.
- If a transaction looks wrong but the pattern is not stable enough for a reusable rule, suggest it only as a one-off transaction suggestion.
- Never suggest a rule or transaction if it is already accepted or explicitly denied.
- Use only the allowed category names.
- Favor high-confidence suggestions and keep the list short.
- If an existing categorization rule has the right match pattern but the wrong destination category, suggest the corrected rule using the same stable match so it can replace the outdated rule.
- Never suggest changing a transaction to its current category.`,
            prompt: JSON.stringify({
              allowedCategories: availableCategories,
              candidateTransactions: candidateTransactions.map(
                (transaction) => ({
                  account: transaction.account,
                  amount: transaction.outflowAmount,
                  currentCategory: transaction.mappedCategory,
                  description: transaction.description,
                  id: transaction.id,
                  merchant: transaction.normalizedMerchant,
                  rawCategory: transaction.rawCategory,
                  transactionDate: transaction.transactionDate,
                })
              ),
              acceptedRules: categorizationMemory.acceptedRules.map((item) => ({
                key: item.key,
                summary: item.summary,
              })),
              acceptedTransactions:
                categorizationMemory.acceptedTransactions.map((item) => ({
                  key: item.key,
                  summary: item.summary,
                })),
              deniedRules: categorizationMemory.deniedRules.map((item) => ({
                key: item.key,
                summary: item.summary,
              })),
              deniedTransactions: categorizationMemory.deniedTransactions.map(
                (item) => ({
                  key: item.key,
                  summary: item.summary,
                })
              ),
              existingCategorizationRules: existingCategorizationRules.map(
                (rule) => ({
                  id: rule.id,
                  match: rule.action.match,
                  summary: rule.summary,
                  to: rule.action.to,
                })
              ),
              merchantSummaries,
            }),
          });

          return object;
        } catch (_error) {
          return buildHeuristicReviewDraft({
            availableCategories,
            candidateTransactions,
          });
        }
      })();

  const suggestedRules = draft.ruleSuggestions
    .map((suggestion, index) =>
      enrichRuleSuggestion({
        action: suggestion.action,
        availableCategories,
        categorizedTransactions,
        existingCategorizationRules,
        index,
        rationale: suggestion.rationale,
      })
    )
    .filter(
      (suggestion): suggestion is FinanceCategorizationRuleSuggestion =>
        suggestion !== null
    )
    .slice(0, maxRules);

  const suggestedTransactions = draft.transactionSuggestions
    .map((suggestion, index) =>
      enrichTransactionSuggestion({
        availableCategories,
        categorizedTransactions,
        candidateTransactions,
        index,
        rationale: suggestion.rationale,
        suggestedCategory: suggestion.suggestedCategory,
        transactionId: suggestion.transactionId,
      })
    )
    .filter(
      (suggestion): suggestion is FinanceCategorizationTransactionSuggestion =>
        suggestion !== null
    )
    .slice(0, maxTransactions);

  const filteredSuggestions = filterSuggestionsAgainstMemory({
    acceptedKeys,
    deniedKeys,
    suggestedRules,
    suggestedTransactions,
  });

  return {
    projectId,
    generatedAt: new Date().toISOString(),
    candidateCount: candidateTransactions.length,
    suggestedRules: filteredSuggestions.suggestedRules,
    suggestedTransactions: attachMatchingRules({
      suggestedRules: filteredSuggestions.suggestedRules,
      suggestedTransactions: filteredSuggestions.suggestedTransactions,
    }),
  } satisfies FinanceCategorizationReview;
}

export async function persistFinanceCategorizationSelections({
  acceptedRules,
  acceptedTransactions,
  deniedRules,
  deniedTransactions,
  projectId,
}: {
  acceptedRules: FinanceCategorizationRuleSuggestion[];
  acceptedTransactions: FinanceCategorizationTransactionSuggestion[];
  deniedRules: FinanceCategorizationRuleSuggestion[];
  deniedTransactions: FinanceCategorizationTransactionSuggestion[];
  projectId: string;
}) {
  const [existingMemory, overrides] = await Promise.all([
    getFinanceCategorizationMemory({ projectId }),
    getFinanceOverridesByProjectId({ projectId }),
  ]);
  const existingOverrideActionsById = new Map(
    overrides
      .map((override) => {
        const parsed = financeActionSchema.safeParse(override.valueJson);

        if (!parsed.success) {
          return null;
        }

        return [override.id, parsed.data] as const;
      })
      .filter(
        (entry): entry is readonly [string, FinanceAction] => entry !== null
      )
  );
  const existingAcceptedKeys = new Set(
    getFinanceActionsFromOverrides(overrides)
      .filter(
        (
          action
        ): action is Extract<
          FinanceAction,
          | { type: "categorize_transaction" }
          | { type: "categorize_transactions" }
        > =>
          action.type === "categorize_transaction" ||
          action.type === "categorize_transactions"
      )
      .map((action) => buildFinanceActionReviewKey(action))
  );
  const existingDeniedKeys = new Set(
    [...existingMemory.deniedRules, ...existingMemory.deniedTransactions].map(
      (item) => item.key
    )
  );
  const acceptedSelectionPlan = buildAcceptedSelectionPlan({
    acceptedRules,
    acceptedTransactions,
  });
  const reservedActionKeys = new Set(existingAcceptedKeys);
  const ruleUpdatesToApply = acceptedSelectionPlan.ruleUpdates.filter(
    (ruleUpdate) => {
      const currentAction = existingOverrideActionsById.get(ruleUpdate.ruleId);

      if (!currentAction || currentAction.type !== "categorize_transactions") {
        return false;
      }

      const currentKey = buildRuleSuggestionKey(
        currentAction as z.infer<typeof categorizeTransactionsActionSchema>
      );
      const nextKey = buildRuleSuggestionKey(ruleUpdate.action);

      if (currentKey === nextKey) {
        return false;
      }

      reservedActionKeys.delete(currentKey);

      if (reservedActionKeys.has(nextKey)) {
        reservedActionKeys.add(currentKey);
        return false;
      }

      reservedActionKeys.add(nextKey);
      return true;
    }
  );
  const actionsToApply = acceptedSelectionPlan.createActions.filter(
    (action) => {
      const key =
        action.type === "categorize_transaction"
          ? buildTransactionSuggestionKey(action)
          : buildRuleSuggestionKey(
              action as z.infer<typeof categorizeTransactionsActionSchema>
            );

      if (reservedActionKeys.has(key)) {
        return false;
      }

      reservedActionKeys.add(key);
      return true;
    }
  );

  const denialsToSave = uniqueBy(
    [
      ...deniedRules.map((suggestion) => ({
        kind: "rule",
        key: suggestion.key,
        summary: suggestion.summary,
        valueJson: suggestion,
      })),
      ...deniedTransactions.map((suggestion) => ({
        kind: "transaction",
        key: suggestion.key,
        summary: suggestion.summary,
        valueJson: suggestion,
      })),
    ],
    (item) => item.key
  ).filter(
    (item) =>
      !existingAcceptedKeys.has(item.key) && !existingDeniedKeys.has(item.key)
  );

  let applyResult: Awaited<
    ReturnType<typeof applyFinanceActionsForChat>
  > | null = null;
  const updatedRuleActions: Array<{
    action: FinanceAction;
    summary: string;
    matchedTransactions: number | null;
    affectedOutflow: number | null;
  }> = [];

  for (const ruleUpdate of ruleUpdatesToApply) {
    const updatedOverride = await updateFinanceOverrideById({
      id: ruleUpdate.ruleId,
      projectId,
      action: ruleUpdate.action,
    });

    if (!updatedOverride) {
      continue;
    }

    updatedRuleActions.push({
      action: ruleUpdate.action,
      summary: summarizeFinanceAction(ruleUpdate.action),
      matchedTransactions: null,
      affectedOutflow: null,
    });
  }

  if (actionsToApply.length > 0) {
    applyResult = await applyFinanceActionsForChat({
      projectId,
      actions: actionsToApply,
    });
  }

  if (denialsToSave.length > 0) {
    await saveFinanceCategorizationDenials({
      projectId,
      denials: denialsToSave,
    });
  }

  return {
    appliedActions: [
      ...updatedRuleActions,
      ...(applyResult?.appliedActions ?? []),
    ],
    deniedSuggestions: denialsToSave.map((denial) => ({
      key: denial.key,
      kind: denial.kind,
      summary: denial.summary,
    })),
    snapshot:
      applyResult?.snapshot ??
      (updatedRuleActions.length > 0
        ? await recomputeFinanceSnapshot({ projectId })
        : await getFinanceSnapshot({ projectId })),
  };
}

