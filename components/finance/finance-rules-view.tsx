"use client";

import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { SidebarToggle } from "@/components/sidebar-toggle";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  describeFinanceRuleAction,
  describeFinanceRuleBehavior,
} from "@/lib/finance/rule-display";
import type {
  FinanceAction,
  FinanceRuleRecord,
  FinanceRulesViewData,
} from "@/lib/finance/types";
import { categorizationRuleTypes as categorizationRuleTypesList } from "@/lib/finance/types";
import { cn, fetcher } from "@/lib/utils";
import { FinanceRuleEditorDialog } from "./finance-rule-editor-dialog";
import { FinanceRulesTransactionTable } from "./finance-rules-transaction-table";

const visibleCategorizationRuleTypes = new Set<FinanceAction["type"]>(
  categorizationRuleTypesList
);

const creatableCategorizationRuleTypes = [
  "categorize_transactions",
] as const satisfies FinanceAction["type"][];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function getMatchLabel(rule: FinanceRuleRecord) {
  const count = rule.matchedTransactions ?? rule.totalAffectedTransactions;

  return `${count} ${count === 1 ? "match" : "matches"}`;
}

function FinanceRuleTableRow({
  rule,
  isExpanded,
  onDelete,
  onEdit,
  onToggle,
}: {
  rule: FinanceRuleRecord;
  isExpanded: boolean;
  onDelete: (rule: FinanceRuleRecord) => void;
  onEdit: (rule: FinanceRuleRecord) => void;
  onToggle: (ruleId: string) => void;
}) {
  const behavior = describeFinanceRuleBehavior(rule.action);

  return (
    <Fragment key={rule.id}>
      <tr className={cn("border-t align-top", isExpanded ? "bg-muted/10" : "")}>
        <td className="px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground text-xs">
              {rule.orderIndex + 1}
            </div>
            <div className="min-w-0 font-medium leading-6">
              {describeFinanceRuleAction(rule.action, rule.details)}
            </div>
          </div>
        </td>
        <td className="px-4 py-4">
          <div className="inline-flex rounded-full border bg-background px-2.5 py-1 font-medium text-xs">
            {getMatchLabel(rule)}
          </div>
          {rule.affectedOutflow !== null ? (
            <div className="mt-1 text-muted-foreground text-xs">
              {formatCurrency(rule.affectedOutflow)} affected
            </div>
          ) : null}
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center justify-end gap-1">
            <Button
              aria-label={isExpanded ? "Hide rule details" : "Show rule details"}
              onClick={() => onToggle(rule.id)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <ChevronDown
                className={cn(
                  "size-4 transition-transform",
                  isExpanded ? "rotate-180" : undefined
                )}
              />
            </Button>
            <Button
              aria-label="Edit rule"
              onClick={() => onEdit(rule)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              aria-label="Delete rule"
              onClick={() => onDelete(rule)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </td>
      </tr>

      {isExpanded ? (
        <tr className="border-t bg-muted/5">
          <td className="px-4 pb-4 pt-1" colSpan={3}>
            <div className="space-y-4 rounded-xl border bg-background/80 p-4">
              {behavior ? (
                <p className="text-muted-foreground text-sm leading-6">
                  {behavior}
                </p>
              ) : null}

              {rule.details.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {rule.details.map((detail) => (
                    <div
                      className="rounded-full border bg-background px-3 py-1.5 text-xs"
                      key={`${rule.id}-${detail.label}-${detail.value}`}
                    >
                      <span className="text-muted-foreground">
                        {detail.label}:
                      </span>{" "}
                      <span className="font-medium">{detail.value}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              <FinanceRulesTransactionTable
                emptyLabel="No transactions currently match this rule."
                preview={rule}
              />
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

export function FinanceRulesView({
  projectId,
}: {
  projectId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { mutate } = useSWRConfig();

  const rulesKey = `/api/finance/project/${projectId}/rules`;
  const snapshotKey = `/api/finance/project/${projectId}`;
  const { data, error, isLoading } = useSWR<FinanceRulesViewData>(
    rulesKey,
    fetcher
  );
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<FinanceRuleRecord | null>(
    null
  );
  const [rulePendingDelete, setRulePendingDelete] =
    useState<FinanceRuleRecord | null>(null);

  const sortedRules = useMemo(
    () =>
      [...(data?.rules ?? [])]
        .filter((rule) => visibleCategorizationRuleTypes.has(rule.type))
        .sort((left, right) => left.orderIndex - right.orderIndex),
    [data?.rules]
  );

  const handleBackToChat = () => {
    const params = new URLSearchParams(searchParams.toString());

    params.delete("view");

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const openAddDialog = () => {
    setEditingRule(null);
    setIsEditorOpen(true);
  };

  const openEditDialog = (rule: FinanceRuleRecord) => {
    setEditingRule(rule);
    setIsEditorOpen(true);
  };

  const handleDeleteRule = async () => {
    if (!rulePendingDelete) {
      return;
    }

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

      await Promise.all([mutate(rulesKey), mutate(snapshotKey)]);
      setRulePendingDelete(null);
      setExpandedRuleId((current) =>
        current === rulePendingDelete.id ? null : current
      );
      toast({
        type: "success",
        description: "Rule deleted.",
      });
    } catch (deleteError) {
      toast({
        type: "error",
        description:
          deleteError instanceof Error
            ? deleteError.message
            : "Failed to delete the rule.",
      });
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-2 py-1.5 backdrop-blur md:px-2">
        <SidebarToggle />

        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-sm">Categorization rules</div>
        </div>

        <Button
          className="h-8 gap-2 px-2 md:h-fit"
          onClick={handleBackToChat}
          type="button"
          variant="outline"
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Back to chat</span>
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 md:p-6">
          <section className="rounded-2xl border bg-muted/30 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {sortedRules.length} active{" "}
                    {sortedRules.length === 1 ? "rule" : "rules"}
                  </Badge>
                </div>

                <div className="space-y-1">
                  <h1 className="font-semibold text-2xl tracking-tight">
                    Categorization rules
                  </h1>
                  <p className="max-w-3xl text-muted-foreground text-sm leading-6">
                    This page is for reusable categorization rules only. Match
                    merchants, descriptions, raw categories, or accounts, then
                    send every match into the right destination category.
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Rules run top to bottom in the order shown.
                  </p>
                </div>
              </div>

              <Button onClick={openAddDialog} type="button">
                <Plus className="size-4" />
                Add rule
              </Button>
            </div>
          </section>

          {isLoading && !data ? (
            <Card>
              <CardContent className="flex items-center gap-3 p-6 text-muted-foreground text-sm">
                <Loader2 className="size-4 animate-spin" />
                Loading categorization rules...
              </CardContent>
            </Card>
          ) : error ? (
            <Card>
              <CardContent className="p-6 text-destructive text-sm">
                Unable to load categorization rules right now.
              </CardContent>
            </Card>
          ) : sortedRules.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-start gap-3 p-6 text-sm">
                <div className="font-medium">No categorization rules yet</div>
                <div className="text-muted-foreground leading-6">
                  Add your first saved rule to match merchants, descriptions,
                  raw categories, or accounts and categorize those transactions
                  automatically.
                </div>
                <Button onClick={openAddDialog} type="button">
                  <Plus className="size-4" />
                  Add rule
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-hidden rounded-2xl border bg-card">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-[0.18em]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Rule</th>
                      <th className="w-40 px-4 py-3 font-medium">Impact</th>
                      <th className="w-32 px-4 py-3 text-right font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRules.map((rule) => (
                      <FinanceRuleTableRow
                        isExpanded={expandedRuleId === rule.id}
                        key={rule.id}
                        onDelete={(selectedRule) =>
                          setRulePendingDelete(selectedRule)
                        }
                        onEdit={openEditDialog}
                        onToggle={(ruleId) =>
                          setExpandedRuleId((current) =>
                            current === ruleId ? null : ruleId
                          )
                        }
                        rule={rule}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <FinanceRuleEditorDialog
        allowedTypes={creatableCategorizationRuleTypes}
        copy={{
          createSubmitLabel: "Add rule",
          createSuccess: "Categorization rule added.",
          createTitle: "Add categorization rule",
          description:
            "Save a categorization rule here, then preview the transactions it currently touches before you apply it.",
          editSuccess: "Categorization rule updated.",
          editTitle: "Edit categorization rule",
        }}
        defaultType="categorize_transactions"
        onOpenChange={(open) => {
          setIsEditorOpen(open);

          if (!open) {
            setEditingRule(null);
          }
        }}
        onSaved={() =>
          Promise.all([mutate(rulesKey), mutate(snapshotKey)]).then(
            () => undefined
          )
        }
        open={isEditorOpen}
        options={data?.options}
        projectId={projectId}
        rule={editingRule}
      />

      <AlertDialog
        onOpenChange={(open) => !open && setRulePendingDelete(null)}
        open={Boolean(rulePendingDelete)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved rule?</AlertDialogTitle>
            <AlertDialogDescription>
              {rulePendingDelete
                ? `This will remove ${describeFinanceRuleAction(rulePendingDelete.action, rulePendingDelete.details)} from the saved finance plan.`
                : "This rule will be removed from the saved finance plan."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRule}>
              Delete rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
