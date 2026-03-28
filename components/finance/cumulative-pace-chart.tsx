"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinanceCumulativeChartPoint } from "@/lib/finance/types";

export function CumulativePaceChart({
  data,
}: {
  data: FinanceCumulativeChartPoint[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cumulative actual vs pace</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer height="100%" width="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" minTickGap={24} />
              <YAxis tickFormatter={(value) => `$${value}`} width={72} />
              <Tooltip
                formatter={(value) => `$${Number(value ?? 0).toLocaleString()}`}
              />
              <Legend />
              <Line
                dataKey="actualCumulative"
                dot={false}
                name="Actual cumulative"
                stroke="#1d4ed8"
                strokeWidth={3}
                type="monotone"
              />
              <Line
                dataKey="paceCumulative"
                dot={false}
                name="Target pace"
                stroke="#dc2626"
                strokeDasharray="6 4"
                strokeWidth={3}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
