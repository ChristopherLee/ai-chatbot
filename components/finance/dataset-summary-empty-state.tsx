import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinanceSnapshot } from "@/lib/finance/types";

export function DatasetSummaryEmptyState({
  snapshot,
}: {
  snapshot: FinanceSnapshot;
}) {
  if (!snapshot.datasetSummary) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Dataset ready</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-muted-foreground">File</div>
            <div className="font-medium">
              {snapshot.datasetSummary.filename}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Date range</div>
            <div className="font-medium">
              {snapshot.datasetSummary.dateRange.start} to{" "}
              {snapshot.datasetSummary.dateRange.end}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Rows</div>
            <div className="font-medium">
              {snapshot.datasetSummary.totalTransactions}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Included outflow</div>
            <div className="font-medium">
              ${snapshot.datasetSummary.includedOutflow.toLocaleString()}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Next step</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Reply in the chat with your goals, priorities, and any special
            cases. I'll use that context once the finance plan is ready.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-muted px-2 py-1">
              "We want to save more this year."
            </span>
            <span className="rounded-full bg-muted px-2 py-1">
              "Exclude the refinance fee."
            </span>
            <span className="rounded-full bg-muted px-2 py-1">
              "Make this more conservative."
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top raw categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {snapshot.datasetSummary.rawCategories.slice(0, 8).map((category) => (
            <div
              className="flex items-center justify-between"
              key={category.name}
            >
              <span>{category.name}</span>
              <span className="text-muted-foreground">{category.count}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
