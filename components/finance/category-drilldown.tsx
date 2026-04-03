import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FINANCE_RECOMMENDATION_LOOKBACK_MONTHS } from "@/lib/finance/config";
import type {
  FinanceCategoryCard,
  FinancePlanSummary,
} from "@/lib/finance/types";
import { TransactionTable } from "./transaction-table";

export function CategoryDrilldown({
  categories,
  budgetCategories,
}: {
  categories: FinanceCategoryCard[];
  budgetCategories: FinancePlanSummary["categoryTargets"];
}) {
  const categoryByCategory = new Map<string, FinanceCategoryCard>(
    categories.map((category) => [category.category, category])
  );
  const visibleCategories = budgetCategories.slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories & budgets</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {visibleCategories.length === 0 && (
          <div className="text-muted-foreground text-sm">
            No budget categories available yet.
          </div>
        )}
        {visibleCategories.map((category) => {
          const categoryCard = categoryByCategory.get(category.category);
          const recentMonths = categoryCard?.monthly.slice(-4) ?? [];

          return (
            <details
              className="rounded-xl border bg-background p-3"
              key={category.category}
            >
              <summary className="cursor-pointer list-none">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{category.category}</div>
                    <div className="text-muted-foreground text-sm">
                      {category.group} | target $
                      {category.monthlyTarget.toLocaleString()}
                    </div>
                  </div>
                  <div className="grid gap-1 text-right text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs">
                        {FINANCE_RECOMMENDATION_LOOKBACK_MONTHS}-mo avg
                      </div>
                      <div className="font-semibold">
                        ${category.trailingAverage.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">
                        {FINANCE_RECOMMENDATION_LOOKBACK_MONTHS}-mo total
                      </div>
                      <div className="font-semibold">
                        ${category.trailingTotal.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </summary>

              <div className="mt-4 space-y-4">
                {recentMonths.length > 0 && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {recentMonths.map((month) => (
                      <span
                        className="rounded-full bg-muted px-2 py-1"
                        key={month.month}
                      >
                        {month.label}: ${month.actual.toLocaleString()} / $
                        {month.target.toLocaleString()}
                      </span>
                    ))}
                  </div>
                )}

                {categoryCard?.topMerchants.length ? (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {categoryCard?.topMerchants.map((merchant) => (
                      <span
                        className="rounded-full bg-muted px-2 py-1"
                        key={merchant.merchant}
                      >
                        {merchant.merchant}: $
                        {merchant.amount.toLocaleString()}
                      </span>
                    ))}
                  </div>
                ) : null}

                {categoryCard?.transactions.length ? (
                  <TransactionTable
                    transactions={categoryCard.transactions.slice(0, 12)}
                  />
                ) : (
                  <div className="text-muted-foreground text-sm">
                    No recent transactions available for this category yet.
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </CardContent>
    </Card>
  );
}

