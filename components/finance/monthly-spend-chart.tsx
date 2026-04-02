"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { FinanceMonthlyChartPoint } from "@/lib/finance/types";

export function MonthlySpendChart({
  comparisonBudget,
  comparisonBudgetsByMonth,
  comparisonLabel,
  data,
  highlightedMonths,
  selectedMonth,
}: {
  comparisonBudget?: number;
  comparisonBudgetsByMonth?: Partial<Record<string, number | null>>;
  comparisonLabel?: string;
  data: FinanceMonthlyChartPoint[];
  highlightedMonths?: string[];
  selectedMonth?: string;
}) {
  const resolvedSelectedMonth = selectedMonth ?? data.at(-1)?.month ?? "";
  const resolvedComparisonLabel = comparisonLabel ?? "Target pace";
  const highlightedMonthSet = new Set(highlightedMonths ?? []);
  const chartData = data.map((entry) => ({
    ...entry,
    comparisonBudget:
      comparisonBudgetsByMonth?.[entry.month] ??
      comparisonBudget ??
      entry.target,
  }));

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Monthly spend trend</CardTitle>
        <CardDescription>
          Compare each month&apos;s spend against the{" "}
          {resolvedComparisonLabel.toLowerCase()}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" minTickGap={24} />
              <YAxis tickFormatter={(value) => `$${value}`} width={72} />
              <Tooltip
                formatter={(value, name) => [
                  value === null || value === undefined
                    ? "Not set"
                    : `$${Number(value).toLocaleString()}`,
                  name === "actual" ? "Actual spend" : resolvedComparisonLabel,
                ]}
              />
              <Legend />
              <Bar
                dataKey="actual"
                isAnimationActive={false}
                name="Actual spend"
                radius={6}
              >
                {chartData.map((entry) => (
                  <Cell
                    fill={
                      entry.month === resolvedSelectedMonth
                        ? "#0f766e"
                        : highlightedMonthSet.has(entry.month)
                          ? "#2dd4bf"
                          : "#cbd5e1"
                    }
                    key={entry.month}
                  />
                ))}
              </Bar>
              <Line
                dataKey="comparisonBudget"
                dot={false}
                isAnimationActive={false}
                name={resolvedComparisonLabel}
                stroke="#334155"
                strokeWidth={3}
                type="monotone"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
