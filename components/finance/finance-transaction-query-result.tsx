"use client";

import { Badge } from "@/components/ui/badge";
import type { FinanceTransactionQueryResult as FinanceTransactionQueryResultData } from "@/lib/finance/query-transactions";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildFilterBadges(
  filters: FinanceTransactionQueryResultData["filters"]
) {
  return [
    filters.search ? `Search: ${filters.search}` : null,
    filters.merchant ? `Merchant: ${filters.merchant}` : null,
    filters.descriptionContains
      ? `Description: ${filters.descriptionContains}`
      : null,
    filters.rawCategory ? `Raw category: ${filters.rawCategory}` : null,
    filters.category ? `Category: ${filters.category}` : null,
    filters.account ? `Account: ${filters.account}` : null,
    typeof filters.includeFlag === "boolean"
      ? filters.includeFlag
        ? "Included only"
        : "Excluded only"
      : null,
    typeof filters.minAmount === "number"
      ? `Min amount: ${formatCurrency(filters.minAmount)}`
      : null,
    typeof filters.maxAmount === "number"
      ? `Max amount: ${formatCurrency(filters.maxAmount)}`
      : null,
    filters.startDate ? `From: ${filters.startDate}` : null,
    filters.endDate ? `To: ${filters.endDate}` : null,
    filters.sortBy !== "date" || filters.sortDirection !== "desc"
      ? `Sort: ${filters.sortBy} ${filters.sortDirection}`
      : null,
  ].filter((value): value is string => Boolean(value));
}

export function FinanceTransactionQueryResult({
  result,
}: {
  result: FinanceTransactionQueryResultData;
}) {
  const filterBadges = buildFilterBadges(result.filters);

  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{result.matchedCount} matched</Badge>
        <Badge variant="secondary">
          {formatCurrency(result.totalMatchedOutflow)} outflow
        </Badge>
        {result.truncated && (
          <Badge variant="outline">
            Showing {result.returnedCount} of {result.matchedCount}
          </Badge>
        )}
      </div>

      {filterBadges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filterBadges.map((filter) => (
            <Badge key={filter} variant="outline">
              {filter}
            </Badge>
          ))}
        </div>
      )}

      {result.transactions.length === 0 ? (
        <div className="text-muted-foreground">
          No transactions matched those filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted/70">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Included</th>
                <th className="px-3 py-2 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {result.transactions.map((transaction) => (
                <tr className="border-t" key={transaction.id}>
                  <td className="px-3 py-2">{transaction.transactionDate}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{transaction.description}</div>
                    <div className="text-muted-foreground text-xs">
                      {transaction.rawCategory} | {transaction.merchant}
                    </div>
                  </td>
                  <td className="px-3 py-2">{transaction.account}</td>
                  <td className="px-3 py-2">{transaction.category}</td>
                  <td className="px-3 py-2">
                    {transaction.includeFlag ? "Yes" : "No"}
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {formatCurrency(transaction.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
