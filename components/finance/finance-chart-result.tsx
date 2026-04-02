"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinanceChartToolResult } from "@/lib/finance/types";
import { CumulativePaceChart } from "./cumulative-pace-chart";
import { MonthlySpendChart } from "./monthly-spend-chart";

const PIE_COLORS = [
  "#0f766e",
  "#1d4ed8",
  "#b45309",
  "#be185d",
  "#4338ca",
  "#15803d",
  "#c2410c",
  "#0369a1",
  "#a16207",
  "#7c3aed",
  "#047857",
  "#dc2626",
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDelta(value: number) {
  const formatted = formatCurrency(Math.abs(value));
  return value > 0 ? `+${formatted}` : value < 0 ? `-${formatted}` : formatted;
}

function MonthOverMonthChart({
  data,
}: {
  data: Array<{
    bucket: string;
    currentMonth: number;
    previousMonth: number;
  }>;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="bucket" interval={0} minTickGap={16} />
          <YAxis tickFormatter={(value) => `$${value}`} width={72} />
          <Tooltip
            formatter={(value) => formatCurrency(Number(value ?? 0))}
            labelFormatter={(label) => String(label)}
          />
          <Bar
            dataKey="previousMonth"
            fill="#94a3b8"
            isAnimationActive={false}
            name="Previous month"
            radius={6}
          />
          <Bar
            dataKey="currentMonth"
            fill="#1d4ed8"
            isAnimationActive={false}
            name="Current month"
            radius={6}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SpendingBreakdownChart({
  data,
}: {
  data: Array<{
    bucket: string;
    amount: number;
    sharePercentage: number;
  }>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
      <div className="h-72 w-full">
        <ResponsiveContainer height="100%" width="100%">
          <PieChart>
            <Pie
              cx="50%"
              cy="50%"
              data={data}
              dataKey="amount"
              innerRadius={62}
              isAnimationActive={false}
              nameKey="bucket"
              outerRadius={104}
              paddingAngle={2}
            >
              {data.map((entry, index) => (
                <Cell
                  fill={PIE_COLORS[index % PIE_COLORS.length]}
                  key={`${entry.bucket}-${entry.amount}`}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => formatCurrency(Number(value ?? 0))}
              labelFormatter={(label) => String(label)}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-2">
        {data.map((bucket, index) => (
          <div
            className="rounded-lg border bg-background px-3 py-2"
            key={bucket.bucket}
          >
            <div className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={{
                  backgroundColor: PIE_COLORS[index % PIE_COLORS.length],
                }}
              />
              <span className="font-medium">{bucket.bucket}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-muted-foreground text-xs">
              <span>{formatCurrency(bucket.amount)}</span>
              <span>{bucket.sharePercentage.toFixed(1)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinanceChartResult({
  result,
}: {
  result: FinanceChartToolResult;
}) {
  if (result.status === "unavailable") {
    return (
      <div className="p-4 text-muted-foreground text-sm">{result.message}</div>
    );
  }

  const { chart } = result;

  if (chart.chartType === "monthly-spend") {
    return (
      <div className="space-y-4 p-4 text-sm">
        <div className="space-y-2">
          <div className="font-medium">{chart.title}</div>
          <div className="text-muted-foreground text-sm">
            {chart.description}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{chart.latestMonthLabel}</Badge>
            <Badge variant="secondary">
              Actual {formatCurrency(chart.summary.actual)}
            </Badge>
            <Badge variant="secondary">
              Target {formatCurrency(chart.summary.target)}
            </Badge>
            <Badge variant="outline">
              Delta {formatDelta(chart.summary.delta)}
            </Badge>
          </div>
        </div>
        <MonthlySpendChart data={chart.data} />
      </div>
    );
  }

  if (chart.chartType === "cumulative-spend") {
    return (
      <div className="space-y-4 p-4 text-sm">
        <div className="space-y-2">
          <div className="font-medium">{chart.title}</div>
          <div className="text-muted-foreground text-sm">
            {chart.description}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{chart.latestMonthLabel}</Badge>
            <Badge variant="secondary">
              Actual {formatCurrency(chart.summary.actualCumulative)}
            </Badge>
            <Badge variant="secondary">
              Pace {formatCurrency(chart.summary.paceCumulative)}
            </Badge>
            <Badge variant="outline">
              Variance {formatDelta(chart.summary.variance)}
            </Badge>
          </div>
        </div>
        <CumulativePaceChart data={chart.data} />
      </div>
    );
  }

  if (chart.chartType === "month-over-month") {
    return (
      <div className="space-y-4 p-4 text-sm">
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle>{chart.title}</CardTitle>
            <div className="text-muted-foreground text-sm">
              {chart.description}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{chart.currentMonthLabel}</Badge>
              <Badge variant="outline">{chart.previousMonthLabel}</Badge>
              <Badge variant="secondary">
                Current {formatCurrency(chart.totals.currentMonth)}
              </Badge>
              <Badge variant="secondary">
                Previous {formatCurrency(chart.totals.previousMonth)}
              </Badge>
              <Badge variant="outline">
                Delta {formatDelta(chart.totals.delta)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <MonthOverMonthChart data={chart.data} />
            {chart.truncated && (
              <div className="text-muted-foreground text-xs">
                Showing the top {chart.bucketLimit} of{" "}
                {chart.availableBucketCount} buckets.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 text-sm">
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>{chart.title}</CardTitle>
          <div className="text-muted-foreground text-sm">
            {chart.description}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{chart.monthLabel}</Badge>
            <Badge variant="secondary">
              Total {formatCurrency(chart.total)}
            </Badge>
            {chart.truncated && (
              <Badge variant="outline">
                Top {chart.bucketLimit} of {chart.availableBucketCount}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <SpendingBreakdownChart data={chart.data} />
        </CardContent>
      </Card>
    </div>
  );
}
