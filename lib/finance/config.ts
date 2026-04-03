import type { CategoryGroup, FinanceAction } from "./types";

export const EXPECTED_TRANSACTION_HEADERS = [
  "Date",
  "Account",
  "Description",
  "Category",
  "Tags",
  "Amount",
] as const;

export const FINANCE_RECOMMENDATION_LOOKBACK_MONTHS = 6;
export const FINANCE_DISPLAY_HISTORY_MONTHS = 12;

export const EXCLUDED_RAW_CATEGORIES = new Set([
  "Transfers",
  "Credit Card Payments",
  "Securities Trades",
  "Investment Income",
  "Paychecks/Salary",
  "Retirement Contributions",
  "Deposits",
  "Interest",
]);

export const NON_INCOME_RAW_CATEGORIES = new Set([
  "Transfers",
  "Credit Card Payments",
  "Securities Trades",
]);

export const RAW_CATEGORY_CATEGORY_MAP: Record<string, string> = {
  Restaurants: "Dining",
  Groceries: "Groceries",
  Travel: "Transport + Travel",
  Utilities: "Utilities",
  Mortgages: "Mortgage",
  "Home Maintenance": "Household",
  "Home Improvement": "Household",
  Renovation: "Household",
  "General Merchandise": "Household",
  "Clothing/Shoes": "Clothing",
  "Healthcare/Medical": "Healthcare",
  Checks: "Other / Misc",
  "Other Expenses": "Other / Misc",
  "Service Charges/Fees": "Other / Misc",
};

export const FIXED_CATEGORIES = new Set([
  "Mortgage",
  "Utilities",
  "Insurance",
  "Loans",
  "Phone",
  "Subscriptions",
]);

export const FLEXIBLE_CATEGORIES = new Set([
  "Groceries",
  "Dining",
  "Household",
  "Clothing",
  "Healthcare",
  "Other / Misc",
  "Transport + Travel",
]);

export const ANNUAL_CATEGORIES = new Set([
  "Travel",
  "Transport + Travel",
  "Gifts",
  "Education",
  "Home Improvement",
  "Renovation",
  "Luxury",
  "Personal Style",
]);

export function getDefaultFinanceExclusionActions(): Extract<
  FinanceAction,
  { type: "exclude_transactions" }
>[] {
  return [...EXCLUDED_RAW_CATEGORIES].map((rawCategory) => ({
    type: "exclude_transactions",
    match: { rawCategory },
  }));
}

export function getDefaultMappedCategory(rawCategory: string) {
  return RAW_CATEGORY_CATEGORY_MAP[rawCategory] ?? rawCategory;
}

export function resolveCategoryGroupFromCategory({
  category,
  includeFlag,
  activeMonths,
}: {
  category: string;
  includeFlag: boolean;
  activeMonths?: number;
}): CategoryGroup {
  if (!includeFlag) {
    return "excluded";
  }

  if (FIXED_CATEGORIES.has(category)) {
    return "fixed";
  }

  if (ANNUAL_CATEGORIES.has(category)) {
    return "annual";
  }

  if (FLEXIBLE_CATEGORIES.has(category)) {
    return "flexible";
  }

  if (typeof activeMonths === "number" && activeMonths <= 3) {
    return "annual";
  }

  return "flexible";
}
