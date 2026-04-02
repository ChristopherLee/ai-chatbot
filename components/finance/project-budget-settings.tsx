"use client";

import {
  ArrowLeft,
  Loader2,
  Pencil,
  PiggyBank,
  Plus,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "@/components/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FINANCE_RECOMMENDATION_LOOKBACK_MONTHS } from "@/lib/finance/config";
import type {
  BucketGroup,
  FinanceRuleRecord,
  FinanceRulesViewData,
  FinanceTargetsCategoryBudget,
  FinanceTargetsCategoryBudgetSuggestion,
  FinanceTargetsResponse,
} from "@/lib/finance/types";
import {
  budgetExclusionRuleTypes as budgetExclusionRuleTypesList,
  legacyFinanceRuleTypes as legacyFinanceRuleTypesList,
} from "@/lib/finance/types";
import { roundCurrency, safeLower } from "@/lib/finance/utils";
import { fetcher } from "@/lib/utils";
import { FinanceRuleEditorDialog } from "./finance-rule-editor-dialog";

type EditableCategoryBudget = {
  bucket: string;
  group: BucketGroup;
  amount: string;
  lastMonthActual: number;
  overrideId: string | null;
};

function formatCurrency(value: number | null) {
  if (value === null) {
    return "Not set";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatSignedCurrency(value: number | null) {
  if (value === null) {
    return "Not set";
  }

  const formatted = formatCurrency(Math.abs(value));
  return value < 0 ? `-${formatted}` : formatted;
}

function toInputValue(value: number | null) {
  return value === null ? "" : value.toString();
}

function normalizeBucketName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getGroupLabel(group: BucketGroup) {
  switch (group) {
    case "fixed":
      return "Fixed";
    case "annual":
      return "Annual";
    case "excluded":
      return "Excluded";
    default:
      return "Flexible";
  }
}

function getGroupBadgeClass(group: BucketGroup) {
  switch (group) {
    case "fixed":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "annual":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "excluded":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
}

function buildEditableCategoryBudgets(
  categoryBudgets: FinanceTargetsCategoryBudget[]
): EditableCategoryBudget[] {
  return categoryBudgets.map((budget) => ({
    bucket: budget.bucket,
    group: budget.group,
    amount: budget.amount.toString(),
    lastMonthActual: budget.lastMonthActual,
    overrideId: budget.overrideId,
  }));
}

function buildSuggestionPool(data: FinanceTargetsResponse) {
  const suggestions = new Map<string, FinanceTargetsCategoryBudgetSuggestion>();

  for (const suggestion of data.suggestedCategoryBudgets) {
    suggestions.set(safeLower(suggestion.bucket), suggestion);
  }

  for (const budget of data.categoryBudgets) {
    const bucketKey = safeLower(budget.bucket);

    if (!suggestions.has(bucketKey)) {
      suggestions.set(bucketKey, {
        bucket: budget.bucket,
        group: budget.group,
        suggestedAmount: budget.amount,
        lastMonthActual: budget.lastMonthActual,
      });
    }
  }

  return [...suggestions.values()].sort(
    (left, right) =>
      right.suggestedAmount - left.suggestedAmount ||
      left.bucket.localeCompare(right.bucket)
  );
}

function BudgetExclusionsManager({
  onFinanceDataChanged,
  projectId,
}: {
  onFinanceDataChanged: () => Promise<void>;
  projectId: string;
}) {
  const rulesKey = `/api/finance/project/${projectId}/rules`;
  const snapshotKey = `/api/finance/project/${projectId}`;
  const { mutate: mutateGlobal } = useSWRConfig();
  const { data, error, isLoading, mutate } = useSWR<FinanceRulesViewData>(
    rulesKey,
    fetcher
  );
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<FinanceRuleRecord | null>(
    null
  );
  const [rulePendingDelete, setRulePendingDelete] =
    useState<FinanceRuleRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const exclusionRuleTypes = new Set<FinanceRuleRecord["type"]>(
    budgetExclusionRuleTypesList
  );
  const legacyRuleTypes = new Set<FinanceRuleRecord["type"]>(
    legacyFinanceRuleTypesList
  );
  const exclusionRules = [...(data?.rules ?? [])]
    .filter((rule) => exclusionRuleTypes.has(rule.type))
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );
  const legacyInclusionRules = [...(data?.rules ?? [])]
    .filter((rule) => legacyRuleTypes.has(rule.type))
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );

  const refreshAfterRuleChange = async () => {
    await Promise.all([
      mutate(),
      onFinanceDataChanged(),
      mutateGlobal(snapshotKey),
    ]);
  };

  const handleDeleteRule = async () => {
    if (!rulePendingDelete) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch(
        `/api/finance/project/${projectId}/rules/${rulePendingDelete.id}`,
        {
          method: "DELETE",
        }
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.cause || payload?.message || "Request failed");
      }

      await refreshAfterRuleChange();
      setRulePendingDelete(null);
      toast({
        type: "success",
        description:
          rulePendingDelete.type === "include_transactions"
            ? "Legacy inclusion removed."
            : "Budget exclusion removed.",
      });
    } catch (deleteError) {
      toast({
        type: "error",
        description:
          deleteError instanceof Error
            ? deleteError.message
            : "Failed to delete the budget rule.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card className="border-0 bg-gradient-to-br from-zinc-50 to-white shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-2xl">Budget exclusions</CardTitle>
              <div className="mt-1 text-muted-foreground text-sm leading-6">
                Exclude matching transactions from budget calculations when they
                should not count toward spending.
              </div>
            </div>

            <Button
              onClick={() => {
                setEditingRule(null);
                setIsEditorOpen(true);
              }}
              type="button"
              variant="outline"
            >
              <Plus className="size-4" />
              Add exclusion
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {isLoading && !data ? (
            <div className="flex items-center gap-3 rounded-2xl border bg-background/80 px-4 py-5 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading budget exclusions...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-5 text-red-700 text-sm">
              Unable to load budget exclusions right now.
            </div>
          ) : exclusionRules.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-background/70 px-4 py-6 text-muted-foreground text-sm">
              No budget exclusions yet. Add one when a merchant, description,
              category, or account should stay out of the budget.
            </div>
          ) : (
            exclusionRules.map((rule) => (
              <div
                className="rounded-2xl border bg-background/80 p-4"
                key={rule.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="font-medium">
                      {rule.details.find((detail) => detail.label === "When")
                        ?.value ?? rule.summary}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="secondary">
                        {rule.matchedTransactions ?? 0} matched
                      </Badge>
                      {rule.affectedOutflow !== null ? (
                        <Badge variant="outline">
                          {formatCurrency(rule.affectedOutflow)} excluded
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2 text-muted-foreground text-sm">
                      {rule.details
                        .filter((detail) => detail.label !== "When")
                        .map((detail) => (
                          <span key={`${rule.id}-${detail.label}`}>
                            {detail.label}: {detail.value}
                          </span>
                        ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => {
                        setEditingRule(rule);
                        setIsEditorOpen(true);
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                    <Button
                      onClick={() => setRulePendingDelete(rule)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}

          {legacyInclusionRules.length > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="font-medium text-amber-900">
                Legacy inclusions
              </div>
              <div className="mt-1 text-amber-800 text-sm leading-6">
                New inclusion rules are no longer supported. These older rules
                still apply until you remove them.
              </div>
              <div className="mt-4 space-y-3">
                {legacyInclusionRules.map((rule) => (
                  <div
                    className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-200 bg-white/80 p-3"
                    key={rule.id}
                  >
                    <div className="space-y-1">
                      <div className="font-medium text-amber-950">
                        {rule.details.find((detail) => detail.label === "When")
                          ?.value ?? rule.summary}
                      </div>
                      <div className="text-amber-900 text-xs">
                        {rule.matchedTransactions ?? 0} matched
                        {rule.affectedOutflow !== null
                          ? ` • ${formatCurrency(rule.affectedOutflow)} affected`
                          : ""}
                      </div>
                    </div>
                    <Button
                      onClick={() => setRulePendingDelete(rule)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Trash2 className="size-4" />
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <FinanceRuleEditorDialog
        allowedTypes={budgetExclusionRuleTypesList}
        copy={{
          createSubmitLabel: "Add exclusion",
          createSuccess: "Budget exclusion added.",
          createTitle: "Add budget exclusion",
          description:
            "Preview which transactions would be excluded from budget calculations before you save.",
          editSuccess: "Budget exclusion updated.",
          editTitle: "Edit budget exclusion",
        }}
        defaultType="exclude_transactions"
        onOpenChange={(open) => {
          setIsEditorOpen(open);

          if (!open) {
            setEditingRule(null);
          }
        }}
        onSaved={refreshAfterRuleChange}
        open={isEditorOpen}
        options={data?.options}
        projectId={projectId}
        rule={editingRule}
      />

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setRulePendingDelete(null);
          }
        }}
        open={Boolean(rulePendingDelete)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {rulePendingDelete?.type === "include_transactions"
                ? "Remove legacy inclusion?"
                : "Delete budget exclusion?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {rulePendingDelete
                ? `This will remove "${rulePendingDelete.summary}" from the saved finance plan.`
                : "This budget rule will be removed from the saved finance plan."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} onClick={handleDeleteRule}>
              {isDeleting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ProjectBudgetSettings({
  initialData,
}: {
  initialData: FinanceTargetsResponse;
}) {
  const targetsKey = `/api/finance/project/${initialData.projectId}/targets`;
  const snapshotKey = `/api/finance/project/${initialData.projectId}`;
  const { mutate: mutateGlobal } = useSWRConfig();
  const { data, mutate } = useSWR<FinanceTargetsResponse>(targetsKey, fetcher, {
    fallbackData: initialData,
  });
  const [totalMonthlyBudgetTarget, setTotalMonthlyBudgetTarget] = useState(
    toInputValue(initialData.cashFlowSummary.totalMonthlyBudgetTarget)
  );
  const [totalMonthlyIncomeTarget, setTotalMonthlyIncomeTarget] = useState(
    toInputValue(initialData.cashFlowSummary.totalMonthlyIncomeTarget)
  );
  const [categoryBudgets, setCategoryBudgets] = useState(
    buildEditableCategoryBudgets(initialData.categoryBudgets)
  );
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryAmount, setNewCategoryAmount] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!data) {
      return;
    }

    setTotalMonthlyBudgetTarget(
      toInputValue(data.cashFlowSummary.totalMonthlyBudgetTarget)
    );
    setTotalMonthlyIncomeTarget(
      toInputValue(data.cashFlowSummary.totalMonthlyIncomeTarget)
    );
    setCategoryBudgets(buildEditableCategoryBudgets(data.categoryBudgets));
  }, [data]);

  if (!data) {
    return null;
  }

  const parsedBudget =
    totalMonthlyBudgetTarget.trim() === ""
      ? null
      : Number(totalMonthlyBudgetTarget);
  const parsedIncome =
    totalMonthlyIncomeTarget.trim() === ""
      ? null
      : Number(totalMonthlyIncomeTarget);
  const hasValidBudgetTarget =
    parsedBudget === null ||
    (Number.isFinite(parsedBudget) && Number(parsedBudget) >= 0);
  const hasValidIncomeTarget =
    parsedIncome === null ||
    (Number.isFinite(parsedIncome) && Number(parsedIncome) >= 0);
  const topLevelValidationError =
    !hasValidBudgetTarget || !hasValidIncomeTarget;

  const normalizedCategoryBudgets = categoryBudgets.map((budget) => {
    const normalizedBucket = normalizeBucketName(budget.bucket);
    const parsedAmount =
      budget.amount.trim() === "" ? null : Number(budget.amount);
    const isValidAmount =
      parsedAmount !== null &&
      Number.isFinite(parsedAmount) &&
      parsedAmount >= 0;

    return {
      ...budget,
      normalizedBucket,
      parsedAmount,
      isValidAmount,
    };
  });
  const seenBuckets = new Set<string>();
  let duplicateCategoryBudget = false;

  for (const budget of normalizedCategoryBudgets) {
    const bucketKey = safeLower(budget.normalizedBucket);

    if (!bucketKey) {
      continue;
    }

    if (seenBuckets.has(bucketKey)) {
      duplicateCategoryBudget = true;
      break;
    }

    seenBuckets.add(bucketKey);
  }

  const invalidCategoryBudget = normalizedCategoryBudgets.some(
    (budget) => budget.normalizedBucket.length === 0 || !budget.isValidAmount
  );
  const categoryBudgetValidationError =
    invalidCategoryBudget || duplicateCategoryBudget;
  const draftCategoryBudgetTotal = categoryBudgetValidationError
    ? null
    : roundCurrency(
        normalizedCategoryBudgets.reduce(
          (sum, budget) => sum + (budget.parsedAmount ?? 0),
          0
        )
      );
  const projectedCatchAllBudget =
    parsedBudget === null ||
    !hasValidBudgetTarget ||
    draftCategoryBudgetTotal === null
      ? null
      : roundCurrency(parsedBudget - draftCategoryBudgetTotal);
  const targetNet =
    parsedBudget !== null &&
    parsedIncome !== null &&
    hasValidBudgetTarget &&
    hasValidIncomeTarget
      ? roundCurrency(parsedIncome - parsedBudget)
      : null;
  const addCategoryName = normalizeBucketName(newCategoryName);
  const parsedNewCategoryAmount =
    newCategoryAmount.trim() === "" ? null : Number(newCategoryAmount);
  const addCategoryDisabled =
    addCategoryName.length === 0 ||
    parsedNewCategoryAmount === null ||
    !Number.isFinite(parsedNewCategoryAmount) ||
    parsedNewCategoryAmount < 0 ||
    normalizedCategoryBudgets.some(
      (budget) =>
        safeLower(budget.normalizedBucket) === safeLower(addCategoryName)
    );
  const activeBudgetKeys = new Set(
    normalizedCategoryBudgets.map((budget) =>
      safeLower(budget.normalizedBucket)
    )
  );
  const availableSuggestions = buildSuggestionPool(data).filter(
    (suggestion) => !activeBudgetKeys.has(safeLower(suggestion.bucket))
  );
  const hasValidationError =
    topLevelValidationError || categoryBudgetValidationError;

  const handleSave = async () => {
    if (hasValidationError || draftCategoryBudgetTotal === null) {
      toast({
        type: "error",
        description:
          "Fix the invalid budget fields before saving your budget builder.",
      });
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(targetsKey, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          totalMonthlyBudgetTarget: parsedBudget,
          totalMonthlyIncomeTarget: parsedIncome,
          categoryBudgets: normalizedCategoryBudgets.map((budget) => ({
            bucket: budget.normalizedBucket,
            amount: roundCurrency(budget.parsedAmount ?? 0),
          })),
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.cause || payload?.message || "Request failed");
      }

      await mutate(payload satisfies FinanceTargetsResponse, false);
      await mutateGlobal(snapshotKey);
      toast({
        type: "success",
        description: "Budget builder updated.",
      });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update the budget builder.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddCategory = () => {
    if (addCategoryDisabled || parsedNewCategoryAmount === null) {
      return;
    }

    setCategoryBudgets((current) =>
      [
        ...current,
        {
          bucket: addCategoryName,
          group: "flexible" as const,
          amount: roundCurrency(parsedNewCategoryAmount).toString(),
          lastMonthActual: 0,
          overrideId: null,
        },
      ].sort(
        (left, right) =>
          Number(right.amount) - Number(left.amount) ||
          left.bucket.localeCompare(right.bucket)
      )
    );
    setNewCategoryName("");
    setNewCategoryAmount("");
  };

  const handleAddSuggestion = (
    suggestion: FinanceTargetsCategoryBudgetSuggestion
  ) => {
    setCategoryBudgets((current) =>
      [
        ...current,
        {
          bucket: suggestion.bucket,
          group: suggestion.group,
          amount: suggestion.suggestedAmount.toString(),
          lastMonthActual: suggestion.lastMonthActual,
          overrideId: null,
        },
      ].sort(
        (left, right) =>
          Number(right.amount) - Number(left.amount) ||
          left.bucket.localeCompare(right.bucket)
      )
    );
  };

  const refreshBudgetPageData = async () => {
    await mutate();
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Badge variant="secondary">Budget Builder</Badge>
          <div>
            <div className="font-semibold text-3xl tracking-tight">
              Monthly budget + category budgets
            </div>
            <div className="mt-1 max-w-2xl text-muted-foreground text-sm leading-6">
              Set the overall monthly budget and income you want to track
              toward, then allocate only the categories you care about. The
              remainder becomes the catch-all budget for everything else.
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{data.snapshotStatus}</Badge>
          <Button asChild type="button" variant="outline">
            <Link href={`/?projectId=${data.projectId}`}>
              <ArrowLeft className="size-4" />
              Back to project
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Card className="border-0 bg-slate-950 text-white shadow-lg">
            <CardHeader className="space-y-2">
              <CardTitle className="text-xl">Monthly targets</CardTitle>
              <div className="text-slate-300 text-sm leading-6">
                These are user-owned targets, separate from the last{" "}
                {FINANCE_RECOMMENDATION_LOOKBACK_MONTHS} months of spending
                recommendations.
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label
                  className="text-slate-200"
                  htmlFor="total-monthly-budget-target"
                >
                  Total monthly budget
                </Label>
                <Input
                  className="border-white/10 bg-white/10 text-white placeholder:text-slate-400"
                  id="total-monthly-budget-target"
                  min="0"
                  onChange={(event) =>
                    setTotalMonthlyBudgetTarget(event.target.value)
                  }
                  placeholder="6500"
                  step="1"
                  type="number"
                  value={totalMonthlyBudgetTarget}
                />
              </div>

              <div className="space-y-2">
                <Label
                  className="text-slate-200"
                  htmlFor="total-monthly-income-target"
                >
                  Total monthly income
                </Label>
                <Input
                  className="border-white/10 bg-white/10 text-white placeholder:text-slate-400"
                  id="total-monthly-income-target"
                  min="0"
                  onChange={(event) =>
                    setTotalMonthlyIncomeTarget(event.target.value)
                  }
                  placeholder="9000"
                  step="1"
                  type="number"
                  value={totalMonthlyIncomeTarget}
                />
              </div>

              <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-300">Category budgets set</span>
                  <span className="font-medium">
                    {formatCurrency(draftCategoryBudgetTotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-300">Catch-all budget</span>
                  <span className="font-medium">
                    {formatSignedCurrency(projectedCatchAllBudget)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-300">Target monthly net</span>
                  <span className="font-medium">
                    {formatSignedCurrency(targetNet)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Card>
              <CardContent className="flex items-start gap-3 p-4">
                <Wallet className="mt-0.5 size-5 text-slate-500" />
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                    Monthly budget
                  </div>
                  <div className="mt-1 font-semibold text-2xl">
                    {formatCurrency(
                      data.cashFlowSummary.totalMonthlyBudgetTarget
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-start gap-3 p-4">
                <TrendingUp className="mt-0.5 size-5 text-slate-500" />
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                    Monthly income
                  </div>
                  <div className="mt-1 font-semibold text-2xl">
                    {formatCurrency(
                      data.cashFlowSummary.totalMonthlyIncomeTarget
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-start gap-3 p-4">
                <PiggyBank className="mt-0.5 size-5 text-slate-500" />
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                    Category budgets
                  </div>
                  <div className="mt-1 font-semibold text-2xl">
                    {formatCurrency(data.cashFlowSummary.categoryBudgetTotal)}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-start gap-3 p-4">
                <Target className="mt-0.5 size-5 text-slate-500" />
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                    {FINANCE_RECOMMENDATION_LOOKBACK_MONTHS}-mo suggested pace
                  </div>
                  <div className="mt-1 font-semibold text-2xl">
                    {formatCurrency(data.suggestedCategoryBudgetTotal)}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="grid gap-3 p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Historical spend</span>
                <span className="font-medium">
                  {formatCurrency(
                    data.cashFlowSummary.historicalAverageMonthlySpend
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Historical income</span>
                <span className="font-medium">
                  {formatCurrency(
                    data.cashFlowSummary.historicalAverageMonthlyIncome
                  )}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-0 bg-gradient-to-br from-stone-50 to-white shadow-sm">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-2xl">Category budgets</CardTitle>
                  <div className="mt-1 text-muted-foreground text-sm leading-6">
                    Add the categories you want to budget directly. Everything
                    else rolls into the catch-all budget automatically.
                  </div>
                </div>
                <Badge variant="secondary">
                  {categoryBudgets.length} active{" "}
                  {categoryBudgets.length === 1 ? "budget" : "budgets"}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="space-y-3">
                {categoryBudgets.length === 0 ? (
                  <div className="rounded-2xl border border-dashed bg-background/70 px-4 py-8 text-center text-muted-foreground text-sm">
                    No category budgets yet. Add one manually or start from a
                    suggestion below.
                  </div>
                ) : (
                  categoryBudgets.map((budget) => (
                    <div
                      className="grid gap-3 rounded-2xl border bg-background/80 p-4 md:grid-cols-[minmax(0,1fr)_160px_auto]"
                      key={`${budget.bucket}-${budget.overrideId ?? "draft"}`}
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium text-base">
                            {budget.bucket}
                          </div>
                          <Badge
                            className={getGroupBadgeClass(budget.group)}
                            variant="outline"
                          >
                            {getGroupLabel(budget.group)}
                          </Badge>
                        </div>
                        <div className="text-muted-foreground text-sm">
                          Last month: {formatCurrency(budget.lastMonthActual)}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label
                          className="text-muted-foreground text-xs uppercase tracking-[0.2em]"
                          htmlFor={`category-budget-${budget.bucket}`}
                        >
                          Monthly budget
                        </Label>
                        <Input
                          id={`category-budget-${budget.bucket}`}
                          min="0"
                          onChange={(event) =>
                            setCategoryBudgets((current) =>
                              current.map((item) =>
                                item.bucket === budget.bucket
                                  ? {
                                      ...item,
                                      amount: event.target.value,
                                    }
                                  : item
                              )
                            )
                          }
                          step="1"
                          type="number"
                          value={budget.amount}
                        />
                      </div>

                      <div className="flex items-end justify-end">
                        <Button
                          onClick={() =>
                            setCategoryBudgets((current) =>
                              current.filter(
                                (item) => item.bucket !== budget.bucket
                              )
                            )
                          }
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="rounded-2xl border bg-background/80 p-4">
                <div className="mb-3">
                  <div className="font-medium">Add a category budget</div>
                  <div className="text-muted-foreground text-sm">
                    Create a brand-new category or add something that does not
                    show up in the suggestions yet.
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
                  <Input
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    placeholder="Category name"
                    value={newCategoryName}
                  />
                  <Input
                    min="0"
                    onChange={(event) =>
                      setNewCategoryAmount(event.target.value)
                    }
                    placeholder="Monthly budget"
                    step="1"
                    type="number"
                    value={newCategoryAmount}
                  />
                  <Button
                    disabled={addCategoryDisabled}
                    onClick={handleAddCategory}
                    type="button"
                  >
                    <Plus className="size-4" />
                    Add category
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Sparkles className="size-4 text-amber-500" />
                  <div className="font-medium">Suggested categories</div>
                  <div className="text-muted-foreground text-sm">
                    Pulled from the last{" "}
                    {FINANCE_RECOMMENDATION_LOOKBACK_MONTHS} months of spending
                    so you can add them in one click.
                  </div>
                </div>

                {availableSuggestions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed bg-background/70 px-4 py-6 text-muted-foreground text-sm">
                    {data.snapshotStatus === "ready"
                      ? "All current category suggestions are already in the budget."
                      : "Suggestions will appear after finance onboarding has enough spending history."}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {availableSuggestions.map((suggestion) => (
                      <div
                        className="grid gap-3 rounded-2xl border bg-background/80 p-4 md:grid-cols-[minmax(0,1fr)_140px_auto]"
                        key={suggestion.bucket}
                      >
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-medium">
                              {suggestion.bucket}
                            </div>
                            <Badge
                              className={getGroupBadgeClass(suggestion.group)}
                              variant="outline"
                            >
                              {getGroupLabel(suggestion.group)}
                            </Badge>
                          </div>
                          <div className="text-muted-foreground text-sm">
                            Last month:{" "}
                            {formatCurrency(suggestion.lastMonthActual)}
                          </div>
                        </div>

                        <div className="flex items-center justify-start font-medium text-sm md:justify-end">
                          {formatCurrency(suggestion.suggestedAmount)}
                        </div>

                        <div className="flex items-center justify-end">
                          <Button
                            onClick={() => handleAddSuggestion(suggestion)}
                            type="button"
                            variant="outline"
                          >
                            <Plus className="size-4" />
                            Add
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {topLevelValidationError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm">
                  Budget and income targets must be non-negative numbers.
                </div>
              ) : null}

              {invalidCategoryBudget ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm">
                  Every category budget needs a name and a non-negative monthly
                  value.
                </div>
              ) : null}

              {duplicateCategoryBudget ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm">
                  Category budgets must use unique names.
                </div>
              ) : null}

              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-muted-foreground text-sm leading-6">
                  Use this page for the default monthly budget setup and budget
                  exclusions. Categorization rules now live in their own project
                  sidebar link.
                </div>

                <Button
                  disabled={hasValidationError || isSaving}
                  onClick={handleSave}
                >
                  {isSaving ? "Saving..." : "Save budget builder"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <BudgetExclusionsManager
            onFinanceDataChanged={refreshBudgetPageData}
            projectId={data.projectId}
          />
        </div>
      </div>
    </div>
  );
}
