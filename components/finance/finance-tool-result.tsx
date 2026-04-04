"use client";

import { CheckIcon, CircleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildFinanceActionKey } from "@/lib/finance/action-keys";
import { FINANCE_RECOMMENDATION_LOOKBACK_MONTHS } from "@/lib/finance/config";
import {
  type FinanceToolSnapshotSummaryInput,
  normalizeFinanceToolSnapshotSummary,
} from "@/lib/finance/tool-result-summary";
import type {
  FinanceAction,
  FinanceTransactionMatch,
} from "@/lib/finance/types";
import type {
  FinanceRulesViewData,
  FinanceTargetsResponse,
} from "@/lib/finance/types";
import { cn } from "@/lib/utils";

function formatCurrency(value: number | null) {
  if (value === null) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatOptionalSignedCurrency(value: number | null) {
  if (value === null) {
    return "-";
  }

  const formatted = formatCurrency(Math.abs(value));
  return value < 0 ? `-${formatted}` : formatted;
}

function describeMatch(match: FinanceTransactionMatch) {
  const parts = [
    match.merchant ? `merchant contains "${match.merchant}"` : null,
    match.descriptionContains
      ? `description contains "${match.descriptionContains}"`
      : null,
    match.rawCategory ? `raw category is "${match.rawCategory}"` : null,
    match.account ? `account is "${match.account}"` : null,
  ].filter((value): value is string => Boolean(value));

  return parts.join(", ");
}

export function describeFinanceAction(action: FinanceAction) {
  switch (action.type) {
    case "categorize_transactions":
      return `Categorize transactions where ${describeMatch(action.match)} as ${action.to}`;
    case "categorize_transaction":
      return `Categorize transaction ${action.transactionId.slice(0, 8)} as ${action.to}`;
    case "exclude_transaction":
      return `Exclude transaction ${action.transactionId.slice(0, 8)}`;
    case "exclude_transactions":
      return `Exclude transactions where ${describeMatch(action.match)}`;
    case "set_category_monthly_target":
      return `Set ${action.category} category budget to ${formatCurrency(action.amount)}${action.effectiveMonth ? ` starting ${action.effectiveMonth}` : ""}`;
    case "set_plan_mode":
      return `Switch plan mode to ${action.mode}`;
    default:
      return "Update finance plan";
  }
}

function buildSelectableActionKey(action: FinanceAction, index: number) {
  return `${buildFinanceActionKey(action)}:${index}`;
}

export function FinanceActionPreview({
  actions,
}: {
  actions: FinanceAction[];
}) {
  return (
    <div className="space-y-2">
      {actions.map((action, index) => (
        <div
          className="rounded-md border bg-background p-3"
          key={buildSelectableActionKey(action, index)}
        >
          <div className="font-medium">{describeFinanceAction(action)}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-muted-foreground text-xs">
            <Badge variant="secondary">{action.type}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

export function FinanceActionApprovalRequest({
  actions,
  onApprove,
  onDeny,
}: {
  actions: FinanceAction[];
  onApprove: (selectedActions: FinanceAction[]) => void;
  onDeny: () => void;
}) {
  const actionKeys = actions.map((action, index) =>
    buildSelectableActionKey(action, index)
  );
  const [selectedActionKeys, setSelectedActionKeys] = useState(
    () => new Set(actionKeys)
  );

  useEffect(() => {
    setSelectedActionKeys(new Set(actionKeys));
  }, [actionKeys]);

  const selectedActions = actions.filter((action, index) =>
    selectedActionKeys.has(buildSelectableActionKey(action, index))
  );
  const selectedCount = selectedActions.length;
  const isPartiallySelected =
    selectedCount > 0 && selectedCount < actions.length;

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Proposed Changes
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setSelectedActionKeys(new Set(actionKeys))}
            size="sm"
            type="button"
            variant="outline"
          >
            Select all
          </Button>
          <Button
            onClick={() => setSelectedActionKeys(new Set())}
            size="sm"
            type="button"
            variant="ghost"
          >
            Unselect all
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {actions.map((action, index) => {
          const actionKey = buildSelectableActionKey(action, index);
          const isSelected = selectedActionKeys.has(actionKey);

          return (
            <div
              className={cn(
                "space-y-2 rounded-md border bg-background p-3 transition-opacity",
                !isSelected && "opacity-60"
              )}
              key={actionKey}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="font-medium">
                    {describeFinanceAction(action)}
                  </div>
                  <div className="flex flex-wrap gap-2 text-muted-foreground text-xs">
                    <Badge variant="secondary">{action.type}</Badge>
                    {!isSelected && <Badge variant="outline">Skipped</Badge>}
                  </div>
                </div>
                <Button
                  onClick={() =>
                    setSelectedActionKeys((current) => {
                      const next = new Set(current);

                      if (next.has(actionKey)) {
                        next.delete(actionKey);
                      } else {
                        next.add(actionKey);
                      }

                      return next;
                    })
                  }
                  size="sm"
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                >
                  {isSelected ? (
                    <CheckIcon className="mr-1 size-4" />
                  ) : (
                    <CircleIcon className="mr-1 size-4" />
                  )}
                  {isSelected ? "Selected" : "Select"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {selectedCount === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-sm">
          Select at least one change to save.
        </div>
      )}

      {isPartiallySelected && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
          Only the {selectedCount} selected change
          {selectedCount === 1 ? "" : "s"} will be applied.
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t pt-3">
        <Button onClick={onDeny} type="button" variant="ghost">
          Deny
        </Button>
        <Button
          disabled={selectedCount === 0}
          onClick={() => onApprove(selectedActions)}
          type="button"
        >
          {selectedCount === actions.length
            ? "Save Changes"
            : `Save Selected (${selectedCount})`}
        </Button>
      </div>
    </div>
  );
}

function SnapshotSummary({
  label,
  summary,
}: {
  label: string;
  summary: FinanceToolSnapshotSummaryInput;
}) {
  const normalizedSummary = normalizeFinanceToolSnapshotSummary(summary);

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-sm">{label}</div>
        <Badge variant="secondary">{normalizedSummary.status}</Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-wide">
            Included Outflow
          </div>
          <div className="font-medium text-sm">
            {formatCurrency(normalizedSummary.includedOutflow)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-wide">
            Total Budget
          </div>
          <div className="font-medium text-sm">
            {formatCurrency(normalizedSummary.totalMonthlyBudgetTarget)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-wide">
            Category Budgets
          </div>
          <div className="font-medium text-sm">
            {formatCurrency(normalizedSummary.categoryBudgetTotal)}
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-wide">
            Catch-all Budget
          </div>
          <div className="font-medium text-sm">
            {formatOptionalSignedCurrency(normalizedSummary.catchAllBudget)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-wide">
            Total Income
          </div>
          <div className="font-medium text-sm">
            {formatCurrency(normalizedSummary.totalMonthlyIncomeTarget)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-wide">
            {FINANCE_RECOMMENDATION_LOOKBACK_MONTHS}-Mo Suggested Pace
          </div>
          <div className="font-medium text-sm">
            {formatCurrency(normalizedSummary.suggestedMonthlyTarget)}
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-wide">
            Historical Spend
          </div>
          <div className="font-medium text-sm">
            {formatCurrency(normalizedSummary.historicalAverageMonthlySpend)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-wide">
            Historical Income
          </div>
          <div className="font-medium text-sm">
            {formatCurrency(normalizedSummary.historicalAverageMonthlyIncome)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-wide">
            {FINANCE_RECOMMENDATION_LOOKBACK_MONTHS}-Mo Avg Spend
          </div>
          <div className="font-medium text-sm">
            {formatCurrency(normalizedSummary.trailingAverageSpend)}
          </div>
        </div>
      </div>

      {normalizedSummary.topCategories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {normalizedSummary.topCategories.slice(0, 3).map((category) => (
            <Badge key={category.category} variant="outline">
              {category.category}: {formatCurrency(category.monthlyTarget)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function BudgetTargetsResult({
  result,
}: {
  result: FinanceTargetsResponse;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{result.snapshotStatus}</Badge>
        {result.planMode && <Badge variant="secondary">{result.planMode}</Badge>}
        {result.latestTransactionDate && (
          <Badge variant="outline">
            Latest data: {result.latestTransactionDate}
          </Badge>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="text-muted-foreground text-xs uppercase tracking-wide">
            Total Budget
          </div>
          <div className="font-medium text-sm">
            {formatCurrency(result.cashFlowSummary.totalMonthlyBudgetTarget)}
          </div>
        </div>
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="text-muted-foreground text-xs uppercase tracking-wide">
            Total Income
          </div>
          <div className="font-medium text-sm">
            {formatCurrency(result.cashFlowSummary.totalMonthlyIncomeTarget)}
          </div>
        </div>
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="text-muted-foreground text-xs uppercase tracking-wide">
            Category Budgets
          </div>
          <div className="font-medium text-sm">
            {formatCurrency(result.cashFlowSummary.categoryBudgetTotal)}
          </div>
        </div>
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="text-muted-foreground text-xs uppercase tracking-wide">
            Catch-all
          </div>
          <div className="font-medium text-sm">
            {formatOptionalSignedCurrency(result.cashFlowSummary.catchAllBudget)}
          </div>
        </div>
      </div>

      {result.categoryBudgets.length > 0 ? (
        <div className="space-y-2">
          <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Current Category Budgets
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-muted/70">
                <tr>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Group</th>
                  <th className="px-3 py-2 font-medium">Budget</th>
                  <th className="px-3 py-2 font-medium">Recent Actual</th>
                </tr>
              </thead>
              <tbody>
                {result.categoryBudgets.map((budget) => (
                  <tr className="border-t" key={budget.overrideId ?? budget.category}>
                    <td className="px-3 py-2 font-medium">{budget.category}</td>
                    <td className="px-3 py-2">{budget.group}</td>
                    <td className="px-3 py-2">{formatCurrency(budget.amount)}</td>
                    <td className="px-3 py-2">
                      {formatCurrency(budget.lastMonthActual)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground">
          No category budgets are set yet.
        </div>
      )}

      {result.suggestedCategoryBudgets.length > 0 && (
        <div className="space-y-2">
          <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Suggested Category Budgets
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-muted/70">
                <tr>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Group</th>
                  <th className="px-3 py-2 font-medium">Suggested</th>
                  <th className="px-3 py-2 font-medium">Recent Actual</th>
                </tr>
              </thead>
              <tbody>
                {result.suggestedCategoryBudgets.slice(0, 12).map((budget) => (
                  <tr className="border-t" key={budget.category}>
                    <td className="px-3 py-2 font-medium">{budget.category}</td>
                    <td className="px-3 py-2">{budget.group}</td>
                    <td className="px-3 py-2">
                      {formatCurrency(budget.suggestedAmount)}
                    </td>
                    <td className="px-3 py-2">
                      {formatCurrency(budget.lastMonthActual)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function OptionBadges({
  label,
  values,
}: {
  label: string;
  values: string[];
}) {
  if (values.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {values.slice(0, 8).map((value) => (
          <Badge key={value} variant="outline">
            {value}
          </Badge>
        ))}
        {values.length > 8 && (
          <Badge variant="outline">+{values.length - 8} more</Badge>
        )}
      </div>
    </div>
  );
}

function RulesResult({
  result,
}: {
  result: FinanceRulesViewData;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          {result.summary?.totalRules ?? result.rules.length} rules
        </Badge>
        {(result.summary?.categorizationRuleCount ?? 0) > 0 && (
          <Badge variant="outline">
            {result.summary?.categorizationRuleCount} categorization
          </Badge>
        )}
        {(result.summary?.exclusionRuleCount ?? 0) > 0 && (
          <Badge variant="outline">
            {result.summary?.exclusionRuleCount} exclusions
          </Badge>
        )}
        {(result.summary?.budgetOverrideCount ?? 0) > 0 && (
          <Badge variant="outline">
            {result.summary?.budgetOverrideCount} budget overrides
          </Badge>
        )}
        {(result.summary?.planModeChangeCount ?? 0) > 0 && (
          <Badge variant="outline">
            {result.summary?.planModeChangeCount} plan mode changes
          </Badge>
        )}
      </div>

      <OptionBadges label="Categories" values={result.options.categories} />
      <OptionBadges label="Raw Categories" values={result.options.rawCategories} />
      <OptionBadges label="Accounts" values={result.options.accounts} />

      {result.rules.length === 0 ? (
        <div className="text-muted-foreground">No finance rules are saved yet.</div>
      ) : (
        <div className="space-y-2">
          <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Current Rules
          </div>
          <div className="space-y-2">
            {result.rules.slice(0, 12).map((rule) => (
              <div className="rounded-md border bg-background p-3" key={rule.id}>
                <div className="font-medium">{rule.summary}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-muted-foreground text-xs">
                  <Badge variant="secondary">{rule.type}</Badge>
                  {rule.matchedTransactions !== null && (
                    <Badge variant="outline">
                      {rule.matchedTransactions} matched
                    </Badge>
                  )}
                  {rule.affectedOutflow !== null && (
                    <Badge variant="outline">
                      {formatCurrency(rule.affectedOutflow)} affected
                    </Badge>
                  )}
                </div>
              </div>
            ))}
            {result.rules.length > 12 && (
              <div className="text-muted-foreground text-xs">
                Showing 12 of {result.rules.length} rules.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function FinanceToolResult({
  result,
  type,
}: {
  result: any;
  type: "apply" | "budget-targets" | "rules" | "snapshot";
}) {
  return (
    <div className="space-y-4 p-4 text-sm">
      {type === "apply" && (
        <>
          {Array.isArray(result.appliedActions) &&
            result.appliedActions.length > 0 && (
              <div className="space-y-2">
                <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Applied Changes
                </div>
                <div className="space-y-2">
                  {result.appliedActions.map((action: any, index: number) => (
                    <div
                      className="rounded-md border bg-background p-3"
                      key={`${action.summary}-${index}`}
                    >
                      <div className="font-medium">{action.summary}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-muted-foreground text-xs">
                        {action.matchedTransactions !== null && (
                          <Badge variant="secondary">
                            {action.matchedTransactions} matched
                          </Badge>
                        )}
                        {action.affectedOutflow !== null && (
                          <Badge variant="secondary">
                            {formatCurrency(action.affectedOutflow)} affected
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {Array.isArray(result.skippedActions) &&
            result.skippedActions.length > 0 && (
              <div className="space-y-2">
                <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Skipped Changes
                </div>
                <div className="space-y-2">
                  {result.skippedActions.map((item: any, index: number) => (
                    <div
                      className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900"
                      key={`${item.reason}-${index}`}
                    >
                      <div className="font-medium">
                        {item.action?.type ?? "finance_action"}
                      </div>
                      <div className="mt-1 text-xs">{item.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </>
      )}

      {type === "snapshot" && result.current && (
        <SnapshotSummary label="Current" summary={result.current} />
      )}

      {type === "budget-targets" && (
        <BudgetTargetsResult result={result as FinanceTargetsResponse} />
      )}

      {type === "rules" && (
        <RulesResult result={result as FinanceRulesViewData} />
      )}

      {result.before && result.after && (
        <div className="grid gap-3 lg:grid-cols-2">
          <SnapshotSummary label="Before" summary={result.before} />
          <SnapshotSummary label="After" summary={result.after} />
        </div>
      )}
    </div>
  );
}
