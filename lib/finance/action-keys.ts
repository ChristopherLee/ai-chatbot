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
    case "remap_raw_category":
      return `remap_raw_category:${safeLower(action.from)}:${safeLower(action.to)}`;
    case "exclude_transactions":
      return `exclude_transactions:${JSON.stringify(normalizeMatchForKey(action.match))}`;
    case "merge_buckets":
      return `merge_buckets:${JSON.stringify({
        from: action.from.map((value) => safeLower(value.trim())).sort(),
        to: safeLower(action.to),
      })}`;
    case "rename_bucket":
      return `rename_bucket:${safeLower(action.from)}:${safeLower(action.to)}`;
    case "set_bucket_monthly_target":
      return `set_bucket_monthly_target:${safeLower(action.bucket)}:${action.amount}:${action.effectiveMonth ?? "none"}`;
    case "set_plan_mode":
      return `set_plan_mode:${action.mode}`;
    default:
      return JSON.stringify(action);
  }
}
