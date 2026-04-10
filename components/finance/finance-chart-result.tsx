"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sankey,
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

const FLOW_GROUP_COLORS: Record<string, string> = {
  fixed: "#0f766e",
  flexible: "#1d4ed8",
  annual: "#b45309",
  excluded: "#64748b",
};

const NO_DATA_LABEL = "-";

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

function getIncomeBasisLabel(
  basis: "historical-average" | "income-target" | "observed"
) {
  if (basis === "income-target") {
    return "Income target";
  }

  if (basis === "historical-average") {
    return "Historical avg income";
  }

  return "Observed income";
}

function getFlowNodeColor(node: {
  group?: string;
  kind?: "category" | "income" | "leftover" | "supplemental";
}) {
  if (node.kind === "income") {
    return "#0f766e";
  }

  if (node.kind === "supplemental") {
    return "#c2410c";
  }

  if (node.kind === "leftover") {
    return "#475569";
  }

  return FLOW_GROUP_COLORS[node.group ?? ""] ?? "#1d4ed8";
}

function SankeyTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: unknown }>;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0]?.payload as
    | {
        amount?: number;
        kind?: string;
        name?: string;
        source?: { name?: string };
        target?: { name?: string };
        value?: number;
      }
    | undefined;

  if (!item) {
    return null;
  }

  const title =
    item.source && item.target
      ? `${item.source.name ?? "Source"} -> ${item.target.name ?? "Target"}`
      : (item.name ?? "Flow");
  const amount = Number(item.value ?? item.amount ?? 0);

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/95 px-3 py-2 text-slate-50 shadow-2xl">
      <div className="font-medium text-sm">{title}</div>
      <div className="mt-1 text-slate-300 text-xs">
        {formatCurrency(amount)}
      </div>
    </div>
  );
}

function IncomeExpenseSankeyNode({
  height,
  payload,
  width,
  x,
  y,
}: {
  height: number;
  payload: {
    amount?: number;
    depth?: number;
    group?: string;
    kind?: "category" | "income" | "leftover" | "supplemental";
    name?: string;
    value?: number;
  };
  width: number;
  x: number;
  y: number;
}) {
  const isSource = (payload.depth ?? 0) === 0;
  const labelX = isSource ? x + width + 8 : x - 8;
  const labelAnchor = isSource ? "start" : "end";
  const nodeAmount = Number(payload.value ?? payload.amount ?? 0);

  return (
    <g>
      <rect
        fill={getFlowNodeColor(payload)}
        fillOpacity={0.96}
        height={height}
        rx={4}
        ry={4}
        width={width}
        x={x}
        y={y}
      />
      <text
        dominantBaseline="middle"
        fill="#e2e8f0"
        fontSize={12}
        textAnchor={labelAnchor}
        x={labelX}
        y={y + height / 2 - 7}
      >
        {payload.name ?? "Flow"}
      </text>
      <text
        dominantBaseline="middle"
        fill="#94a3b8"
        fontSize={11}
        textAnchor={labelAnchor}
        x={labelX}
        y={y + height / 2 + 9}
      >
        {formatCurrency(nodeAmount)}
      </text>
    </g>
  );
}

function FlowSummaryColumn({
  items,
  title,
}: {
  items: Array<{
    amount: number;
    group?: string;
    kind: "category" | "income" | "leftover" | "supplemental";
    name: string;
  }>;
  title: string;
}) {
  return (
    <div className="rounded-xl border bg-background/60 p-3">
      <div className="font-medium text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {title}
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div
            className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2"
            key={`${title}-${item.name}`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: getFlowNodeColor(item) }}
              />
              <span className="truncate font-medium text-sm">{item.name}</span>
            </div>
            <span className="shrink-0 text-muted-foreground text-xs">
              {formatCurrency(item.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthOverMonthChart({
  data,
}: {
  data: Array<{
    category: string;
    currentMonth: number;
    previousMonth: number;
  }>;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="category" interval={0} minTickGap={16} />
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
    category: string;
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
              nameKey="category"
              outerRadius={104}
              paddingAngle={2}
            >
              {data.map((entry, index) => (
                <Cell
                  fill={PIE_COLORS[index % PIE_COLORS.length]}
                  key={`${entry.category}-${entry.amount}`}
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
        {data.map((category, index) => (
          <div
            className="rounded-lg border bg-background px-3 py-2"
            key={category.category}
          >
            <div className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={{
                  backgroundColor: PIE_COLORS[index % PIE_COLORS.length],
                }}
              />
              <span className="font-medium">{category.category}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-muted-foreground text-xs">
              <span>{formatCurrency(category.amount)}</span>
              <span>{category.sharePercentage.toFixed(1)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CashFlowTrendChart({
  data,
}: {
  data: Array<{
    label: string;
    actualCashBalance: number;
    projectedCashBalance: number;
  }>;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" minTickGap={20} />
          <YAxis tickFormatter={(value) => `$${value}`} width={86} />
          <Tooltip
            formatter={(value) => formatCurrency(Number(value ?? 0))}
            labelFormatter={(label) => String(label)}
          />
          <Line
            dataKey="actualCashBalance"
            dot={false}
            isAnimationActive={false}
            name="Actual cash balance"
            stroke="#1d4ed8"
            strokeWidth={2.5}
            type="monotone"
          />
          <Line
            dataKey="projectedCashBalance"
            dot={false}
            isAnimationActive={false}
            name="Projected cash balance"
            stroke="#0f766e"
            strokeDasharray="6 4"
            strokeWidth={2.5}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CashFlowTrendTable({
  data,
  monthlyBreakdown,
  storageKey,
}: {
  data: Array<{
    label: string;
    month: string;
    actualIncome: number;
    actualExpenses: number;
    actualNet: number;
    actualCashBalance: number;
    projectedIncome: number;
    projectedExpenses: number;
    projectedNet: number;
    projectedCashBalance: number;
    isProjected: boolean;
  }>;
  monthlyBreakdown: Array<{
    month: string;
    categories: Array<{
      category: string;
      group: string;
      actual: number;
      projected: number;
    }>;
  }>;
  storageKey: string;
}) {
  const [overrides, setOverrides] = useState<
    Record<string, { projectedIncome: number; projectedExpenses: number }>
  >({});

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(storageKey);
      if (!storedValue) {
        return;
      }

      const parsed = JSON.parse(storedValue) as Record<
        string,
        { projectedIncome?: unknown; projectedExpenses?: unknown }
      >;
      const safeEntries = Object.entries(parsed).flatMap(([month, value]) => {
        const projectedIncome = Number(value.projectedIncome);
        const projectedExpenses = Number(value.projectedExpenses);

        if (
          !Number.isFinite(projectedIncome) ||
          !Number.isFinite(projectedExpenses)
        ) {
          return [];
        }

        return [[month, { projectedIncome, projectedExpenses }] as const];
      });

      setOverrides(Object.fromEntries(safeEntries));
    } catch {
      setOverrides({});
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(overrides));
    } catch {
      // Ignore localStorage write errors (private mode / quota).
    }
  }, [overrides, storageKey]);
  const breakdownByMonth = useMemo(
    () => new Map(monthlyBreakdown.map((entry) => [entry.month, entry])),
    [monthlyBreakdown]
  );

  const rows = useMemo(() => {
    let projectedCashBalance = 0;

    return data.map((row) => {
      const monthOverride = overrides[row.month];
      const projectedIncome =
        monthOverride?.projectedIncome ?? row.projectedIncome;
      const projectedExpenses =
        monthOverride?.projectedExpenses ?? row.projectedExpenses;
      const projectedNet = projectedIncome - projectedExpenses;
      projectedCashBalance += projectedNet;

      return {
        ...row,
        projectedIncome,
        projectedExpenses,
        projectedNet,
        projectedCashBalance,
      };
    });
  }, [data, overrides]);

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="px-3 py-2 text-left font-medium" rowSpan={2}>
              Month
            </th>
            <th className="px-3 py-2 text-center font-medium" colSpan={4}>
              Actual
            </th>
            <th className="px-3 py-2 text-center font-medium" colSpan={4}>
              Plan
            </th>
            <th className="px-3 py-2 text-left font-medium" rowSpan={2}>
              Details
            </th>
          </tr>
          <tr>
            <th className="px-3 py-2 text-right font-medium">Income</th>
            <th className="px-3 py-2 text-right font-medium">Expenses</th>
            <th className="px-3 py-2 text-right font-medium">Cash flow</th>
            <th className="px-3 py-2 text-right font-medium">Cash balance</th>
            <th className="px-3 py-2 text-right font-medium">Income</th>
            <th className="px-3 py-2 text-right font-medium">Expenses</th>
            <th className="px-3 py-2 text-right font-medium">Cash flow</th>
            <th className="px-3 py-2 text-right font-medium">Cash balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {rows.map((row) => {
            const hasActualData =
              row.actualIncome > 0 || row.actualExpenses > 0;

            return (
              <tr className="bg-background/40" key={row.month}>
                <td className="px-3 py-2 font-medium">{row.label}</td>
                <td className="px-3 py-2 text-right">
                  {hasActualData
                    ? formatCurrency(row.actualIncome)
                    : NO_DATA_LABEL}
                </td>
                <td className="px-3 py-2 text-right">
                  {hasActualData
                    ? formatCurrency(row.actualExpenses)
                    : NO_DATA_LABEL}
                </td>
                <td className="px-3 py-2 text-right">
                  {hasActualData ? formatDelta(row.actualNet) : NO_DATA_LABEL}
                </td>
                <td className="px-3 py-2 text-right">
                  {hasActualData
                    ? formatCurrency(row.actualCashBalance)
                    : NO_DATA_LABEL}
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    className="w-28 rounded border bg-background px-2 py-1 text-right"
                    inputMode="decimal"
                    onChange={(event) => {
                      const nextValue = Number(event.target.value || 0);
                      setOverrides((current) => ({
                        ...current,
                        [row.month]: {
                          projectedIncome: Number.isFinite(nextValue)
                            ? nextValue
                            : 0,
                          projectedExpenses:
                            current[row.month]?.projectedExpenses ??
                            row.projectedExpenses,
                        },
                      }));
                    }}
                    value={Math.round(row.projectedIncome)}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    className="w-28 rounded border bg-background px-2 py-1 text-right"
                    inputMode="decimal"
                    onChange={(event) => {
                      const nextValue = Number(event.target.value || 0);
                      setOverrides((current) => ({
                        ...current,
                        [row.month]: {
                          projectedIncome:
                            current[row.month]?.projectedIncome ??
                            row.projectedIncome,
                          projectedExpenses: Number.isFinite(nextValue)
                            ? nextValue
                            : 0,
                        },
                      }));
                    }}
                    value={Math.round(row.projectedExpenses)}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  {formatDelta(row.projectedNet)}
                </td>
                <td className="px-3 py-2 text-right">
                  {formatCurrency(row.projectedCashBalance)}
                </td>
                <td className="px-3 py-2">
                  <details>
                    <summary className="cursor-pointer text-muted-foreground text-xs">
                      Category breakdown
                    </summary>
                    <div className="mt-2 space-y-1">
                      {(breakdownByMonth.get(row.month)?.categories ?? [])
                        .slice(0, 8)
                        .map((category) => (
                          <div
                            className="flex items-center justify-between gap-2 text-xs"
                            key={`${row.month}-${category.category}`}
                          >
                            <span className="truncate">
                              {category.category}
                            </span>
                            <span className="text-muted-foreground">
                              {row.isProjected
                                ? formatCurrency(category.projected)
                                : `${formatCurrency(category.actual)} / ${formatCurrency(category.projected)}`}
                            </span>
                          </div>
                        ))}
                    </div>
                  </details>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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

  if (chart.chartType === "cash-flow-trend") {
    return (
      <div className="space-y-4 p-4 text-sm">
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle>{chart.title}</CardTitle>
            <div className="text-muted-foreground text-sm">
              {chart.description}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{chart.latestMonthLabel}</Badge>
              <Badge variant="secondary">
                Actual net {formatDelta(chart.summary.actualNet)}
              </Badge>
              <Badge variant="secondary">
                Projected net {formatDelta(chart.summary.projectedNet)}
              </Badge>
              <Badge variant="outline">
                Actual balance {formatCurrency(chart.summary.actualCashBalance)}
              </Badge>
              <Badge variant="outline">
                Projected {chart.projectionMonths}mo{" "}
                {formatCurrency(chart.summary.projectedCashBalance)}
              </Badge>
            </div>
            <div className="text-muted-foreground text-xs">
              Projection uses{" "}
              {chart.assumptions.projectedIncomeBasis === "income-target"
                ? "saved income target"
                : "historical average income"}{" "}
              and{" "}
              {chart.assumptions.projectedExpenseBasis === "budget-target"
                ? "saved budget target"
                : "historical average spend"}
              .
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <CashFlowTrendChart data={chart.data} />
              <CashFlowTrendTable
                data={chart.data}
                monthlyBreakdown={chart.monthlyBreakdown}
                storageKey={`finance-cashflow-overrides:${chart.latestMonth}`}
              />
            </div>
          </CardContent>
        </Card>
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
                Showing the top {chart.categoryLimit} of{" "}
                {chart.availableCategoryCount} categories.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (chart.chartType === "income-to-expenses") {
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
                {getIncomeBasisLabel(chart.incomeBasis)}
              </Badge>
              <Badge variant="secondary">
                Income {formatCurrency(chart.totals.income)}
              </Badge>
              <Badge variant="secondary">
                Expenses {formatCurrency(chart.totals.expenses)}
              </Badge>
              {chart.totals.leftover > 0 ? (
                <Badge variant="outline">
                  Left over {formatCurrency(chart.totals.leftover)}
                </Badge>
              ) : null}
              {chart.totals.supplemental > 0 ? (
                <Badge variant="outline">
                  Supplemental {formatCurrency(chart.totals.supplemental)}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-96 w-full">
              <ResponsiveContainer height="100%" width="100%">
                <Sankey
                  align="justify"
                  data={{
                    links: chart.links,
                    nodes: chart.nodes,
                  }}
                  dataKey="value"
                  link={{
                    fill: "none",
                    stroke: "rgba(148, 163, 184, 0.28)",
                    strokeOpacity: 0.35,
                  }}
                  margin={{ bottom: 20, left: 112, right: 112, top: 20 }}
                  nameKey="name"
                  node={IncomeExpenseSankeyNode}
                  nodePadding={18}
                  nodeWidth={14}
                  sort={false}
                >
                  <Tooltip content={<SankeyTooltipContent />} />
                </Sankey>
              </ResponsiveContainer>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <FlowSummaryColumn items={chart.sources} title="Sources" />
              <FlowSummaryColumn
                items={chart.destinations}
                title="Destinations"
              />
            </div>

            {chart.truncatedSources || chart.truncatedCategories ? (
              <div className="text-muted-foreground text-xs">
                {chart.truncatedSources
                  ? `Smaller income sources are grouped into Other income after the top ${chart.sourceLimit}. `
                  : ""}
                {chart.truncatedCategories
                  ? `Smaller expense categories are grouped into Other expenses after the top ${chart.categoryLimit}.`
                  : ""}
              </div>
            ) : null}
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
                Top {chart.categoryLimit} of {chart.availableCategoryCount}
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
