import type { FinanceAction, FinanceTransactionMatch } from "./types";
import { safeLower } from "./utils";

function normalizeMatchForKey(match: FinanceTransactionMatch) {
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

export function buildFinanceActionKey(action: FinanceAction) {
  switch (action.type) {
    case "categorize_transaction":
      return `categorize_transaction:${action.transactionId}:${safeLower(action.to)}`;
    case "categorize_transactions":
      return `categorize_transactions:${JSON.stringify({
        match: normalizeMatchForKey(action.match),
        to: safeLower(action.to),
      })}`;
    case "exclude_transactions":
      return `exclude_transactions:${JSON.stringify(normalizeMatchForKey(action.match))}`;
    case "set_category_monthly_target":
      return `set_category_monthly_target:${safeLower(action.category)}:${action.amount}:${action.effectiveMonth ?? "none"}`;
    case "set_plan_mode":
      return `set_plan_mode:${action.mode}`;
    default:
      return JSON.stringify(action);
  }
}
