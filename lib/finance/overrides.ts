import type { FinanceOverride as StoredFinanceOverride } from "@/lib/db/schema";
import { resolveBucketGroupFromBucket } from "./config";
import type {
  FinanceAction,
  FinanceAppliedOverride,
  FinanceTransaction,
  FinanceTransactionMatch,
  PlanMode,
} from "./types";
import { financeActionSchema } from "./types";
import { roundCurrency, safeLower } from "./utils";

type MatchableTransaction = Pick<
  FinanceTransaction,
  | "rawCategory"
  | "description"
  | "normalizedMerchant"
  | "account"
  | "outflowAmount"
>;

export function getFinanceActionsFromOverrides(
  overrides: StoredFinanceOverride[]
): FinanceAction[] {
  return overrides
    .map((override) => financeActionSchema.safeParse(override.valueJson))
    .filter((result) => result.success)
    .map((result) => result.data);
}

function transactionMatches(
  transaction: MatchableTransaction,
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

export function getTransactionMatchStats(
  action: Extract<FinanceAction, { match: FinanceTransactionMatch }>,
  transactions: MatchableTransaction[]
) {
  const matches = transactions.filter((transaction) =>
    transactionMatches(transaction, action.match)
  );

  return {
    matchedTransactions: matches.length,
    affectedOutflow: roundCurrency(
      matches.reduce((sum, transaction) => sum + transaction.outflowAmount, 0)
    ),
  };
}

function refreshBucketGroup(transaction: FinanceTransaction) {
  transaction.bucketGroup = resolveBucketGroupFromBucket({
    bucket: transaction.mappedBucket,
    includeFlag: transaction.includeFlag,
  });
}

export function applyFinanceOverrides(
  transactions: FinanceTransaction[],
  actions: FinanceAction[]
) {
  const nextTransactions = transactions.map((transaction) => ({
    ...transaction,
  }));

  for (const action of actions) {
    switch (action.type) {
      case "merge_buckets": {
        const from = action.from.map((value) => safeLower(value));

        for (const transaction of nextTransactions) {
          if (
            from.includes(safeLower(transaction.mappedBucket)) ||
            from.includes(safeLower(transaction.rawCategory))
          ) {
            transaction.mappedBucket = action.to;
            refreshBucketGroup(transaction);
          }
        }
        break;
      }
      case "remap_raw_category": {
        for (const transaction of nextTransactions) {
          if (safeLower(transaction.rawCategory) === safeLower(action.from)) {
            transaction.mappedBucket = action.to;
            refreshBucketGroup(transaction);
          }
        }
        break;
      }
      case "categorize_transactions": {
        for (const transaction of nextTransactions) {
          if (transactionMatches(transaction, action.match)) {
            transaction.mappedBucket = action.to;
            refreshBucketGroup(transaction);
          }
        }
        break;
      }
      case "categorize_transaction": {
        for (const transaction of nextTransactions) {
          if (transaction.id === action.transactionId) {
            transaction.mappedBucket = action.to;
            refreshBucketGroup(transaction);
          }
        }
        break;
      }
      case "rename_bucket": {
        for (const transaction of nextTransactions) {
          if (safeLower(transaction.mappedBucket) === safeLower(action.from)) {
            transaction.mappedBucket = action.to;
            refreshBucketGroup(transaction);
          }
        }
        break;
      }
      case "exclude_transactions": {
        for (const transaction of nextTransactions) {
          if (transactionMatches(transaction, action.match)) {
            transaction.includeFlag = false;
            transaction.exclusionReason = "Manual exclusion";
            refreshBucketGroup(transaction);
          }
        }
        break;
      }
      case "include_transactions": {
        for (const transaction of nextTransactions) {
          if (transactionMatches(transaction, action.match)) {
            transaction.includeFlag = true;
            transaction.exclusionReason = null;
            refreshBucketGroup(transaction);
          }
        }
        break;
      }
      case "set_bucket_monthly_target":
      case "set_plan_mode":
        break;
      default:
        break;
    }
  }

  return nextTransactions;
}

export function getPlanMode(actions: FinanceAction[]): PlanMode {
  const latestAction = [...actions]
    .reverse()
    .find((action) => action.type === "set_plan_mode");

  return latestAction?.mode ?? "balanced";
}

export function getBucketTargetOverrides(actions: FinanceAction[]) {
  return actions.filter(
    (
      action
    ): action is Extract<
      FinanceAction,
      { type: "set_bucket_monthly_target" }
    > => action.type === "set_bucket_monthly_target"
  );
}

export function summarizeFinanceAction(action: FinanceAction) {
  switch (action.type) {
    case "merge_buckets":
      return `Merged ${action.from.join(", ")} into ${action.to}`;
    case "remap_raw_category":
      return `Mapped ${action.from} to ${action.to}`;
    case "categorize_transactions":
      return `Categorized matching transactions as ${action.to}`;
    case "categorize_transaction":
      return `Categorized a transaction as ${action.to}`;
    case "exclude_transactions":
      return "Excluded matching transactions";
    case "include_transactions":
      return "Included matching transactions";
    case "rename_bucket":
      return `Renamed ${action.from} to ${action.to}`;
    case "set_bucket_monthly_target":
      return `Set ${action.bucket} monthly budget to $${action.amount.toFixed(0)}`;
    case "set_plan_mode":
      return `Switched plan mode to ${action.mode}`;
    default:
      return "Updated finance override";
  }
}

export function buildAppliedOverrides(
  overrides: StoredFinanceOverride[]
): FinanceAppliedOverride[] {
  return overrides
    .map((override) => {
      const parsed = financeActionSchema.safeParse(override.valueJson);

      if (!parsed.success) {
        return null;
      }

      return {
        id: override.id,
        type: parsed.data.type,
        summary: summarizeFinanceAction(parsed.data),
        createdAt: override.createdAt.toISOString(),
      } satisfies FinanceAppliedOverride;
    })
    .filter(
      (override): override is FinanceAppliedOverride => override !== null
    );
}
