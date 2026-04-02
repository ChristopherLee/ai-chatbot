"use client";

import {
  ArrowLeft,
  BookOpenText,
  CalendarDays,
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type {
  FinanceAction,
  FinanceRuleRecord,
  FinanceRulesViewData,
} from "@/lib/finance/types";
import { categorizationRuleTypes as categorizationRuleTypesList } from "@/lib/finance/types";
import { cn, fetcher } from "@/lib/utils";
import { FinanceRuleEditorDialog } from "./finance-rule-editor-dialog";
import { FinanceRulesTransactionTable } from "./finance-rules-transaction-table";

const ruleTypeLabels: Record<FinanceAction["type"], string> = {
  categorize_transaction: "Single transaction",
  categorize_transactions: "Categorization rule",
  exclude_transactions: "Budget exclusion",
  merge_buckets: "Bucket merge",
  remap_raw_category: "Raw category rule",
  rename_bucket: "Bucket rename",
  set_bucket_monthly_target: "Category budget",
  set_plan_mode: "Plan mode",
};

const categorizationRuleTypes = new Set<FinanceAction["type"]>(
  categorizationRuleTypesList
);

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function FinanceRuleCard({
  rule,
  onDelete,
  onEdit,
}: {
  rule: FinanceRuleRecord;
  onDelete: (rule: FinanceRuleRecord) => void;
  onEdit: (rule: FinanceRuleRecord) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const detailSummary = `${rule.details.length} ${
    rule.details.length === 1 ? "detail" : "details"
  }`;
  const transactionSummary =
    rule.type === "set_plan_mode"
      ? "No linked transactions"
      : `${rule.totalAffectedTransactions} matching ${
          rule.totalAffectedTransactions === 1 ? "transaction" : "transactions"
        }`;

  return (
    <Collapsible onOpenChange={setIsExpanded} open={isExpanded}>
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{ruleTypeLabels[rule.type]}</Badge>
                <Badge variant="outline">
                  <CalendarDays className="mr-1 size-3.5" />
                  {formatTimestamp(rule.createdAt)}
                </Badge>
                {rule.matchedTransactions !== null ? (
                  <Badge
                    className="border-blue-200 bg-blue-50 text-blue-700"
                    variant="outline"
                  >
                    {rule.matchedTransactions} matched
                  </Badge>
                ) : null}
                {rule.affectedOutflow !== null ? (
                  <Badge
                    className="border-emerald-200 bg-emerald-50 text-emerald-700"
                    variant="outline"
                  >
                    {formatCurrency(rule.affectedOutflow)} affected
                  </Badge>
                ) : null}
              </div>

              <div className="space-y-2">
                <CardTitle className="text-lg">{rule.summary}</CardTitle>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-sm">
                  <span>{detailSummary}</span>
                  <span>{transactionSummary}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <CollapsibleTrigger asChild>
                <Button size="sm" type="button" variant="secondary">
                  <span>{isExpanded ? "Hide details" : "Show details"}</span>
                  <ChevronDown
                    className={cn(
                      "size-4 transition-transform",
                      isExpanded ? "rotate-180" : undefined
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
              <Button
                onClick={() => onEdit(rule)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Pencil className="size-4" />
                Edit
              </Button>
              <Button
                onClick={() => onDelete(rule)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent
          asChild
          className="overflow-hidden outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2"
        >
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-2">
              {rule.details.map((detail) => (
                <div
                  className="rounded-xl border bg-background p-3"
                  key={`${rule.id}-${detail.label}`}
                >
                  <div className="text-muted-foreground text-xs uppercase tracking-wide">
                    {detail.label}
                  </div>
                  <div className="mt-1 font-medium leading-6">
                    {detail.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-sm">Affected transactions</div>
                <Badge variant="outline">
                  {rule.totalAffectedTransactions} currently visible to this
                  rule
                </Badge>
              </div>
              <FinanceRulesTransactionTable
                emptyLabel={
                  rule.type === "set_plan_mode"
                    ? "Plan mode changes do not map to individual transactions."
                    : "No transactions currently match this rule."
                }
                preview={rule}
              />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function FinanceRulesView({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle: string | null;
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
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<FinanceRuleRecord | null>(
    null
  );
  const [rulePendingDelete, setRulePendingDelete] =
    useState<FinanceRuleRecord | null>(null);

  const sortedRules = useMemo(
    () =>
      [...(data?.rules ?? [])]
        .filter((rule) => categorizationRuleTypes.has(rule.type))
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime()
        ),
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
      toast({
        type: "success",
        description: "Categorization rule deleted.",
      });
    } catch (deleteError) {
      toast({
        type: "error",
        description:
          deleteError instanceof Error
            ? deleteError.message
            : "Failed to delete the categorization rule.",
      });
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-2 py-1.5 backdrop-blur md:px-2">
        <SidebarToggle />

        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-sm">
            {projectTitle ?? "Categorization rules"}
          </div>
          <div className="truncate text-muted-foreground text-xs">
            Categorization rules
          </div>
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
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
          <section className="rounded-2xl border bg-muted/30 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {sortedRules.length} active{" "}
                    {sortedRules.length === 1 ? "rule" : "rules"}
                  </Badge>
                  {projectTitle ? (
                    <Badge variant="outline">{projectTitle}</Badge>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <h1 className="font-semibold text-2xl tracking-tight">
                    Categorization rules
                  </h1>
                  <p className="max-w-2xl text-muted-foreground text-sm leading-6">
                    Manage category mappings, bucket naming, and merge logic
                    from one place. Budget exclusions and monthly budgets now
                    live on the budget page.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-muted-foreground text-sm">
                  <BookOpenText className="size-4" />
                  Dedicated categorization view
                </div>
                <Button onClick={openAddDialog} type="button">
                  <Plus className="size-4" />
                  Add categorization rule
                </Button>
              </div>
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
                  Add your first categorization rule to shape bucket mapping,
                  raw category remaps, and bucket naming from here.
                </div>
                <Button onClick={openAddDialog} type="button">
                  <Plus className="size-4" />
                  Add categorization rule
                </Button>
              </CardContent>
            </Card>
          ) : (
            sortedRules.map((rule) => (
              <FinanceRuleCard
                key={rule.id}
                onDelete={(selectedRule) => setRulePendingDelete(selectedRule)}
                onEdit={openEditDialog}
                rule={rule}
              />
            ))
          )}
        </div>
      </div>

      <FinanceRuleEditorDialog
        allowedTypes={categorizationRuleTypesList}
        copy={{
          createSubmitLabel: "Add categorization rule",
          createSuccess: "Categorization rule added.",
          createTitle: "Add categorization rule",
          description:
            "Preview the current impact before saving so you can verify which transactions are affected.",
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
            <AlertDialogTitle>Delete categorization rule?</AlertDialogTitle>
            <AlertDialogDescription>
              {rulePendingDelete
                ? `This will remove "${rulePendingDelete.summary}" from the saved finance plan.`
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
