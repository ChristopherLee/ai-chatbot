import { z } from "zod";
import type { FinanceTransaction } from "./types";
import { roundCurrency, safeLower } from "./utils";

export const financeTransactionQueryInputSchema = z
  .object({
    search: z.string().trim().min(1).optional(),
    merchant: z.string().trim().min(1).optional(),
    descriptionContains: z.string().trim().min(1).optional(),
    rawCategory: z.string().trim().min(1).optional(),
    category: z.string().trim().min(1).optional(),
    account: z.string().trim().min(1).optional(),
    includeFlag: z.boolean().optional(),
    minAmount: z.number().finite().nonnegative().optional(),
    maxAmount: z.number().finite().nonnegative().optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    limit: z.number().int().min(1).max(100).default(25),
    sortBy: z.enum(["date", "amount"]).default("date"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine(
    (value) =>
      value.minAmount === undefined ||
      value.maxAmount === undefined ||
      value.minAmount <= value.maxAmount,
    {
      message: "minAmount must be less than or equal to maxAmount.",
      path: ["maxAmount"],
    }
  )
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

export type FinanceTransactionQueryResult = {
  filters: FinanceTransactionQueryInput;
  matchedCount: number;
  returnedCount: number;
  totalMatchedOutflow: number;
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

export function queryFinanceTransactions({
  transactions,
  filters,
}: {
  transactions: FinanceTransaction[];
  filters: FinanceTransactionQueryInput;
}): FinanceTransactionQueryResult {
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

  const matchedTransactions = transactions.filter((transaction) => {
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
      typeof filters.minAmount === "number" &&
      transaction.outflowAmount < filters.minAmount
    ) {
      return false;
    }

    if (
      typeof filters.maxAmount === "number" &&
      transaction.outflowAmount > filters.maxAmount
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

  const sortedTransactions = [...matchedTransactions].sort((left, right) => {
    if (filters.sortBy === "amount") {
      const amountDelta = left.outflowAmount - right.outflowAmount;

      if (amountDelta !== 0) {
        return filters.sortDirection === "asc" ? amountDelta : -amountDelta;
      }
    } else {
      const dateDelta = left.transactionDate.localeCompare(
        right.transactionDate
      );

      if (dateDelta !== 0) {
        return filters.sortDirection === "asc" ? dateDelta : -dateDelta;
      }
    }

    const fallbackDateDelta = left.transactionDate.localeCompare(
      right.transactionDate
    );

    if (fallbackDateDelta !== 0) {
      return filters.sortDirection === "asc"
        ? fallbackDateDelta
        : -fallbackDateDelta;
    }

    return filters.sortDirection === "asc"
      ? left.outflowAmount - right.outflowAmount
      : right.outflowAmount - left.outflowAmount;
  });

  const returnedTransactions = sortedTransactions.slice(0, filters.limit);

  return {
    filters,
    matchedCount: matchedTransactions.length,
    returnedCount: returnedTransactions.length,
    totalMatchedOutflow: roundCurrency(
      matchedTransactions.reduce(
        (sum, transaction) => sum + transaction.outflowAmount,
        0
      )
    ),
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

