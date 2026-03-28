import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  FinanceAppliedOverride,
  FinancePlanSummary,
} from "@/lib/finance/types";

export function PlanSummary({
  planSummary,
  appliedOverrides,
}: {
  planSummary: FinancePlanSummary;
  appliedOverrides: FinanceAppliedOverride[];
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

      <Card>
        <CardHeader>
          <CardTitle>Monthly budgets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {planSummary.bucketTargets.slice(0, 10).map((bucket) => (
            <div
              className="flex items-center justify-between gap-3"
              key={bucket.bucket}
            >
              <div>
                <div className="font-medium">{bucket.bucket}</div>
                <div className="text-muted-foreground">
                  {bucket.group} - trailing avg $
                  {bucket.trailingAverage.toLocaleString()}
                </div>
              </div>
              <div className="font-semibold">
                ${bucket.monthlyTarget.toLocaleString()}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {appliedOverrides.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Applied overrides</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm">
            {appliedOverrides.map((override) => (
              <Badge key={override.id} variant="outline">
                {override.summary}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
