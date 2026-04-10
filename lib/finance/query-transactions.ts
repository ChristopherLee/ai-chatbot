import { z } from "zod";
import type { FinanceTransaction } from "./types";
import { roundCurrency, safeLower } from "./utils";

export const financeTransactionQueryInputSchema = z
  .object({
    representation: z
      .enum(["budget", "raw"])
      .default("budget")
      .optional(),
    search: z.string().trim().min(1).optional(),
    merchant: z.string().trim().min(1).optional(),
    descriptionContains: z.string().trim().min(1).optional(),
    rawCategory: z.string().trim().min(1).optional(),
    category: z.string().trim().min(1).optional(),
    account: z.string().trim().min(1).optional(),
    includeFlag: z.boolean().optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    page: z.number().int().min(1).default(1),
    sortBy: z
      .enum(["date", "description", "account", "category", "status", "amount"])
      .default("date"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine(
    (value) =>
      value.startDate === undefined ||
      value.endDate === undefined ||
      value.startDate <= value.endDate,
    {
      message: "startDate must be on or before endDate.",
      path: ["endDate"],
    }
  );

export type FinanceTransactionQueryInput = z.infer<
  typeof financeTransactionQueryInputSchema
>;

export const FINANCE_TRANSACTIONS_PAGE_SIZE = 100;

export type FinanceTransactionQueryResult = {
  filters: FinanceTransactionQueryInput;
  representation: "budget" | "raw";
  matchedCount: number;
  returnedCount: number;
  totalMatchedOutflow: number;
  matchedIncludedCount: number;
  matchedExcludedCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  startIndex: number;
  endIndex: number;
  truncated: boolean;
  transactions: Array<{
    id: string;
    transactionDate: string;
    description: string;
    merchant: string;
    account: string;
    amount: number;
    rawCategory: string;
    category: string;
    includeFlag: boolean;
  }>;
};

function includesNormalized(value: string | null | undefined, needle: string) {
  return safeLower(value).includes(needle);
}

function matchesBroadSearch(
  transaction: FinanceTransaction,
  normalizedSearch: string
) {
  return [
    transaction.description,
    transaction.normalizedMerchant,
    transaction.rawCategory,
    transaction.mappedCategory,
    transaction.account,
    transaction.tags,
    transaction.notes,
  ].some((value) => includesNormalized(value, normalizedSearch));
}

function compareStrings(left: string, right: string) {
  return safeLower(left).localeCompare(safeLower(right));
}

export function filterFinanceTransactions({
  transactions,
  filters,
}: {
  transactions: FinanceTransaction[];
  filters: FinanceTransactionQueryInput;
}) {
  const normalizedSearch = filters.search ? safeLower(filters.search) : null;
  const normalizedMerchant = filters.merchant
    ? safeLower(filters.merchant)
    : null;
  const normalizedDescription = filters.descriptionContains
    ? safeLower(filters.descriptionContains)
    : null;
  const normalizedRawCategory = filters.rawCategory
    ? safeLower(filters.rawCategory)
    : null;
  const normalizedCategory = filters.category
    ? safeLower(filters.category)
    : null;
  const normalizedAccount = filters.account ? safeLower(filters.account) : null;

  return transactions.filter((transaction) => {
    if (
      normalizedSearch &&
      !matchesBroadSearch(transaction, normalizedSearch)
    ) {
      return false;
    }

    if (
      normalizedMerchant &&
      !includesNormalized(transaction.normalizedMerchant, normalizedMerchant)
    ) {
      return false;
    }

    if (
      normalizedDescription &&
      !includesNormalized(transaction.description, normalizedDescription)
    ) {
      return false;
    }

    if (
      normalizedRawCategory &&
      safeLower(transaction.rawCategory) !== normalizedRawCategory
    ) {
      return false;
    }

    if (
      normalizedCategory &&
      safeLower(transaction.mappedCategory) !== normalizedCategory
    ) {
      return false;
    }

    if (
      normalizedAccount &&
      safeLower(transaction.account) !== normalizedAccount
    ) {
      return false;
    }

    if (
      typeof filters.includeFlag === "boolean" &&
      transaction.includeFlag !== filters.includeFlag
    ) {
      return false;
    }

    if (
      typeof filters.startDate === "string" &&
      transaction.transactionDate < filters.startDate
    ) {
      return false;
    }

    if (
      typeof filters.endDate === "string" &&
      transaction.transactionDate > filters.endDate
    ) {
      return false;
    }

    return true;
  });
}

export function queryFinanceTransactions({
  transactions,
  filters,
}: {
  transactions: FinanceTransaction[];
  filters: FinanceTransactionQueryInput;
}): FinanceTransactionQueryResult {
  const matchedTransactions = filterFinanceTransactions({
    transactions,
    filters,
  });

  const sortedTransactions = [...matchedTransactions].sort((left, right) => {
    let sortDelta = 0;

    switch (filters.sortBy) {
      case "amount":
        sortDelta = left.outflowAmount - right.outflowAmount;
        break;
      case "description":
        sortDelta = compareStrings(left.description, right.description);
        break;
      case "account":
        sortDelta = compareStrings(left.account, right.account);
        break;
      case "category":
        sortDelta = compareStrings(left.mappedCategory, right.mappedCategory);
        break;
      case "status":
        sortDelta = Number(left.includeFlag) - Number(right.includeFlag);
        break;
      default:
        sortDelta = left.transactionDate.localeCompare(right.transactionDate);
        break;
    }

    if (sortDelta !== 0) {
      return filters.sortDirection === "asc" ? sortDelta : -sortDelta;
    }

    const fallbackDateDelta = right.transactionDate.localeCompare(
      left.transactionDate
    );

    if (fallbackDateDelta !== 0) {
      return fallbackDateDelta;
    }

    const fallbackAmountDelta = right.outflowAmount - left.outflowAmount;

    if (fallbackAmountDelta !== 0) {
      return fallbackAmountDelta;
    }

    return left.id.localeCompare(right.id);
  });

  const totalPages =
    matchedTransactions.length === 0
      ? 1
      : Math.ceil(matchedTransactions.length / FINANCE_TRANSACTIONS_PAGE_SIZE);
  const page = Math.min(filters.page, totalPages);
  const pageStart = (page - 1) * FINANCE_TRANSACTIONS_PAGE_SIZE;
  const returnedTransactions = sortedTransactions.slice(
    pageStart,
    pageStart + FINANCE_TRANSACTIONS_PAGE_SIZE
  );
  const matchedIncludedCount = matchedTransactions.filter(
    (transaction) => transaction.includeFlag
  ).length;
  const startIndex = returnedTransactions.length === 0 ? 0 : pageStart + 1;
  const endIndex = pageStart + returnedTransactions.length;

  return {
    filters: {
      ...filters,
      page,
    },
    representation: filters.representation ?? "budget",
    matchedCount: matchedTransactions.length,
    returnedCount: returnedTransactions.length,
    totalMatchedOutflow: roundCurrency(
      matchedTransactions.reduce(
        (sum, transaction) => sum + transaction.outflowAmount,
        0
      )
    ),
    matchedIncludedCount,
    matchedExcludedCount: matchedTransactions.length - matchedIncludedCount,
    page,
    pageSize: FINANCE_TRANSACTIONS_PAGE_SIZE,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
    startIndex,
    endIndex,
    truncated: matchedTransactions.length > returnedTransactions.length,
    transactions: returnedTransactions.map((transaction) => ({
      id: transaction.id,
      transactionDate: transaction.transactionDate,
      description: transaction.description,
      merchant: transaction.normalizedMerchant,
      account: transaction.account,
      amount: transaction.outflowAmount,
      rawCategory: transaction.rawCategory,
      category: transaction.mappedCategory,
      includeFlag: transaction.includeFlag,
    })),
  };
}
