import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  FinanceCategoryCard,
  FinancePlanSummary,
} from "@/lib/finance/types";
import { TransactionTable } from "./transaction-table";

export function CategoryDrilldown({
  categories,
  budgetBuckets,
}: {
  categories: FinanceCategoryCard[];
  budgetBuckets: FinancePlanSummary["bucketTargets"];
}) {
  const categoryByBucket = new Map<string, FinanceCategoryCard>(
    categories.map((category) => [category.bucket, category])
  );
  const visibleBuckets = budgetBuckets.slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories & budgets</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {visibleBuckets.length === 0 && (
          <div className="text-muted-foreground text-sm">
            No budget categories available yet.
          </div>
        )}
        {visibleBuckets.map((bucket) => {
          const category = categoryByBucket.get(bucket.bucket);
          const recentMonths = category?.monthly.slice(-4) ?? [];

          return (
            <details
              className="rounded-xl border bg-background p-3"
              key={bucket.bucket}
            >
              <summary className="cursor-pointer list-none">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{bucket.bucket}</div>
                    <div className="text-muted-foreground text-sm">
                      {bucket.group} | target $
                      {bucket.monthlyTarget.toLocaleString()}
                    </div>
                  </div>
                  <div className="grid gap-1 text-right text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs">
                        Trailing avg
                      </div>
                      <div className="font-semibold">
                        ${bucket.trailingAverage.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">
                        12-mo total
                      </div>
                      <div className="font-semibold">
                        ${bucket.trailingTotal.toLocaleString()}
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

                {category?.topMerchants.length ? (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {category.topMerchants.map((merchant) => (
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

                {category?.transactions.length ? (
                  <TransactionTable
                    transactions={category.transactions.slice(0, 12)}
                  />
                ) : (
                  <div className="text-muted-foreground text-sm">
                    No recent transactions available for this bucket yet.
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
