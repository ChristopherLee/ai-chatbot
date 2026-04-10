import { z } from "zod";
import { filterFinanceTransactions } from "./query-transactions";
import type { FinanceTransaction } from "./types";
import { getMonthLabel, roundCurrency, safeLower, toMonthKey } from "./utils";

export const financeTransactionSummaryInputSchema = z
  .object({
    representation: z
      .enum(["budget", "raw"])
      .default("budget")
      .optional(),
    groupBy: z.enum([
      "month",
      "category",
      "raw-category",
      "merchant",
      "account",
    ]),
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
    limit: z.number().int().min(1).max(50).default(12),
    sortBy: z
      .enum(["totalOutflow", "transactionCount", "averageOutflow", "label"])
      .default("totalOutflow"),
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

export type FinanceTransactionSummaryInput = z.infer<
  typeof financeTransactionSummaryInputSchema
>;

export type FinanceTransactionSummaryResult = {
  filters: FinanceTransactionSummaryInput;
  representation: "budget" | "raw";
  matchedTransactionCount: number;
  totalMatchedOutflow: number;
  totalGroupCount: number;
  returnedGroupCount: number;
  truncated: boolean;
  groups: Array<{
    key: string;
    label: string;
    transactionCount: number;
    totalOutflow: number;
    averageOutflow: number;
    sharePercentage: number;
    firstTransactionDate: string;
    lastTransactionDate: string;
  }>;
};

function buildGroupLabel({
  groupBy,
  transaction,
}: {
  groupBy: FinanceTransactionSummaryInput["groupBy"];
  transaction: FinanceTransaction;
}) {
  switch (groupBy) {
    case "month": {
      const month = toMonthKey(transaction.transactionDate);

      return {
        key: month,
        label: getMonthLabel(month),
      };
    }
    case "category":
      return {
        key: safeLower(transaction.mappedCategory),
        label: transaction.mappedCategory,
      };
    case "raw-category":
      return {
        key: safeLower(transaction.rawCategory),
        label: transaction.rawCategory,
      };
    case "merchant":
      return {
        key: safeLower(transaction.normalizedMerchant),
        label: transaction.normalizedMerchant,
      };
    case "account":
      return {
        key: safeLower(transaction.account),
        label: transaction.account,
      };
    default:
      return {
        key: "unknown",
        label: "Unknown",
      };
  }
}

export function summarizeFinanceTransactions({
  transactions,
  filters,
}: {
  transactions: FinanceTransaction[];
  filters: FinanceTransactionSummaryInput;
}): FinanceTransactionSummaryResult {
  const matchedTransactions = filterFinanceTransactions({
    transactions,
    filters: {
      search: filters.search,
      merchant: filters.merchant,
      descriptionContains: filters.descriptionContains,
      rawCategory: filters.rawCategory,
      category: filters.category,
      account: filters.account,
      includeFlag: filters.includeFlag,
      startDate: filters.startDate,
      endDate: filters.endDate,
      page: 1,
      sortBy: "date",
      sortDirection: "desc",
    },
  });
  const totalMatchedOutflow = roundCurrency(
    matchedTransactions.reduce(
      (sum, transaction) => sum + transaction.outflowAmount,
      0
    )
  );
  const groupsByKey = new Map<
    string,
    {
      key: string;
      label: string;
      transactionCount: number;
      totalOutflow: number;
      firstTransactionDate: string;
      lastTransactionDate: string;
    }
  >();

  for (const transaction of matchedTransactions) {
    const { key, label } = buildGroupLabel({
      groupBy: filters.groupBy,
      transaction,
    });
    const current = groupsByKey.get(key);

    if (current) {
      current.transactionCount += 1;
      current.totalOutflow = roundCurrency(
        current.totalOutflow + transaction.outflowAmount
      );
      current.firstTransactionDate =
        transaction.transactionDate < current.firstTransactionDate
          ? transaction.transactionDate
          : current.firstTransactionDate;
      current.lastTransactionDate =
        transaction.transactionDate > current.lastTransactionDate
          ? transaction.transactionDate
          : current.lastTransactionDate;
      continue;
    }

    groupsByKey.set(key, {
      key,
      label,
      transactionCount: 1,
      totalOutflow: roundCurrency(transaction.outflowAmount),
      firstTransactionDate: transaction.transactionDate,
      lastTransactionDate: transaction.transactionDate,
    });
  }

  const sortedGroups = [...groupsByKey.values()].sort((left, right) => {
    let sortDelta = 0;

    switch (filters.sortBy) {
      case "transactionCount":
        sortDelta = left.transactionCount - right.transactionCount;
        break;
      case "averageOutflow":
        sortDelta =
          left.totalOutflow / left.transactionCount -
          right.totalOutflow / right.transactionCount;
        break;
      case "label":
        sortDelta = safeLower(left.label).localeCompare(safeLower(right.label));
        break;
      default:
        sortDelta = left.totalOutflow - right.totalOutflow;
        break;
    }

    if (sortDelta !== 0) {
      return filters.sortDirection === "asc" ? sortDelta : -sortDelta;
    }

    return safeLower(left.label).localeCompare(safeLower(right.label));
  });
  const returnedGroups = sortedGroups.slice(0, filters.limit);

  return {
    filters,
    representation: filters.representation ?? "budget",
    matchedTransactionCount: matchedTransactions.length,
    totalMatchedOutflow,
    totalGroupCount: sortedGroups.length,
    returnedGroupCount: returnedGroups.length,
    truncated: sortedGroups.length > returnedGroups.length,
    groups: returnedGroups.map((group) => ({
      ...group,
      averageOutflow: roundCurrency(group.totalOutflow / group.transactionCount),
      sharePercentage:
        totalMatchedOutflow <= 0
          ? 0
          : roundCurrency((group.totalOutflow / totalMatchedOutflow) * 100),
    })),
  };
}
