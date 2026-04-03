import type { FinanceOverride as StoredFinanceOverride } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { resolveCategoryGroupFromCategory } from "./config";
import type {
  FinanceAction,
  FinanceAppliedOverride,
  FinanceAppliedOverrideDetail,
  FinanceRuleAffectedTransaction,
  FinanceRulePreview,
  FinanceRuleRecord,
  FinanceTransaction,
  FinanceTransactionMatch,
  PlanMode,
} from "./types";
import { financeActionSchema } from "./types";
import { roundCurrency, safeLower } from "./utils";

type MatchableTransaction = Pick<
  FinanceTransaction,
  | "id"
  | "transactionDate"
  | "rawCategory"
  | "description"
  | "normalizedMerchant"
  | "account"
  | "outflowAmount"
> &
  Partial<Pick<FinanceTransaction, "mappedCategory" | "includeFlag">>;

const DEFAULT_AFFECTED_TRANSACTION_LIMIT = 12;

type RulePresentation = {
  details: FinanceAppliedOverrideDetail[];
  matchedTransactions: number | null;
  affectedOutflow: number | null;
  affectedTransactions: FinanceRuleAffectedTransaction[];
  affectedTransactionsTruncated: boolean;
  totalAffectedTransactions: number;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function sortTransactionsForPreview(
  left: MatchableTransaction,
  right: MatchableTransaction
) {
  const dateDelta = right.transactionDate.localeCompare(left.transactionDate);

  if (dateDelta !== 0) {
    return dateDelta;
  }

  return right.outflowAmount - left.outflowAmount;
}

function toAffectedTransaction(
  transaction: MatchableTransaction
): FinanceRuleAffectedTransaction {
  return {
    id: transaction.id,
    transactionDate: transaction.transactionDate,
    description: transaction.description,
    merchant: transaction.normalizedMerchant,
    account: transaction.account,
    rawCategory: transaction.rawCategory,
    amount: roundCurrency(transaction.outflowAmount),
    category: transaction.mappedCategory ?? transaction.rawCategory,
    includeFlag: transaction.includeFlag ?? true,
  };
}

function buildAffectedTransactionPreview(
  matches: MatchableTransaction[],
  limit = DEFAULT_AFFECTED_TRANSACTION_LIMIT
) {
  const orderedMatches = [...matches].sort(sortTransactionsForPreview);

  return {
    matchedTransactions: orderedMatches.length,
    affectedOutflow: roundCurrency(
      orderedMatches.reduce(
        (sum, transaction) => sum + transaction.outflowAmount,
        0
      )
    ),
    affectedTransactions: orderedMatches
      .slice(0, limit)
      .map(toAffectedTransaction),
    affectedTransactionsTruncated: orderedMatches.length > limit,
    totalAffectedTransactions: orderedMatches.length,
  };
}

function describeMatch(match: FinanceTransactionMatch) {
  const parts = [
    match.merchant ? `Merchant contains "${match.merchant}"` : null,
    match.descriptionContains
      ? `Description contains "${match.descriptionContains}"`
      : null,
    match.rawCategory ? `Raw category is "${match.rawCategory}"` : null,
    match.account ? `Account is "${match.account}"` : null,
  ].filter((value): value is string => Boolean(value));

  return parts.join(" and ");
}

function buildMatchRuleDetails(match: FinanceTransactionMatch) {
  return [
    {
      label: "When",
      value: describeMatch(match),
    },
  ] satisfies FinanceAppliedOverrideDetail[];
}

function buildSingleTransactionDetails(
  action: Extract<FinanceAction, { type: "categorize_transaction" }>,
  transactions: MatchableTransaction[]
) {
  const transaction = transactions.find(
    (item) => item.id === action.transactionId
  );

  if (!transaction) {
    return {
      details: [
        {
          label: "Transaction",
          value: action.transactionId,
        },
        {
          label: "Then",
          value: `Categorize as ${action.to}`,
        },
      ] satisfies FinanceAppliedOverrideDetail[],
      affectedOutflow: null,
    };
  }

  return {
    details: [
      {
        label: "Transaction",
        value: `${transaction.transactionDate} - ${transaction.description}`,
      },
      {
        label: "Merchant / account",
        value: `${transaction.normalizedMerchant} - ${transaction.account}`,
      },
      {
        label: "Then",
        value: `Categorize as ${action.to}`,
      },
    ] satisfies FinanceAppliedOverrideDetail[],
    affectedOutflow: roundCurrency(transaction.outflowAmount),
  };
}

export function buildFinanceRulePresentation(
  action: FinanceAction,
  transactions: MatchableTransaction[],
  excludeTransactionIds: Set<string>
): RulePresentation {
  const preview = buildAffectedTransactionPreview(
    getAffectedTransactionsForAction(action, transactions, {
      excludeTransactionIds,
    })
  );

  switch (action.type) {
    case "categorize_transactions":
      return {
        details: [
          ...buildMatchRuleDetails(action.match),
          {
            label: "Then",
            value: `Categorize as ${action.to}`,
          },
        ],
        ...preview,
      };
    case "categorize_transaction": {
      const singleTransaction = buildSingleTransactionDetails(
        action,
        transactions
      );

      return {
        details: singleTransaction.details,
        matchedTransactions: preview.totalAffectedTransactions,
        affectedOutflow:
          singleTransaction.affectedOutflow ?? preview.affectedOutflow,
        affectedTransactions: preview.affectedTransactions,
        affectedTransactionsTruncated: preview.affectedTransactionsTruncated,
        totalAffectedTransactions: preview.totalAffectedTransactions,
      };
    }
    case "exclude_transactions":
      return {
        details: [
          ...buildMatchRuleDetails(action.match),
          {
            label: "Then",
            value: "Exclude matching transactions from the plan",
          },
        ],
        ...preview,
      };
    case "set_category_monthly_target":
      return {
        details: [
          {
            label: "Category",
            value: action.category,
          },
          {
            label: "Category budget",
            value: formatCurrency(action.amount),
          },
          ...(action.effectiveMonth
            ? [
                {
                  label: "Effective month",
                  value: action.effectiveMonth,
                },
              ]
            : []),
        ],
        ...preview,
      };
    case "set_plan_mode":
      return {
        details: [
          {
            label: "Mode",
            value: action.mode,
          },
        ],
        matchedTransactions: null,
        affectedOutflow: null,
        affectedTransactions: [],
        affectedTransactionsTruncated: false,
        totalAffectedTransactions: 0,
      };
    default:
      return {
        details: [],
        matchedTransactions: null,
        affectedOutflow: null,
        affectedTransactions: [],
        affectedTransactionsTruncated: false,
        totalAffectedTransactions: 0,
      };
  }
}

export function getLockedCategorizationTransactionIds(
  actions: FinanceAction[]
) {
  return new Set(
    actions
      .filter(
        (
          action
        ): action is Extract<
          FinanceAction,
          { type: "categorize_transaction" }
        > => action.type === "categorize_transaction"
      )
      .map((action) => action.transactionId)
  );
}

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

function getAffectedTransactionsForAction(
  action: FinanceAction,
  transactions: MatchableTransaction[],
  {
    excludeTransactionIds,
  }: {
    excludeTransactionIds?: Set<string>;
  } = {}
) {
  switch (action.type) {
    case "categorize_transactions":
    case "exclude_transactions":
      return transactions.filter(
        (transaction) =>
          !excludeTransactionIds?.has(transaction.id) &&
          transactionMatches(transaction, action.match)
      );
    case "categorize_transaction":
      return transactions.filter(
        (transaction) => transaction.id === action.transactionId
      );
    case "set_category_monthly_target":
      return transactions.filter(
        (transaction) =>
          transaction.includeFlag !== false &&
          safeLower(transaction.mappedCategory) === safeLower(action.category)
      );
    case "set_plan_mode":
      return [];
    default:
      return [];
  }
}

export function getTransactionMatchStats(
  action: Extract<FinanceAction, { match: FinanceTransactionMatch }>,
  transactions: MatchableTransaction[],
  {
    excludeTransactionIds,
  }: {
    excludeTransactionIds?: Set<string>;
  } = {}
) {
  const matches = getAffectedTransactionsForAction(action, transactions, {
    excludeTransactionIds,
  });

  return {
    matchedTransactions: matches.length,
    affectedOutflow: roundCurrency(
      matches.reduce((sum, transaction) => sum + transaction.outflowAmount, 0)
    ),
  };
}

function refreshCategoryGroup(transaction: FinanceTransaction) {
  transaction.categoryGroup = resolveCategoryGroupFromCategory({
    category: transaction.mappedCategory,
    includeFlag: transaction.includeFlag,
  });
}

function applyCategorization(
  transaction: FinanceTransaction,
  destinationCategory: string
) {
  transaction.mappedCategory = destinationCategory;
  transaction.includeFlag = true;
  transaction.exclusionReason = null;
  refreshCategoryGroup(transaction);
}

function applyFinanceActionToTransactions(
  transactions: FinanceTransaction[],
  action: FinanceAction,
  lockedCategorizationTransactionIds: Set<string>
) {
  switch (action.type) {
    case "categorize_transactions": {
      for (const transaction of transactions) {
        if (lockedCategorizationTransactionIds.has(transaction.id)) {
          continue;
        }

        if (transactionMatches(transaction, action.match)) {
          applyCategorization(transaction, action.to);
        }
      }
      break;
    }
    case "categorize_transaction": {
      for (const transaction of transactions) {
        if (transaction.id === action.transactionId) {
          applyCategorization(transaction, action.to);
        }
      }
      break;
    }
    case "exclude_transactions": {
      for (const transaction of transactions) {
        if (transactionMatches(transaction, action.match)) {
          transaction.includeFlag = false;
          transaction.exclusionReason = "Manual exclusion";
          refreshCategoryGroup(transaction);
        }
      }
      break;
    }
    case "set_category_monthly_target":
    case "set_plan_mode":
      break;
    default:
      break;
  }
}

export function applyFinanceOverrides(
  transactions: FinanceTransaction[],
  actions: FinanceAction[],
  {
    lockedCategorizationTransactionIds,
  }: {
    lockedCategorizationTransactionIds?: Set<string>;
  } = {}
) {
  const nextTransactions = transactions.map((transaction) => ({
    ...transaction,
  }));
  const lockedTransactionIds =
    lockedCategorizationTransactionIds ??
    getLockedCategorizationTransactionIds(actions);

  for (const action of actions) {
    applyFinanceActionToTransactions(
      nextTransactions,
      action,
      lockedTransactionIds
    );
  }

  return nextTransactions;
}

export function getPlanMode(actions: FinanceAction[]): PlanMode {
  const latestAction = [...actions]
    .reverse()
    .find((action) => action.type === "set_plan_mode");

  return latestAction?.mode ?? "balanced";
}

export function getCategoryTargetOverrides(actions: FinanceAction[]) {
  return actions.filter(
    (
      action
    ): action is Extract<
      FinanceAction,
      { type: "set_category_monthly_target" }
    > => action.type === "set_category_monthly_target"
  );
}

export function summarizeFinanceAction(action: FinanceAction) {
  switch (action.type) {
    case "categorize_transactions":
      return `Categorized matching transactions as ${action.to}`;
    case "categorize_transaction":
      return `Categorized one transaction as ${action.to}`;
    case "exclude_transactions":
      return "Excluded matching transactions";
    case "set_category_monthly_target":
      return `Set ${action.category} category budget to $${action.amount.toFixed(0)}`;
    case "set_plan_mode":
      return `Switched plan mode to ${action.mode}`;
    default:
      return "Updated finance override";
  }
}

export function buildFinanceRuleRecords(
  overrides: StoredFinanceOverride[],
  transactions: FinanceTransaction[] = []
): FinanceRuleRecord[] {
  const parsedOverrides = overrides
    .map((override) => {
      const parsed = financeActionSchema.safeParse(override.valueJson);

      if (!parsed.success) {
        return null;
      }

      return {
        override,
        action: parsed.data,
      };
    })
    .filter(
      (
        item
      ): item is {
        override: StoredFinanceOverride;
        action: FinanceAction;
      } => item !== null
    );
  const lockedCategorizationTransactionIds =
    getLockedCategorizationTransactionIds(
      parsedOverrides.map((item) => item.action)
    );
  const currentTransactions = transactions.map((transaction) => ({
    ...transaction,
  }));

  return parsedOverrides.map((item, index) => {
    const presentation = buildFinanceRulePresentation(
      item.action,
      currentTransactions,
      lockedCategorizationTransactionIds
    );

    const record = {
      id: item.override.id,
      type: item.action.type,
      summary: summarizeFinanceAction(item.action),
      createdAt: item.override.createdAt.toISOString(),
      details: presentation.details,
      matchedTransactions: presentation.matchedTransactions,
      affectedOutflow: presentation.affectedOutflow,
      action: item.action,
      orderIndex: index,
      affectedTransactions: presentation.affectedTransactions,
      affectedTransactionsTruncated: presentation.affectedTransactionsTruncated,
      totalAffectedTransactions: presentation.totalAffectedTransactions,
    } satisfies FinanceRuleRecord;

    applyFinanceActionToTransactions(
      currentTransactions,
      item.action,
      lockedCategorizationTransactionIds
    );

    return record;
  });
}

export function previewFinanceRuleInSequence({
  baseTransactions,
  overrides,
  draftAction,
  replaceRuleId,
}: {
  baseTransactions: FinanceTransaction[];
  overrides: StoredFinanceOverride[];
  draftAction: FinanceAction;
  replaceRuleId?: string;
}): FinanceRulePreview {
  const parsedOverrides = overrides
    .map((override) => {
      const parsed = financeActionSchema.safeParse(override.valueJson);

      if (!parsed.success) {
        return null;
      }

      return {
        id: override.id,
        action: parsed.data,
      };
    })
    .filter(
      (
        item
      ): item is {
        id: string;
        action: FinanceAction;
      } => item !== null
    );
  const targetIndex =
    typeof replaceRuleId === "string"
      ? parsedOverrides.findIndex((override) => override.id === replaceRuleId)
      : parsedOverrides.length;

  if (typeof replaceRuleId === "string" && targetIndex === -1) {
    throw new ChatSDKError("not_found:database", "Finance rule not found");
  }

  const sequence =
    typeof replaceRuleId === "string"
      ? parsedOverrides.map((override, index) =>
          index === targetIndex
            ? {
                id: replaceRuleId,
                action: draftAction,
              }
            : override
        )
      : [...parsedOverrides, { id: "draft", action: draftAction }];
  const lockedCategorizationTransactionIds =
    getLockedCategorizationTransactionIds(
      sequence.map((override) => override.action)
    );
  const currentTransactions = applyFinanceOverrides(
    baseTransactions,
    sequence.slice(0, targetIndex).map((override) => override.action),
    {
      lockedCategorizationTransactionIds,
    }
  );
  const presentation = buildFinanceRulePresentation(
    draftAction,
    currentTransactions,
    lockedCategorizationTransactionIds
  );

  return {
    summary: summarizeFinanceAction(draftAction),
    details: presentation.details,
    matchedTransactions: presentation.matchedTransactions,
    affectedOutflow: presentation.affectedOutflow,
    affectedTransactions: presentation.affectedTransactions,
    affectedTransactionsTruncated: presentation.affectedTransactionsTruncated,
    totalAffectedTransactions: presentation.totalAffectedTransactions,
  };
}

export function buildAppliedOverrides(
  overrides: StoredFinanceOverride[],
  transactions: FinanceTransaction[] = []
): FinanceAppliedOverride[] {
  return buildFinanceRuleRecords(overrides, transactions).map(
    ({
      action: _action,
      orderIndex: _orderIndex,
      affectedTransactions: _affectedTransactions,
      affectedTransactionsTruncated: _affectedTransactionsTruncated,
      totalAffectedTransactions: _totalAffectedTransactions,
      ...override
    }) => override
  );
}
