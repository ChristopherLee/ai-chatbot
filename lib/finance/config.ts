import type { BucketGroup } from "./types";

export const EXPECTED_TRANSACTION_HEADERS = [
  "Date",
  "Account",
  "Description",
  "Category",
  "Tags",
  "Amount",
] as const;

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

export const RAW_CATEGORY_BUCKET_MAP: Record<string, string> = {
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

export const FIXED_BUCKETS = new Set([
  "Mortgage",
  "Utilities",
  "Insurance",
  "Loans",
  "Phone",
  "Subscriptions",
]);

export const FLEXIBLE_BUCKETS = new Set([
  "Groceries",
  "Dining",
  "Household",
  "Clothing",
  "Healthcare",
  "Other / Misc",
  "Transport + Travel",
]);

export const ANNUAL_BUCKETS = new Set([
  "Travel",
  "Transport + Travel",
  "Gifts",
  "Education",
  "Home Improvement",
  "Renovation",
  "Luxury",
  "Personal Style",
]);

export function isExcludedRawCategory(rawCategory: string) {
  return EXCLUDED_RAW_CATEGORIES.has(rawCategory);
}

export function getDefaultMappedBucket(rawCategory: string) {
  return RAW_CATEGORY_BUCKET_MAP[rawCategory] ?? rawCategory;
}

export function resolveBucketGroupFromBucket({
  bucket,
  includeFlag,
  activeMonths,
}: {
  bucket: string;
  includeFlag: boolean;
  activeMonths?: number;
}): BucketGroup {
  if (!includeFlag) {
    return "excluded";
  }

  if (FIXED_BUCKETS.has(bucket)) {
    return "fixed";
  }

  if (ANNUAL_BUCKETS.has(bucket)) {
    return "annual";
  }

  if (FLEXIBLE_BUCKETS.has(bucket)) {
    return "flexible";
  }

  if (typeof activeMonths === "number" && activeMonths <= 3) {
    return "annual";
  }

  return "flexible";
}
