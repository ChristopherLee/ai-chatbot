import type {
  FinanceAction,
  FinanceAppliedOverrideDetail,
  FinanceTransactionMatch,
} from "./types";

export const financeRuleTypeLabels: Record<FinanceAction["type"], string> = {
  categorize_transaction: "Transaction override",
  categorize_transactions: "Match transactions -> category",
  exclude_transactions: "Exclude from budget",
  merge_buckets: "Merge categories",
  remap_raw_category: "Raw category -> category",
  rename_bucket: "Rename category",
  set_bucket_monthly_target: "Category budget",
  set_plan_mode: "Plan mode",
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

function getTransactionDetail(
  details: FinanceAppliedOverrideDetail[]
) {
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
    case "remap_raw_category":
      return `Raw category ${quote(action.from)} -> ${quote(action.to)}`;
    case "merge_buckets":
      return `Categories ${action.from.map(quote).join(" + ")} -> ${quote(action.to)}`;
    case "rename_bucket":
      return `Category ${quote(action.from)} -> ${quote(action.to)}`;
    case "exclude_transactions":
      return `Exclude ${describeMatch(action.match)}`;
    case "set_bucket_monthly_target":
      return `Category budget ${quote(action.bucket)} -> ${action.amount}`;
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
    case "remap_raw_category":
      return "Applies to every transaction that still carries this raw category.";
    case "merge_buckets":
      return "Moves spend from the source categories into the destination category.";
    case "rename_bucket":
      return "Renames an existing category everywhere it is already used.";
    case "exclude_transactions":
      return "Removes matching transactions from the budget plan.";
    case "set_bucket_monthly_target":
      return "Sets the monthly target for this category.";
    case "set_plan_mode":
      return "Changes the planning mode for the whole project.";
    default:
      return null;
  }
}
