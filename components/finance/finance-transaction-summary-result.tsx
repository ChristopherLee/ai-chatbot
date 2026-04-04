"use client";

import { Badge } from "@/components/ui/badge";
import type { FinanceTransactionSummaryResult as FinanceTransactionSummaryResultData } from "@/lib/finance/summarize-transactions";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildFilterBadges(
  filters: FinanceTransactionSummaryResultData["filters"]
) {
  return [
    `Group by: ${filters.groupBy}`,
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
    filters.startDate ? `From: ${filters.startDate}` : null,
    filters.endDate ? `To: ${filters.endDate}` : null,
    filters.sortBy !== "totalOutflow" || filters.sortDirection !== "desc"
      ? `Sort: ${filters.sortBy} ${filters.sortDirection}`
      : null,
  ].filter((value): value is string => Boolean(value));
}

export function FinanceTransactionSummaryResult({
  result,
}: {
  result: FinanceTransactionSummaryResultData;
}) {
  const filterBadges = buildFilterBadges(result.filters);

  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          {result.matchedTransactionCount} matched
        </Badge>
        <Badge variant="secondary">
          {formatCurrency(result.totalMatchedOutflow)} outflow
        </Badge>
        <Badge variant="secondary">{result.totalGroupCount} groups</Badge>
        {result.truncated && (
          <Badge variant="outline">
            Showing {result.returnedGroupCount} of {result.totalGroupCount}
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

      {result.groups.length === 0 ? (
        <div className="text-muted-foreground">
          No transactions matched those filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted/70">
              <tr>
                <th className="px-3 py-2 font-medium">Group</th>
                <th className="px-3 py-2 font-medium">Count</th>
                <th className="px-3 py-2 font-medium">Outflow</th>
                <th className="px-3 py-2 font-medium">Average</th>
                <th className="px-3 py-2 font-medium">Share</th>
                <th className="px-3 py-2 font-medium">Date Range</th>
              </tr>
            </thead>
            <tbody>
              {result.groups.map((group) => (
                <tr className="border-t" key={group.key}>
                  <td className="px-3 py-2 font-medium">{group.label}</td>
                  <td className="px-3 py-2">{group.transactionCount}</td>
                  <td className="px-3 py-2">
                    {formatCurrency(group.totalOutflow)}
                  </td>
                  <td className="px-3 py-2">
                    {formatCurrency(group.averageOutflow)}
                  </td>
                  <td className="px-3 py-2">{group.sharePercentage}%</td>
                  <td className="px-3 py-2">
                    {group.firstTransactionDate === group.lastTransactionDate
                      ? group.lastTransactionDate
                      : `${group.firstTransactionDate} to ${group.lastTransactionDate}`}
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
