import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinancePlanSummary } from "@/lib/finance/types";

export function PlanSummary({
  planSummary,
}: {
  planSummary: FinancePlanSummary;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Plan summary</CardTitle>
          <Badge variant="secondary">{planSummary.mode}</Badge>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-muted/70 p-3">
            <div className="text-muted-foreground">Monthly target</div>
            <div className="font-semibold text-xl">
              ${planSummary.totalMonthlyTarget.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl bg-muted/70 p-3">
            <div className="text-muted-foreground">Trailing average spend</div>
            <div className="font-semibold text-xl">
              ${planSummary.trailingAverageSpend.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl bg-muted/70 p-3">
            <div className="text-muted-foreground">Fixed</div>
            <div className="font-semibold">
              ${planSummary.totalsByGroup.fixed.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl bg-muted/70 p-3">
            <div className="text-muted-foreground">Flexible + annual</div>
            <div className="font-semibold">
              $
              {(
                planSummary.totalsByGroup.flexible +
                planSummary.totalsByGroup.annual
              ).toLocaleString()}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
