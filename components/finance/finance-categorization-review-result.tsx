"use client";

import { CheckIcon, CircleIcon, ShieldXIcon } from "lucide-react";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { toast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  FinanceCategorizationReview,
  FinanceCategorizationRuleSuggestion,
  FinanceCategorizationTransactionSuggestion,
} from "@/lib/finance/categorization-review-shared";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function StatusBadge({ status }: { status: "accepted" | "denied" | null }) {
  if (!status) {
    return null;
  }

  return (
    <Badge
      className={
        status === "accepted"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700"
      }
      variant="outline"
    >
      {status === "accepted" ? "Saved" : "Denied"}
    </Badge>
  );
}

export function FinanceCategorizationReviewResult({
  result,
}: {
  result: FinanceCategorizationReview;
}) {
  const { mutate } = useSWRConfig();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRuleIds, setSelectedRuleIds] = useState(
    new Set(result.suggestedRules.map((rule) => rule.id))
  );
  const [transactionOverrides, setTransactionOverrides] = useState<
    Record<string, boolean>
  >({});
  const [savedStatuses, setSavedStatuses] = useState<
    Record<string, "accepted" | "denied">
  >({});

  const unsavedRules = result.suggestedRules.filter(
    (rule) => !savedStatuses[rule.key]
  );
  const unsavedTransactions = result.suggestedTransactions.filter(
    (transaction) => !savedStatuses[transaction.key]
  );

  const isRuleSelected = (ruleId: string) => selectedRuleIds.has(ruleId);
  const isTransactionSelected = (
    transaction: FinanceCategorizationTransactionSuggestion
  ) => {
    const override = transactionOverrides[transaction.id];

    if (typeof override === "boolean") {
      return override;
    }

    return transaction.matchingRuleIds.some((ruleId) =>
      selectedRuleIds.has(ruleId)
    );
  };

  const selectedRules = unsavedRules.filter((rule) => isRuleSelected(rule.id));
  const selectedTransactions = unsavedTransactions.filter((transaction) =>
    isTransactionSelected(transaction)
  );

  const updateSavedStatuses = (
    items: Array<
      | FinanceCategorizationRuleSuggestion
      | FinanceCategorizationTransactionSuggestion
    >,
    status: "accepted" | "denied"
  ) => {
    setSavedStatuses((current) => ({
      ...current,
      ...Object.fromEntries(items.map((item) => [item.key, status])),
    }));
  };

  const submitSelections = async (mode: "accept" | "deny") => {
    if (selectedRules.length === 0 && selectedTransactions.length === 0) {
      toast({
        type: "error",
        description: `Select at least one ${
          mode === "accept" ? "suggestion to save" : "suggestion to deny"
        }.`,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(
        `/api/finance/project/${result.projectId}/categorization-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            acceptedRules: mode === "accept" ? selectedRules : [],
            acceptedTransactions: mode === "accept" ? selectedTransactions : [],
            deniedRules: mode === "deny" ? selectedRules : [],
            deniedTransactions: mode === "deny" ? selectedTransactions : [],
          }),
        }
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.cause || payload?.message || "Request failed");
      }

      updateSavedStatuses(
        [...selectedRules, ...selectedTransactions],
        mode === "accept" ? "accepted" : "denied"
      );
      setSelectedRuleIds((current) => {
        const next = new Set(current);

        for (const rule of selectedRules) {
          next.delete(rule.id);
        }

        return next;
      });
      setTransactionOverrides((current) => {
        const next = { ...current };

        for (const transaction of selectedTransactions) {
          delete next[transaction.id];
        }

        return next;
      });
      await mutate(`/api/finance/project/${result.projectId}`);

      toast({
        type: "success",
        description:
          mode === "accept"
            ? "Saved the selected categorization guidance."
            : "Stored the selected denials so they won't be suggested again.",
      });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to save categorization review selections.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (
    result.suggestedRules.length === 0 &&
    result.suggestedTransactions.length === 0
  ) {
    return (
      <div className="space-y-2 p-4 text-sm">
        <div className="font-medium">
          No strong categorization issues found.
        </div>
        <div className="text-muted-foreground">
          Reviewed {result.candidateCount} likely candidates and did not find
          any new high-confidence suggestions.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          {result.suggestedRules.length} rule
          {result.suggestedRules.length === 1 ? "" : "s"}
        </Badge>
        <Badge variant="secondary">
          {result.suggestedTransactions.length} transaction
          {result.suggestedTransactions.length === 1 ? "" : "s"}
        </Badge>
        <Badge variant="outline">
          Reviewed {result.candidateCount} likely candidates
        </Badge>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Suggested Rules</CardTitle>
          <div className="flex gap-2">
            <Button
              onClick={() =>
                setSelectedRuleIds(new Set(unsavedRules.map((rule) => rule.id)))
              }
              size="sm"
              type="button"
              variant="outline"
            >
              Select all
            </Button>
            <Button
              onClick={() => setSelectedRuleIds(new Set())}
              size="sm"
              type="button"
              variant="ghost"
            >
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {result.suggestedRules.map((rule) => {
            const savedStatus = savedStatuses[rule.key] ?? null;
            const isSelected = isRuleSelected(rule.id);

            return (
              <div
                className="space-y-2 rounded-lg border bg-background p-3"
                key={rule.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="font-medium">{rule.summary}</div>
                    <div className="text-muted-foreground">
                      {rule.rationale}
                    </div>
                    {rule.replaceRuleSummary ? (
                      <div className="text-muted-foreground">
                        Updates existing rule: {rule.replaceRuleSummary}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={savedStatus} />
                    <Button
                      disabled={Boolean(savedStatus)}
                      onClick={() =>
                        setSelectedRuleIds((current) => {
                          const next = new Set(current);

                          if (next.has(rule.id)) {
                            next.delete(rule.id);
                          } else {
                            next.add(rule.id);
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
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">
                    {rule.replaceRuleId ? "Rule update" : "New rule"}
                  </Badge>
                  <Badge variant="secondary">
                    {rule.matchedTransactionCount} matched
                  </Badge>
                  <Badge variant="secondary">
                    {formatCurrency(rule.affectedOutflow)} affected
                  </Badge>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Suggested Transactions</CardTitle>
          <div className="flex gap-2">
            <Button
              onClick={() =>
                setTransactionOverrides((current) => ({
                  ...current,
                  ...Object.fromEntries(
                    unsavedTransactions.map((transaction) => [
                      transaction.id,
                      true,
                    ])
                  ),
                }))
              }
              size="sm"
              type="button"
              variant="outline"
            >
              Select all
            </Button>
            <Button
              onClick={() =>
                setTransactionOverrides((current) => ({
                  ...current,
                  ...Object.fromEntries(
                    unsavedTransactions.map((transaction) => [
                      transaction.id,
                      false,
                    ])
                  ),
                }))
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {result.suggestedTransactions.map((transaction) => {
            const savedStatus = savedStatuses[transaction.key] ?? null;
            const isSelected = isTransactionSelected(transaction);
            const coveredBySelectedRule = transaction.matchingRuleIds.some(
              (ruleId) => selectedRuleIds.has(ruleId)
            );

            return (
              <div
                className="space-y-2 rounded-lg border bg-background p-3"
                key={transaction.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="font-medium">{transaction.summary}</div>
                    <div className="text-muted-foreground">
                      {transaction.description}
                    </div>
                    <div className="text-muted-foreground">
                      {transaction.transactionDate} · {transaction.account}
                    </div>
                    <div className="text-muted-foreground">
                      {transaction.rationale}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={savedStatus} />
                    <Button
                      disabled={Boolean(savedStatus)}
                      onClick={() =>
                        setTransactionOverrides((current) => ({
                          ...current,
                          [transaction.id]: !isSelected,
                        }))
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
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">
                    {formatCurrency(transaction.amount)}
                  </Badge>
                  <Badge variant="outline">
                    {transaction.currentBucket} → {transaction.suggestedBucket}
                  </Badge>
                  {coveredBySelectedRule && (
                    <Badge
                      className="border-blue-200 bg-blue-50 text-blue-700"
                      variant="outline"
                    >
                      Covered by selected rule
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={isSubmitting}
          onClick={() => submitSelections("accept")}
          type="button"
        >
          {isSubmitting
            ? "Saving..."
            : `Save selected (${selectedRules.length + selectedTransactions.length})`}
        </Button>
        <Button
          disabled={isSubmitting}
          onClick={() => submitSelections("deny")}
          type="button"
          variant="outline"
        >
          <ShieldXIcon className="mr-1 size-4" />
          {isSubmitting
            ? "Saving..."
            : `Deny selected (${selectedRules.length + selectedTransactions.length})`}
        </Button>
      </div>
    </div>
  );
}
