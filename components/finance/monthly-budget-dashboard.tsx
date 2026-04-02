"use client";

import { ArrowDownRight, ArrowUpRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  buildFinanceDashboardViewModel,
  type FinanceDashboardAnalysisChart,
  type FinanceDashboardAnalysisRow,
  type FinanceDashboardLookbackWindow,
  type FinanceDashboardMover,
  type FinanceDashboardOverviewFilter,
  type FinanceDashboardOverviewRow,
  type FinanceDashboardRowStatus,
  type FinanceDashboardShareRow,
  type FinanceDashboardTransactionItem,
  type FinanceDashboardView,
  rowMatchesOverviewFilter,
} from "@/lib/finance/dashboard";
import type {
  FinanceSnapshot,
  FinanceTargetsResponse,
} from "@/lib/finance/types";
import { cn } from "@/lib/utils";
import { CumulativePaceChart } from "./cumulative-pace-chart";
import { MonthlySpendChart } from "./monthly-spend-chart";
import { TransactionTable } from "./transaction-table";

type SegmentedOption<T extends string | number> = {
  label: string;
  value: T;
};

const VIEW_OPTIONS: SegmentedOption<FinanceDashboardView>[] = [
  { label: "Overview", value: "overview" },
  { label: "Analysis", value: "analysis" },
];

const OVERVIEW_FILTER_OPTIONS: SegmentedOption<FinanceDashboardOverviewFilter>[] =
  [
    { label: "All", value: "all" },
    { label: "Needs attention", value: "needs-attention" },
    { label: "On track", value: "on-track" },
    { label: "Unbudgeted", value: "unbudgeted" },
  ];

const LOOKBACK_OPTIONS: SegmentedOption<FinanceDashboardLookbackWindow>[] = [
  { label: "1 month", value: 1 },
  { label: "6 months", value: 6 },
  { label: "12 months", value: 12 },
];

const ANALYSIS_CHART_OPTIONS: SegmentedOption<FinanceDashboardAnalysisChart>[] =
  [
    { label: "Cumulative pace", value: "cumulative" },
    { label: "Monthly trend", value: "monthly" },
  ];

function formatCurrency(value: number | null) {
  if (value === null) {
    return "Not set";
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    style: "currency",
  }).format(value);
}

function formatSignedCurrency(value: number | null) {
  if (value === null) {
    return "Not set";
  }

  if (Math.abs(value) < 0.01) {
    return "$0";
  }

  const formatted = formatCurrency(Math.abs(value));
  return value > 0 ? `+${formatted}` : `-${formatted}`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatMonthCount(value: number) {
  return `${value} ${value === 1 ? "month" : "months"}`;
}

function getStatusLabel(status: FinanceDashboardRowStatus) {
  if (status === "over") {
    return "Over budget";
  }

  if (status === "near") {
    return "Close to limit";
  }

  if (status === "unbudgeted") {
    return "Unbudgeted";
  }

  if (status === "no-budget") {
    return "No budget";
  }

  return "On track";
}

function getStatusStyles(status: FinanceDashboardRowStatus) {
  if (status === "over") {
    return {
      badge: "border-rose-400/20 bg-rose-500/10 text-rose-200",
      dot: "bg-rose-400",
      progress: "bg-rose-400",
      row: "border-rose-400/15 hover:border-rose-400/30 hover:bg-rose-500/5",
      text: "text-rose-200",
    };
  }

  if (status === "near") {
    return {
      badge: "border-amber-400/20 bg-amber-500/10 text-amber-100",
      dot: "bg-amber-400",
      progress: "bg-amber-400",
      row: "border-amber-400/15 hover:border-amber-400/30 hover:bg-amber-500/5",
      text: "text-amber-100",
    };
  }

  if (status === "unbudgeted") {
    return {
      badge: "border-slate-400/20 bg-slate-500/10 text-slate-200",
      dot: "bg-slate-300",
      progress: "bg-slate-300",
      row: "border-slate-400/15 hover:border-slate-300/30 hover:bg-white/5",
      text: "text-slate-100",
    };
  }

  if (status === "no-budget") {
    return {
      badge: "border-slate-500/20 bg-slate-500/5 text-slate-300",
      dot: "bg-slate-500",
      progress: "bg-slate-500",
      row: "border-white/10 hover:border-white/20 hover:bg-white/5",
      text: "text-slate-200",
    };
  }

  return {
    badge: "border-emerald-400/20 bg-emerald-500/10 text-emerald-100",
    dot: "bg-emerald-400",
    progress: "bg-emerald-400",
    row: "border-emerald-400/10 hover:border-emerald-400/25 hover:bg-emerald-500/5",
    text: "text-emerald-100",
  };
}

function getMoverAccent(delta: number) {
  return delta >= 0
    ? "border-rose-400/20 bg-rose-500/10 text-rose-200"
    : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
}

function SegmentedControl<T extends string | number>({
  ariaLabel,
  className,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  className?: string;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  value: T;
}) {
  return (
    <fieldset
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1",
        className
      )}
    >
      <legend className="sr-only">{ariaLabel}</legend>
      {options.map((option) => {
        const isSelected = option.value === value;

        return (
          <button
            aria-pressed={isSelected}
            className={cn(
              "rounded-full px-3 py-1.5 font-medium text-sm transition-colors",
              isSelected
                ? "bg-white text-slate-950"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            )}
            key={String(option.value)}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}

function InlineProgress({
  className,
  colorClassName,
  value,
}: {
  className?: string;
  colorClassName: string;
  value: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "h-1.5 overflow-hidden rounded-full bg-white/10",
        className
      )}
    >
      <div
        className={cn("h-full rounded-full transition-all", colorClassName)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
        {label}
      </div>
      <div className="mt-2 font-semibold text-2xl text-white">{value}</div>
    </div>
  );
}

function BudgetGauge({
  budget,
  spent,
  status,
  value,
}: {
  budget: number | null;
  spent: number;
  status: FinanceDashboardRowStatus;
  value: number;
}) {
  const styles = getStatusStyles(status);
  const fill =
    status === "over"
      ? "#fb7185"
      : status === "near"
        ? "#fbbf24"
        : status === "under"
          ? "#34d399"
          : "#94a3b8";

  return (
    <div className="relative h-64 w-full">
      <ResponsiveContainer height="100%" width="100%">
        <RadialBarChart
          barSize={18}
          cx="50%"
          cy="60%"
          data={[{ fill, value: Math.max(0, Math.min(100, value)) }]}
          endAngle={-30}
          innerRadius="66%"
          outerRadius="100%"
          startAngle={210}
        >
          <PolarAngleAxis domain={[0, 100]} tick={false} type="number" />
          <RadialBar
            background={{ fill: "rgba(148, 163, 184, 0.16)" }}
            cornerRadius={999}
            dataKey="value"
            isAnimationActive={false}
          />
        </RadialBarChart>
      </ResponsiveContainer>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-8 text-center">
        <div className={cn("font-medium text-sm", styles.text)}>
          {formatPercent(value)}
        </div>
        <div className="mt-1 font-semibold text-4xl text-white">
          {formatCurrency(spent)}
        </div>
        <div className="mt-1 text-slate-400 text-sm">
          {budget === null
            ? "Budget not set"
            : `${formatCurrency(budget)} budget`}
        </div>
      </div>
    </div>
  );
}

function TrendSparkline({
  data,
  status,
}: {
  data: Array<{ actual: number; label: string; month: string }>;
  status: FinanceDashboardRowStatus;
}) {
  const stroke =
    status === "over"
      ? "#fb7185"
      : status === "near"
        ? "#fbbf24"
        : status === "under"
          ? "#34d399"
          : "#94a3b8";

  return (
    <div aria-hidden="true" className="h-12 w-24">
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={data}>
          <Line
            dataKey="actual"
            dot={false}
            isAnimationActive={false}
            stroke={stroke}
            strokeWidth={2.5}
            type="monotone"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#020617",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "16px",
              color: "#e2e8f0",
            }}
            formatter={(value) => formatCurrency(Number(value))}
            labelFormatter={(label) => label}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SpendShareChart({ rows }: { rows: FinanceDashboardShareRow[] }) {
  return (
    <Card className="border-white/10 bg-slate-950/60 text-slate-50">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl text-white">Spend share</CardTitle>
        <CardDescription className="text-slate-400">
          See which categories dominate the selected lookback.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-slate-400 text-sm">
            No spending landed in this window yet.
          </div>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ left: 8, right: 16, top: 8 }}
              >
                <CartesianGrid stroke="rgba(148, 163, 184, 0.16)" />
                <XAxis hide type="number" />
                <YAxis
                  dataKey="label"
                  tick={{ fill: "#cbd5e1", fontSize: 12 }}
                  type="category"
                  width={88}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#020617",
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    borderRadius: "16px",
                    color: "#e2e8f0",
                  }}
                  formatter={(value, name, item) => [
                    name === "amount"
                      ? formatCurrency(Number(value))
                      : `${Number(value).toFixed(1)}%`,
                    name === "amount"
                      ? "Total spent"
                      : `${item.payload.label} share`,
                  ]}
                />
                <Bar dataKey="amount" isAnimationActive={false} radius={999}>
                  {rows.map((row) => (
                    <Cell
                      fill={
                        row.status === "over"
                          ? "#fb7185"
                          : row.status === "near"
                            ? "#fbbf24"
                            : row.status === "under"
                              ? "#34d399"
                              : "#94a3b8"
                      }
                      key={row.key}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OverviewRow({
  onSelect,
  row,
}: {
  onSelect: (rowKey: string) => void;
  row: FinanceDashboardOverviewRow;
}) {
  const styles = getStatusStyles(row.status);

  return (
    <button
      className={cn(
        "w-full rounded-2xl border bg-white/[0.03] p-4 text-left transition-all",
        styles.row
      )}
      onClick={() => onSelect(row.key)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(row.key);
        }
      }}
      type="button"
    >
      <div className="flex items-start justify-between gap-3 md:hidden">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-base text-white">
              {row.label}
            </span>
            {row.isCatchAll ? (
              <Badge
                className="border-white/10 bg-white/5 text-slate-300"
                variant="outline"
              >
                Catch-all
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-2.5 py-1",
                styles.badge
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", styles.dot)} />
              {getStatusLabel(row.status)}
            </span>
            <span className="text-slate-400">
              {row.budget === null
                ? "No budget"
                : `${formatPercent(row.progressPercent)} used`}
            </span>
          </div>
        </div>
        <ChevronRight className="mt-0.5 h-4 w-4 text-slate-500" />
      </div>

      <div className="mt-4 grid gap-3 md:hidden">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-slate-400 text-xs">Spent</div>
            <div className="font-medium text-white">
              {formatCurrency(row.actual)}
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-xs">Budget</div>
            <div className="font-medium text-white">
              {formatCurrency(row.budget)}
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-xs">Left</div>
            <div className={cn("font-medium", styles.text)}>
              {row.leftAmount === null
                ? "Not set"
                : formatCurrency(row.leftAmount)}
            </div>
          </div>
        </div>
        <InlineProgress
          colorClassName={styles.progress}
          value={row.progressPercent}
        />
      </div>

      <div className="hidden items-center gap-4 md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_120px_120px_24px]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate font-medium text-white">{row.label}</div>
            {row.isCatchAll ? (
              <Badge
                className="border-white/10 bg-white/5 text-slate-300"
                variant="outline"
              >
                Catch-all
              </Badge>
            ) : null}
          </div>
          <div className="mt-2">
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs",
                styles.badge
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", styles.dot)} />
              {getStatusLabel(row.status)}
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="font-medium text-white">
            {formatCurrency(row.actual)}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <InlineProgress
              className="flex-1"
              colorClassName={styles.progress}
              value={row.progressPercent}
            />
            <span className="shrink-0 text-slate-400 text-xs">
              {row.budget === null
                ? "No budget"
                : formatPercent(row.progressPercent)}
            </span>
          </div>
        </div>

        <div className="font-medium text-white">
          {formatCurrency(row.budget)}
        </div>
        <div className={cn("font-medium", styles.text)}>
          {row.leftAmount === null ? "Not set" : formatCurrency(row.leftAmount)}
        </div>
        <ChevronRight className="h-4 w-4 text-slate-500" />
      </div>
    </button>
  );
}

function AnalysisRow({
  onSelect,
  row,
}: {
  onSelect: (rowKey: string) => void;
  row: FinanceDashboardAnalysisRow;
}) {
  const styles = getStatusStyles(row.status);

  return (
    <button
      className={cn(
        "grid w-full items-center gap-4 rounded-2xl border bg-white/[0.03] p-4 text-left transition-all md:grid-cols-[minmax(0,1.4fr)_120px_120px_110px_110px_110px]",
        styles.row
      )}
      onClick={() => onSelect(row.key)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(row.key);
        }
      }}
      type="button"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="truncate font-medium text-white">{row.label}</div>
          {row.isCatchAll ? (
            <Badge
              className="border-white/10 bg-white/5 text-slate-300"
              variant="outline"
            >
              Catch-all
            </Badge>
          ) : null}
        </div>
        <div className="mt-2">
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs",
              styles.badge
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", styles.dot)} />
            {getStatusLabel(row.status)}
          </span>
        </div>
      </div>

      <div>
        <div className="text-slate-400 text-xs">Spent</div>
        <div className="font-medium text-white">
          {formatCurrency(row.totalSpent)}
        </div>
      </div>
      <div>
        <div className="text-slate-400 text-xs">Budget</div>
        <div className="font-medium text-white">
          {formatCurrency(row.budgetTotal)}
        </div>
      </div>
      <div>
        <div className="text-slate-400 text-xs">Avg/mo</div>
        <div className="font-medium text-white">
          {formatCurrency(row.averageSpent)}
        </div>
      </div>
      <div>
        <div className="text-slate-400 text-xs">Active</div>
        <div className="font-medium text-white">
          {formatMonthCount(row.activeMonths)}
        </div>
      </div>
      <div className="justify-self-start md:justify-self-end">
        <div className="text-slate-400 text-xs">Trend</div>
        <TrendSparkline data={row.trend} status={row.status} />
      </div>
    </button>
  );
}

function LargestTransactionsCard({
  items,
}: {
  items: FinanceDashboardTransactionItem[];
}) {
  return (
    <Card className="border-white/10 bg-slate-950/60 text-slate-50">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl text-white">
          Largest transactions
        </CardTitle>
        <CardDescription className="text-slate-400">
          Biggest hits in the selected month.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-slate-400 text-sm">
            No transactions in this month yet.
          </div>
        ) : (
          items.map((item) => (
            <div
              className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              key={item.id}
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-white">
                  {item.merchant || item.description}
                </div>
                <div className="mt-1 text-slate-400 text-sm">
                  {item.transactionDate} · {item.bucket}
                </div>
              </div>
              <div className="shrink-0 font-semibold text-white">
                {formatCurrency(item.amount)}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function MoversCard({ movers }: { movers: FinanceDashboardMover[] }) {
  return (
    <Card className="border-white/10 bg-slate-950/60 text-slate-50">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl text-white">Biggest movers</CardTitle>
        <CardDescription className="text-slate-400">
          Categories with the largest swings versus last month.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {movers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-slate-400 text-sm">
            A second month of data will unlock month-over-month movement.
          </div>
        ) : (
          movers.map((mover) => {
            const isIncrease = mover.delta >= 0;

            return (
              <div
                className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                key={mover.key}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-white">
                    {mover.label}
                  </div>
                  <div className="mt-1 text-slate-400 text-sm">
                    {formatCurrency(mover.previous)} last month
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-white">
                    {formatCurrency(mover.current)}
                  </div>
                  <div
                    className={cn(
                      "mt-1 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
                      getMoverAccent(mover.delta)
                    )}
                  >
                    {isIncrease ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    )}
                    {formatSignedCurrency(mover.delta)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export function MonthlyBudgetDashboard({
  projectId,
  snapshot,
  targets,
}: {
  projectId: string;
  snapshot: FinanceSnapshot;
  targets: FinanceTargetsResponse;
}) {
  const latestMonth = snapshot.monthlyChart.at(-1)?.month ?? "";
  const [selectedMonth, setSelectedMonth] = useState(latestMonth);
  const [view, setView] = useState<FinanceDashboardView>("overview");
  const [overviewFilter, setOverviewFilter] =
    useState<FinanceDashboardOverviewFilter>("all");
  const [lookbackWindow, setLookbackWindow] =
    useState<FinanceDashboardLookbackWindow>(6);
  const [analysisChart, setAnalysisChart] =
    useState<FinanceDashboardAnalysisChart>("cumulative");
  const [selectedDetailKey, setSelectedDetailKey] = useState<string | null>(
    null
  );
  const isMobile = useIsMobile();

  useEffect(() => {
    if (
      !selectedMonth ||
      !snapshot.monthlyChart.some((entry) => entry.month === selectedMonth)
    ) {
      setSelectedMonth(latestMonth);
    }
  }, [latestMonth, selectedMonth, snapshot.monthlyChart]);

  const viewModel = buildFinanceDashboardViewModel({
    lookbackWindow,
    selectedMonth,
    snapshot,
    targets,
  });

  useEffect(() => {
    if (!viewModel || !selectedDetailKey) {
      return;
    }

    if (!viewModel.detailRows.some((row) => row.key === selectedDetailKey)) {
      setSelectedDetailKey(null);
    }
  }, [selectedDetailKey, viewModel]);

  if (!viewModel) {
    return null;
  }

  const heroStatus: FinanceDashboardRowStatus =
    viewModel.overviewHero.budget !== null &&
    viewModel.overviewHero.leftAmount !== null &&
    viewModel.overviewHero.leftAmount < 0
      ? "over"
      : viewModel.overviewHero.progressPercent >= 85
        ? "near"
        : viewModel.overviewHero.budget === null
          ? "no-budget"
          : "under";
  const heroStyles = getStatusStyles(heroStatus);
  const filteredOverviewRows = viewModel.overviewRows.filter((row) =>
    rowMatchesOverviewFilter({ filter: overviewFilter, row })
  );
  const selectedDetailRow =
    viewModel.detailRows.find((row) => row.key === selectedDetailKey) ?? null;

  return (
    <>
      <Card className="overflow-hidden border-white/10 bg-[#07111f] text-slate-50 shadow-2xl shadow-slate-950/30">
        <CardHeader className="space-y-6 p-5 md:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-4">
              <Badge
                className="border-white/10 bg-white/10 text-slate-200"
                variant="outline"
              >
                Budget dashboard
              </Badge>
              <div>
                <CardTitle className="text-3xl text-white md:text-5xl">
                  {viewModel.selectedMonthEntry.label}
                </CardTitle>
                <CardDescription className="mt-2 max-w-2xl text-base text-slate-300">
                  {view === "overview"
                    ? "Use one clean budget workspace to see what needs attention this month."
                    : "Shift into a longer lens to see how spending behaves over the selected lookback."}
                </CardDescription>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 xl:items-end">
              <SegmentedControl
                ariaLabel="Dashboard view"
                onChange={setView}
                options={VIEW_OPTIONS}
                value={view}
              />
              <Button asChild type="button" variant="secondary">
                <Link href={`/project/${projectId}/budget`}>Edit budget</Link>
              </Button>
            </div>
          </div>

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {viewModel.monthButtons.map((month) => {
              const isSelected =
                month.month === viewModel.selectedMonthEntry.month;

              return (
                <button
                  className={cn(
                    "shrink-0 rounded-full border px-4 py-2 text-sm transition-colors",
                    isSelected
                      ? "border-white bg-white text-slate-950"
                      : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                  )}
                  key={month.month}
                  onClick={() => setSelectedMonth(month.month)}
                  type="button"
                >
                  {month.label}
                </button>
              );
            })}
          </div>

          {view === "overview" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] xl:items-center">
              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 md:p-6">
                {isMobile ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                          Spent this month
                        </div>
                        <div className="mt-2 font-semibold text-4xl text-white">
                          {formatCurrency(viewModel.overviewHero.actual)}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
                          heroStyles.badge
                        )}
                      >
                        <span
                          className={cn("h-2 w-2 rounded-full", heroStyles.dot)}
                        />
                        {getStatusLabel(heroStatus)}
                      </span>
                    </div>

                    <InlineProgress
                      colorClassName={heroStyles.progress}
                      value={viewModel.overviewHero.progressPercent}
                    />

                    <div className="grid gap-3 sm:grid-cols-3">
                      <HeroStat
                        label={viewModel.overviewHero.budgetLabel}
                        value={formatCurrency(viewModel.overviewHero.budget)}
                      />
                      <HeroStat
                        label="Left"
                        value={
                          viewModel.overviewHero.leftAmount === null
                            ? "Not set"
                            : formatCurrency(viewModel.overviewHero.leftAmount)
                        }
                      />
                      <HeroStat
                        label="Vs last month"
                        value={formatSignedCurrency(
                          viewModel.overviewHero.monthOverMonthChange
                        )}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid items-center gap-6 md:grid-cols-[minmax(260px,0.85fr)_minmax(0,1fr)]">
                    <BudgetGauge
                      budget={viewModel.overviewHero.budget}
                      spent={viewModel.overviewHero.actual}
                      status={heroStatus}
                      value={viewModel.overviewHero.progressPercent}
                    />
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
                            heroStyles.badge
                          )}
                        >
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full",
                              heroStyles.dot
                            )}
                          />
                          {getStatusLabel(heroStatus)}
                        </span>
                        <span className="text-slate-400 text-sm">
                          {viewModel.overviewHero.monthOverMonthChange === null
                            ? "No prior month to compare yet"
                            : `${formatSignedCurrency(viewModel.overviewHero.monthOverMonthChange)} vs last month`}
                        </span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <HeroStat
                          label={viewModel.overviewHero.budgetLabel}
                          value={formatCurrency(viewModel.overviewHero.budget)}
                        />
                        <HeroStat
                          label="Left"
                          value={
                            viewModel.overviewHero.leftAmount === null
                              ? "Not set"
                              : formatCurrency(
                                  viewModel.overviewHero.leftAmount
                                )
                          }
                        />
                        <HeroStat
                          label="Needs attention"
                          value={`${viewModel.overviewHero.needsAttentionCount}`}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-300 text-sm">
                          {viewModel.overviewHero.onTrackCount} on track
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-300 text-sm">
                          {viewModel.overviewHero.unbudgetedCount} unbudgeted
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <HeroStat
                  label="Vs last month"
                  value={formatSignedCurrency(
                    viewModel.overviewHero.monthOverMonthChange
                  )}
                />
                <HeroStat
                  label="On track"
                  value={`${viewModel.overviewHero.onTrackCount}`}
                />
                <HeroStat
                  label="Unbudgeted"
                  value={`${viewModel.overviewHero.unbudgetedCount}`}
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
              <div className="space-y-4 rounded-[28px] border border-white/10 bg-white/[0.04] p-5 md:p-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <SegmentedControl
                    ariaLabel="Analysis lookback window"
                    onChange={setLookbackWindow}
                    options={LOOKBACK_OPTIONS}
                    value={lookbackWindow}
                  />
                  <SegmentedControl
                    ariaLabel="Analysis chart type"
                    onChange={setAnalysisChart}
                    options={ANALYSIS_CHART_OPTIONS}
                    value={analysisChart}
                  />
                </div>
                <div className="text-slate-300 text-sm">
                  {viewModel.analysisRange.rangeLabel}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <HeroStat
                    label="Total spent"
                    value={formatCurrency(
                      viewModel.analysisSummary.actualTotal
                    )}
                  />
                  <HeroStat
                    label="Total budget"
                    value={formatCurrency(
                      viewModel.analysisSummary.budgetTotal
                    )}
                  />
                  <HeroStat
                    label="Avg monthly spend"
                    value={formatCurrency(
                      viewModel.analysisSummary.averageActual
                    )}
                  />
                  <HeroStat
                    label="On-budget months"
                    value={
                      viewModel.analysisSummary.onBudgetMonths === null
                        ? "N/A"
                        : `${viewModel.analysisSummary.onBudgetMonths}/${viewModel.analysisRange.monthCount}`
                    }
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <HeroStat
                  label="Active months"
                  value={formatMonthCount(
                    viewModel.analysisSummary.activeMonths
                  )}
                />
                <HeroStat
                  label="Variance"
                  value={formatSignedCurrency(
                    viewModel.analysisSummary.variance
                  )}
                />
                <HeroStat
                  label="Window size"
                  value={formatMonthCount(viewModel.analysisRange.monthCount)}
                />
              </div>
            </div>
          )}
        </CardHeader>
      </Card>

      {view === "overview" ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
          <Card className="border-white/10 bg-slate-950/60 text-slate-50">
            <CardHeader className="flex flex-col gap-4 space-y-0 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-2xl text-white">
                  Category budgets
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Categories are ranked by urgency so the biggest problems rise
                  first.
                </CardDescription>
              </div>
              <SegmentedControl
                ariaLabel="Overview row filter"
                className="max-w-full"
                onChange={setOverviewFilter}
                options={OVERVIEW_FILTER_OPTIONS}
                value={overviewFilter}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_120px_120px_24px] gap-4 px-4 text-slate-400 text-xs uppercase tracking-[0.24em] md:grid">
                <div>Category</div>
                <div>Spent</div>
                <div>Budget</div>
                <div>Left</div>
                <div />
              </div>

              {filteredOverviewRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-slate-400 text-sm">
                  Nothing matches this filter for the selected month.
                </div>
              ) : (
                filteredOverviewRows.map((row) => (
                  <OverviewRow
                    key={row.key}
                    onSelect={setSelectedDetailKey}
                    row={row}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6">
            <LargestTransactionsCard items={viewModel.largestTransactions} />
            <MoversCard movers={viewModel.biggestMovers} />
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
            {analysisChart === "cumulative" ? (
              <CumulativePaceChart data={viewModel.analysisCumulativeChart} />
            ) : (
              <MonthlySpendChart
                comparisonBudgetsByMonth={viewModel.comparisonBudgetsByMonth}
                comparisonLabel="Budget pace"
                data={viewModel.analysisMonthlyChart}
                highlightedMonths={viewModel.analysisRange.monthKeys}
                selectedMonth={viewModel.selectedMonthEntry.month}
              />
            )}
            <SpendShareChart rows={viewModel.analysisShareRows} />
          </div>

          <Card className="border-white/10 bg-slate-950/60 text-slate-50">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl text-white">
                Category explorer
              </CardTitle>
              <CardDescription className="text-slate-400">
                Compare long-horizon category performance without the
                month-by-month noise.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="hidden grid-cols-[minmax(0,1.4fr)_120px_120px_110px_110px_110px] gap-4 px-4 text-slate-400 text-xs uppercase tracking-[0.24em] md:grid">
                <div>Category</div>
                <div>Spent</div>
                <div>Budget</div>
                <div>Avg/mo</div>
                <div>Active</div>
                <div>Trend</div>
              </div>
              {viewModel.analysisCategoryRows.map((row) => (
                <AnalysisRow
                  key={row.key}
                  onSelect={setSelectedDetailKey}
                  row={row}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Sheet
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDetailKey(null);
          }
        }}
        open={selectedDetailRow !== null}
      >
        <SheetContent
          className={cn(
            "overflow-y-auto border-white/10 bg-slate-950/95 text-slate-50",
            isMobile ? "max-h-[92vh] rounded-t-[28px]" : "w-full sm:max-w-xl"
          )}
          side={isMobile ? "bottom" : "right"}
        >
          {selectedDetailRow ? (
            <div className="space-y-6">
              <SheetHeader className="space-y-3 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="text-2xl text-white">
                    {selectedDetailRow.label}
                  </SheetTitle>
                  {selectedDetailRow.isCatchAll ? (
                    <Badge
                      className="border-white/10 bg-white/5 text-slate-300"
                      variant="outline"
                    >
                      Catch-all
                    </Badge>
                  ) : null}
                </div>
                <SheetDescription className="text-slate-400">
                  A compact look at recent trend, top merchants, and
                  transactions in this category.
                </SheetDescription>
              </SheetHeader>

              <div className="grid gap-3 sm:grid-cols-3">
                <HeroStat
                  label="Spent"
                  value={formatCurrency(selectedDetailRow.actual)}
                />
                <HeroStat
                  label="Budget"
                  value={formatCurrency(selectedDetailRow.budget)}
                />
                <HeroStat
                  label="Left"
                  value={
                    selectedDetailRow.leftAmount === null
                      ? "Not set"
                      : formatCurrency(selectedDetailRow.leftAmount)
                  }
                />
              </div>

              <Card className="border-white/10 bg-white/[0.03] text-slate-50">
                <CardHeader className="space-y-1">
                  <CardTitle className="text-lg text-white">
                    Recent trend
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    The last three months of actual spending versus budget.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-60 w-full">
                    <ResponsiveContainer height="100%" width="100%">
                      <BarChart data={selectedDetailRow.trend}>
                        <CartesianGrid
                          stroke="rgba(148, 163, 184, 0.16)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: "#cbd5e1", fontSize: 12 }}
                        />
                        <YAxis
                          tick={{ fill: "#94a3b8", fontSize: 12 }}
                          tickFormatter={(value) => `$${value}`}
                          width={70}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#020617",
                            border: "1px solid rgba(148, 163, 184, 0.2)",
                            borderRadius: "16px",
                            color: "#e2e8f0",
                          }}
                          formatter={(value, name) => [
                            formatCurrency(Number(value)),
                            name === "actual" ? "Actual spend" : "Budget",
                          ]}
                        />
                        <Bar
                          dataKey="actual"
                          fill="#2dd4bf"
                          isAnimationActive={false}
                          radius={10}
                        />
                        <Line
                          dataKey="budget"
                          dot={false}
                          isAnimationActive={false}
                          stroke="#f8fafc"
                          strokeDasharray="6 4"
                          strokeWidth={2.5}
                          type="monotone"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.03] text-slate-50">
                <CardHeader className="space-y-1">
                  <CardTitle className="text-lg text-white">
                    Top merchants
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    The merchants absorbing the most spend in this category.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedDetailRow.topMerchants.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-slate-400 text-sm">
                      No merchant data is available for this category yet.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedDetailRow.topMerchants.map((merchant) => (
                        <div
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-2"
                          key={merchant.merchant}
                        >
                          <div className="font-medium text-sm text-white">
                            {merchant.merchant}
                          </div>
                          <div className="text-slate-400 text-xs">
                            {formatCurrency(merchant.amount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.03] text-slate-50">
                <CardHeader className="space-y-1">
                  <CardTitle className="text-lg text-white">
                    Recent transactions
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    The latest activity tied to this category.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedDetailRow.transactions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-slate-400 text-sm">
                      No transactions landed here in the selected month.
                    </div>
                  ) : (
                    <TransactionTable
                      transactions={selectedDetailRow.transactions}
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
