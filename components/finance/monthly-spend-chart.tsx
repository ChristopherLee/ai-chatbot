"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinanceMonthlyChartPoint } from "@/lib/finance/types";

export function MonthlySpendChart({
  data,
}: {
  data: FinanceMonthlyChartPoint[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly actual vs target</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" minTickGap={24} />
              <YAxis tickFormatter={(value) => `$${value}`} width={72} />
              <Tooltip
                formatter={(value) => `$${Number(value ?? 0).toLocaleString()}`}
              />
              <Legend />
              <Bar
                dataKey="actual"
                fill="#0f766e"
                name="Actual spend"
                radius={6}
              />
              <Line
                dataKey="target"
                dot={false}
                name="Monthly target"
                stroke="#b45309"
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
