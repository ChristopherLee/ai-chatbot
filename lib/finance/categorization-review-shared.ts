import { z } from "zod";
import { buildFinanceActionKey } from "./action-keys";
import {
  categorizeTransactionActionSchema,
  categorizeTransactionsActionSchema,
  type FinanceAction,
} from "./types";
import { uniqueBy } from "./utils";

export const financeCategorizationRuleSuggestionSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  summary: z.string().min(1),
  rationale: z.string().min(1),
  action: categorizeTransactionsActionSchema,
  matchedTransactionIds: z.array(z.string().uuid()),
  matchedTransactionCount: z.number().int().nonnegative(),
  affectedOutflow: z.number().finite().nonnegative(),
  replaceRuleId: z.string().uuid().optional(),
  replaceRuleSummary: z.string().min(1).optional(),
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
  currentCategory: z.string().min(1),
  rawCategory: z.string().min(1),
  suggestedCategory: z.string().min(1),
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
export type FinanceCategorizationAcceptedSelectionPlan = {
  ruleUpdates: Array<{
    ruleId: string;
    action: FinanceCategorizationRuleSuggestion["action"];
  }>;
  createActions: FinanceAction[];
};

type ReviewableCategorizationAction = Extract<
  FinanceAction,
  | { type: "categorize_transaction" }
  | { type: "categorize_transactions" }
>;

export function buildFinanceActionReviewKey(
  action: ReviewableCategorizationAction
) {
  return buildFinanceActionKey(action);
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
  return buildAcceptedSelectionPlan({
    acceptedRules,
    acceptedTransactions,
  }).createActions;
}

export function buildAcceptedSelectionPlan({
  acceptedRules,
  acceptedTransactions,
}: {
  acceptedRules: FinanceCategorizationRuleSuggestion[];
  acceptedTransactions: FinanceCategorizationTransactionSuggestion[];
}): FinanceCategorizationAcceptedSelectionPlan {
  const acceptedRuleIds = new Set(acceptedRules.map((rule) => rule.id));
  const ruleUpdates = uniqueBy(
    acceptedRules
      .filter(
        (
          rule
        ): rule is FinanceCategorizationRuleSuggestion & {
          replaceRuleId: string;
        } => typeof rule.replaceRuleId === "string"
      )
      .map((rule) => ({
        ruleId: rule.replaceRuleId,
        action: rule.action,
      })),
    (update) => update.ruleId
  );
  const createActions = [
    ...acceptedRules
      .filter((rule) => typeof rule.replaceRuleId !== "string")
      .map((rule) => rule.action),
    ...acceptedTransactions
      .filter(
        (transaction) =>
          !transaction.matchingRuleIds.some((ruleId) =>
            acceptedRuleIds.has(ruleId)
          )
      )
      .map((transaction) => transaction.action),
  ];

  return {
    ruleUpdates,
    createActions: uniqueBy(createActions, (action) =>
      action.type === "categorize_transaction"
        ? buildTransactionSuggestionKey(action)
        : buildRuleSuggestionKey(action)
    ),
  };
}
