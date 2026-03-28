import { z } from "zod";
import {
  categorizeTransactionActionSchema,
  categorizeTransactionsActionSchema,
  type FinanceAction,
} from "./types";
import { safeLower, uniqueBy } from "./utils";

export const financeCategorizationRuleSuggestionSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  summary: z.string().min(1),
  rationale: z.string().min(1),
  action: categorizeTransactionsActionSchema,
  matchedTransactionIds: z.array(z.string().uuid()),
  matchedTransactionCount: z.number().int().nonnegative(),
  affectedOutflow: z.number().finite().nonnegative(),
});

export const financeCategorizationTransactionSuggestionSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  summary: z.string().min(1),
  rationale: z.string().min(1),
  transactionId: z.string().uuid(),
  transactionDate: z.string().min(1),
  description: z.string().min(1),
  merchant: z.string().min(1),
  account: z.string().min(1),
  amount: z.number().finite().nonnegative(),
  currentBucket: z.string().min(1),
  rawCategory: z.string().min(1),
  suggestedBucket: z.string().min(1),
  matchingRuleIds: z.array(z.string().min(1)),
  action: categorizeTransactionActionSchema,
});

export const financeCategorizationReviewSchema = z.object({
  projectId: z.string().uuid(),
  generatedAt: z.string(),
  candidateCount: z.number().int().nonnegative(),
  suggestedRules: z.array(financeCategorizationRuleSuggestionSchema),
  suggestedTransactions: z.array(
    financeCategorizationTransactionSuggestionSchema
  ),
});

export const financeCategorizationSelectionRequestSchema = z.object({
  acceptedRules: z.array(financeCategorizationRuleSuggestionSchema).max(20),
  acceptedTransactions: z
    .array(financeCategorizationTransactionSuggestionSchema)
    .max(50),
  deniedRules: z.array(financeCategorizationRuleSuggestionSchema).max(20),
  deniedTransactions: z
    .array(financeCategorizationTransactionSuggestionSchema)
    .max(50),
});

export const financeCategorizationMemoryItemSchema = z.object({
  id: z.string().uuid(),
  key: z.string().min(1),
  summary: z.string().min(1),
  createdAt: z.string(),
  source: z.enum(["accepted", "denied"]),
  kind: z.enum(["rule", "transaction"]),
  valueJson: z.unknown(),
});

export const financeCategorizationMemorySchema = z.object({
  projectId: z.string().uuid(),
  acceptedRules: z.array(financeCategorizationMemoryItemSchema),
  acceptedTransactions: z.array(financeCategorizationMemoryItemSchema),
  deniedRules: z.array(financeCategorizationMemoryItemSchema),
  deniedTransactions: z.array(financeCategorizationMemoryItemSchema),
});

export type FinanceCategorizationRuleSuggestion = z.infer<
  typeof financeCategorizationRuleSuggestionSchema
>;
export type FinanceCategorizationTransactionSuggestion = z.infer<
  typeof financeCategorizationTransactionSuggestionSchema
>;
export type FinanceCategorizationReview = z.infer<
  typeof financeCategorizationReviewSchema
>;
export type FinanceCategorizationSelectionRequest = z.infer<
  typeof financeCategorizationSelectionRequestSchema
>;
export type FinanceCategorizationMemoryItem = z.infer<
  typeof financeCategorizationMemoryItemSchema
>;
export type FinanceCategorizationMemory = z.infer<
  typeof financeCategorizationMemorySchema
>;

type ReviewableCategorizationAction = Extract<
  FinanceAction,
  | { type: "categorize_transaction" }
  | { type: "categorize_transactions" }
  | { type: "remap_raw_category" }
>;

function normalizeMatchForKey(
  match: FinanceCategorizationRuleSuggestion["action"]["match"]
) {
  return {
    ...(match.account ? { account: safeLower(match.account.trim()) } : {}),
    ...(match.descriptionContains
      ? { descriptionContains: safeLower(match.descriptionContains.trim()) }
      : {}),
    ...(match.merchant ? { merchant: safeLower(match.merchant.trim()) } : {}),
    ...(match.rawCategory
      ? { rawCategory: safeLower(match.rawCategory.trim()) }
      : {}),
  };
}

export function buildFinanceActionReviewKey(
  action: ReviewableCategorizationAction
) {
  switch (action.type) {
    case "categorize_transaction":
      return `categorize_transaction:${action.transactionId}:${safeLower(action.to)}`;
    case "categorize_transactions":
      return `categorize_transactions:${JSON.stringify({
        match: normalizeMatchForKey(action.match),
        to: safeLower(action.to),
      })}`;
    case "remap_raw_category":
      return `remap_raw_category:${safeLower(action.from)}:${safeLower(action.to)}`;
    default:
      return JSON.stringify(action);
  }
}

export function buildRuleSuggestionKey(
  action: FinanceCategorizationRuleSuggestion["action"]
) {
  return buildFinanceActionReviewKey(action);
}

export function buildTransactionSuggestionKey(
  action: FinanceCategorizationTransactionSuggestion["action"]
) {
  return buildFinanceActionReviewKey(action);
}

export function buildAcceptedActionsFromReviewSelections({
  acceptedRules,
  acceptedTransactions,
}: {
  acceptedRules: FinanceCategorizationRuleSuggestion[];
  acceptedTransactions: FinanceCategorizationTransactionSuggestion[];
}) {
  const acceptedRuleIds = new Set(acceptedRules.map((rule) => rule.id));
  const actions = [
    ...acceptedRules.map((rule) => rule.action),
    ...acceptedTransactions
      .filter(
        (transaction) =>
          !transaction.matchingRuleIds.some((ruleId) =>
            acceptedRuleIds.has(ruleId)
          )
      )
      .map((transaction) => transaction.action),
  ];

  return uniqueBy(actions, (action) =>
    action.type === "categorize_transaction"
      ? buildTransactionSuggestionKey(action)
      : buildRuleSuggestionKey(action)
  );
}
