import type {
  FinanceAction,
  FinanceAppliedOverrideDetail,
  FinanceTransactionMatch,
} from "./types";

export const financeRuleTypeLabels: Record<FinanceAction["type"], string> = {
  categorize_transactions: "Match transactions -> category",
  exclude_transactions: "Exclude from budget",
  categorize_transaction: "Transaction override",
  exclude_transaction: "Transaction exclusion",
  set_category_monthly_target: "Category budget",
  set_plan_mode: "Plan mode",
};

export const financeRuleTypeMetadata: Record<
  FinanceAction["type"],
  {
    definition: string;
    why: string;
  }
> = {
  categorize_transactions: {
    definition:
      "Matches transactions by merchant, description, raw category, or account, then sends every match to one category.",
    why: "We need this for recurring patterns like the same merchant showing up month after month.",
  },
  exclude_transactions: {
    definition: "Removes matching transactions from the budget plan.",
    why: "We need this so transfers, reimbursements, or noise do not distort the budget.",
  },
  categorize_transaction: {
    definition: "Changes one specific transaction and nothing else.",
    why: "We keep this for one-off exceptions even though it is hidden from the reusable rules page.",
  },
  exclude_transaction: {
    definition: "Excludes one specific transaction and nothing else.",
    why: "We keep this for one-off exceptions that should not count toward the budget.",
  },
  set_category_monthly_target: {
    definition: "Sets the monthly target for one category.",
    why: "We need this because categorization and budgeting are separate decisions.",
  },
  set_plan_mode: {
    definition: "Changes the overall planning mode for the project.",
    why: "We need this because the whole plan can be more balanced or more conservative even when categories stay the same.",
  },
};

function quote(value: string) {
  return `"${value}"`;
}

function describeMatch(match: FinanceTransactionMatch) {
  const parts = [
    match.rawCategory ? `Raw category ${quote(match.rawCategory)}` : null,
    match.merchant ? `Merchant ${quote(match.merchant)}` : null,
    match.descriptionContains
      ? `Description ${quote(match.descriptionContains)}`
      : null,
    match.account ? `Account ${quote(match.account)}` : null,
  ].filter((value): value is string => Boolean(value));

  return parts.join(" + ");
}

function getTransactionDetail(details: FinanceAppliedOverrideDetail[]) {
  const transactionDetail = details.find(
    (detail) => detail.label === "Transaction"
  )?.value;

  return transactionDetail ? `Transaction ${quote(transactionDetail)}` : null;
}

export function describeFinanceRuleAction(
  action: FinanceAction,
  details: FinanceAppliedOverrideDetail[] = []
) {
  switch (action.type) {
    case "categorize_transactions":
      return `${describeMatch(action.match)} -> ${quote(action.to)}`;
    case "categorize_transaction":
      return `${getTransactionDetail(details) ?? "Transaction override"} -> ${quote(action.to)}`;
    case "exclude_transaction":
      return `Exclude ${getTransactionDetail(details) ?? "transaction"}`;
    case "exclude_transactions":
      return `Exclude ${describeMatch(action.match)}`;
    case "set_category_monthly_target":
      return `Category budget ${quote(action.category)} -> ${action.amount}`;
    case "set_plan_mode":
      return `Plan mode -> ${quote(action.mode)}`;
    default:
      return "Saved finance rule";
  }
}

export function describeFinanceRuleBehavior(action: FinanceAction) {
  switch (action.type) {
    case "categorize_transactions":
      return "Applies to every transaction that matches these saved conditions.";
    case "categorize_transaction":
      return "Applies only to this one saved transaction override.";
    case "exclude_transaction":
      return "Removes only this one saved transaction from the budget plan.";
    case "exclude_transactions":
      return "Removes matching transactions from the budget plan.";
    case "set_category_monthly_target":
      return "Sets the monthly target for this category.";
    case "set_plan_mode":
      return "Changes the planning mode for the whole project.";
    default:
      return null;
  }
}
