import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinanceCategoryCard } from "@/lib/finance/types";
import { TransactionTable } from "./transaction-table";

export function CategoryDrilldown({
  categories,
}: {
  categories: FinanceCategoryCard[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {categories.slice(0, 8).map((category) => (
          <details
            className="rounded-xl border bg-background p-3"
            key={category.bucket}
          >
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{category.bucket}</div>
                  <div className="text-muted-foreground text-sm">
                    {category.group} · target $
                    {category.monthlyTarget.toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">
                    ${category.totalOutflow.toLocaleString()}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    trailing avg ${category.trailingAverage.toLocaleString()}
                  </div>
                </div>
              </div>
            </summary>

            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                {category.topMerchants.map((merchant) => (
                  <span
                    className="rounded-full bg-muted px-2 py-1"
                    key={merchant.merchant}
                  >
                    {merchant.merchant}: ${merchant.amount.toLocaleString()}
                  </span>
                ))}
              </div>

              <TransactionTable
                transactions={category.transactions.slice(0, 12)}
              />
            </div>
          </details>
        ))}
      </CardContent>
    </Card>
  );
}
