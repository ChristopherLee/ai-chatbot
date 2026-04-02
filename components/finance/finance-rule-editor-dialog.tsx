"use client";

import { Eye, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  FinanceAction,
  FinanceRulePreview,
  FinanceRuleRecord,
  FinanceRulesViewData,
  FinanceTransactionMatch,
  PlanMode,
} from "@/lib/finance/types";
import {
  describeFinanceRuleAction,
  financeRuleTypeLabels,
} from "@/lib/finance/rule-display";
import { FinanceRulesTransactionTable } from "./finance-rules-transaction-table";

const creatableRuleTypes: Exclude<
  FinanceAction["type"],
  "categorize_transaction"
>[] = [
  "categorize_transactions",
  "exclude_transactions",
  "remap_raw_category",
  "merge_buckets",
  "rename_bucket",
  "set_bucket_monthly_target",
  "set_plan_mode",
];

const defaultDialogCopy = {
  createSubmitLabel: "Add rule",
  createSuccess: "Finance rule added.",
  createTitle: "Add finance rule",
  description:
    "Save categorization logic here, then preview the current impact before you apply it.",
  editSubmitLabel: "Save changes",
  editSuccess: "Finance rule updated.",
  editTitle: "Edit finance rule",
};

type RuleFormState = {
  type: FinanceAction["type"];
  merchant: string;
  descriptionContains: string;
  rawCategory: string;
  account: string;
  destinationBucket: string;
  transactionId: string;
  mergeFrom: string;
  renameFrom: string;
  targetBucket: string;
  amount: string;
  effectiveMonth: string;
  planMode: PlanMode;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function emptyFormState(
  type: FinanceAction["type"] = "categorize_transactions"
): RuleFormState {
  return {
    type,
    merchant: "",
    descriptionContains: "",
    rawCategory: "",
    account: "",
    destinationBucket: "",
    transactionId: "",
    mergeFrom: "",
    renameFrom: "",
    targetBucket: "",
    amount: "",
    effectiveMonth: "",
    planMode: "balanced",
  };
}

function buildPreviewFromRule(rule: FinanceRuleRecord): FinanceRulePreview {
  return {
    summary: rule.summary,
    details: rule.details,
    matchedTransactions: rule.matchedTransactions,
    affectedOutflow: rule.affectedOutflow,
    affectedTransactions: rule.affectedTransactions,
    affectedTransactionsTruncated: rule.affectedTransactionsTruncated,
    totalAffectedTransactions: rule.totalAffectedTransactions,
  };
}

function createFormStateFromRule(rule: FinanceRuleRecord): RuleFormState {
  const action = rule.action;

  switch (action.type) {
    case "categorize_transactions":
      return {
        ...emptyFormState(action.type),
        merchant: action.match.merchant ?? "",
        descriptionContains: action.match.descriptionContains ?? "",
        rawCategory: action.match.rawCategory ?? "",
        account: action.match.account ?? "",
        destinationBucket: action.to,
      };
    case "exclude_transactions":
      return {
        ...emptyFormState(action.type),
        merchant: action.match.merchant ?? "",
        descriptionContains: action.match.descriptionContains ?? "",
        rawCategory: action.match.rawCategory ?? "",
        account: action.match.account ?? "",
      };
    case "remap_raw_category":
      return {
        ...emptyFormState(action.type),
        rawCategory: action.from,
        destinationBucket: action.to,
      };
    case "categorize_transaction":
      return {
        ...emptyFormState(action.type),
        transactionId: action.transactionId,
        destinationBucket: action.to,
      };
    case "merge_buckets":
      return {
        ...emptyFormState(action.type),
        mergeFrom: action.from.join(", "),
        destinationBucket: action.to,
      };
    case "rename_bucket":
      return {
        ...emptyFormState(action.type),
        renameFrom: action.from,
        destinationBucket: action.to,
      };
    case "set_bucket_monthly_target":
      return {
        ...emptyFormState(action.type),
        targetBucket: action.bucket,
        amount: action.amount.toString(),
        effectiveMonth: action.effectiveMonth ?? "",
      };
    case "set_plan_mode":
      return {
        ...emptyFormState(action.type),
        planMode: action.mode,
      };
    default:
      return emptyFormState();
  }
}

function buildMatch(form: RuleFormState): FinanceTransactionMatch | null {
  const match = {
    ...(form.merchant.trim() ? { merchant: form.merchant.trim() } : {}),
    ...(form.descriptionContains.trim()
      ? { descriptionContains: form.descriptionContains.trim() }
      : {}),
    ...(form.rawCategory.trim()
      ? { rawCategory: form.rawCategory.trim() }
      : {}),
    ...(form.account.trim() ? { account: form.account.trim() } : {}),
  };

  return Object.keys(match).length > 0
    ? (match as FinanceTransactionMatch)
    : null;
}

function buildAction(form: RuleFormState) {
  const match = buildMatch(form);

  switch (form.type) {
    case "categorize_transactions":
      if (!match || !form.destinationBucket.trim()) {
        return {
          action: null,
          error: "Add at least one match and a destination category.",
        };
      }

      return {
        action: {
          type: "categorize_transactions",
          match,
          to: form.destinationBucket.trim(),
        } satisfies FinanceAction,
        error: null,
      };
    case "exclude_transactions":
      if (!match) {
        return {
          action: null,
          error: "Add at least one match condition.",
        };
      }

      return {
        action: {
          type: "exclude_transactions",
          match,
        } satisfies FinanceAction,
        error: null,
      };
    case "remap_raw_category":
      if (!form.rawCategory.trim() || !form.destinationBucket.trim()) {
        return {
          action: null,
          error: "Choose the raw category and destination category.",
        };
      }

      return {
        action: {
          type: "remap_raw_category",
          from: form.rawCategory.trim(),
          to: form.destinationBucket.trim(),
        } satisfies FinanceAction,
        error: null,
      };
    case "categorize_transaction":
      if (!form.transactionId.trim() || !form.destinationBucket.trim()) {
        return {
          action: null,
          error:
            "This transaction override needs a transaction and destination category.",
        };
      }

      return {
        action: {
          type: "categorize_transaction",
          transactionId: form.transactionId.trim(),
          to: form.destinationBucket.trim(),
        } satisfies FinanceAction,
        error: null,
      };
    case "merge_buckets": {
      const from = form.mergeFrom
        .split(/,|\n/g)
        .map((value) => value.trim())
        .filter(Boolean);

      if (from.length === 0 || !form.destinationBucket.trim()) {
        return {
          action: null,
          error: "Add at least one source category and a destination category.",
        };
      }

      return {
        action: {
          type: "merge_buckets",
          from,
          to: form.destinationBucket.trim(),
        } satisfies FinanceAction,
        error: null,
      };
    }
    case "rename_bucket":
      if (!form.renameFrom.trim() || !form.destinationBucket.trim()) {
        return {
          action: null,
          error: "Choose both category names.",
        };
      }

      return {
        action: {
          type: "rename_bucket",
          from: form.renameFrom.trim(),
          to: form.destinationBucket.trim(),
        } satisfies FinanceAction,
        error: null,
      };
    case "set_bucket_monthly_target": {
      const amount = Number(form.amount);

      if (!form.targetBucket.trim() || !Number.isFinite(amount) || amount < 0) {
        return {
          action: null,
          error: "Choose a category and a valid non-negative category budget.",
        };
      }

      return {
        action: {
          type: "set_bucket_monthly_target",
          bucket: form.targetBucket.trim(),
          amount,
          ...(form.effectiveMonth
            ? { effectiveMonth: form.effectiveMonth }
            : {}),
        } satisfies FinanceAction,
        error: null,
      };
    }
    case "set_plan_mode":
      return {
        action: {
          type: "set_plan_mode",
          mode: form.planMode,
        } satisfies FinanceAction,
        error: null,
      };
    default:
      return {
        action: null,
        error: "Choose a supported rule type.",
      };
  }
}

export function FinanceRuleEditorDialog({
  allowedTypes,
  copy,
  defaultType,
  onOpenChange,
  onSaved,
  open,
  options,
  projectId,
  rule,
}: {
  allowedTypes?: readonly FinanceAction["type"][];
  copy?: Partial<typeof defaultDialogCopy>;
  defaultType?: FinanceAction["type"];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
  open: boolean;
  options: FinanceRulesViewData["options"] | undefined;
  projectId: string;
  rule: FinanceRuleRecord | null;
}) {
  const dialogCopy = {
    ...defaultDialogCopy,
    ...copy,
  };
  const normalizedAllowedTypes = allowedTypes ?? creatableRuleTypes;
  const [form, setForm] = useState<RuleFormState>(emptyFormState());
  const [preview, setPreview] = useState<FinanceRulePreview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const editableTypes = useMemo(
    (): FinanceAction["type"][] =>
      form.type === "categorize_transaction"
        ? ["categorize_transaction", ...normalizedAllowedTypes]
        : [...normalizedAllowedTypes],
    [form.type, normalizedAllowedTypes]
  );
  const draftActionResult = useMemo(() => buildAction(form), [form]);
  const showTypeSelector = editableTypes.length > 1;

  useEffect(() => {
    if (!open) {
      return;
    }

    if (rule) {
      setForm(createFormStateFromRule(rule));
      setPreview(buildPreviewFromRule(rule));
      return;
    }

    setForm(
      emptyFormState(
        defaultType ?? normalizedAllowedTypes[0] ?? "categorize_transactions"
      )
    );
    setPreview(null);
  }, [defaultType, normalizedAllowedTypes, open, rule]);

  const updateForm = (patch: Partial<RuleFormState>) => {
    setForm((current) => ({
      ...current,
      ...patch,
    }));
    setPreview(null);
  };

  const handlePreview = async () => {
    const { action, error } = draftActionResult;

    if (!action) {
      toast({
        type: "error",
        description: error ?? "Complete the rule first.",
      });
      return;
    }

    setIsPreviewing(true);

    try {
      const response = await fetch(
        `/api/finance/project/${projectId}/rules/preview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            ...(rule ? { replaceRuleId: rule.id } : {}),
          }),
        }
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.cause || payload?.message || "Request failed");
      }

      setPreview(payload satisfies FinanceRulePreview);
    } catch (previewError) {
      toast({
        type: "error",
        description:
          previewError instanceof Error
            ? previewError.message
            : "Failed to preview the rule.",
      });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSave = async () => {
    const { action, error } = draftActionResult;

    if (!action) {
      toast({
        type: "error",
        description: error ?? "Complete the rule first.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(
        rule
          ? `/api/finance/project/${projectId}/rules/${rule.id}`
          : `/api/finance/project/${projectId}/rules`,
        {
          method: rule ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        }
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.cause || payload?.message || "Request failed");
      }

      await onSaved();
      onOpenChange(false);
      toast({
        type: "success",
        description: rule ? dialogCopy.editSuccess : dialogCopy.createSuccess,
      });
    } catch (saveError) {
      toast({
        type: "error",
        description:
          saveError instanceof Error
            ? saveError.message
            : "Failed to save the finance rule.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {rule ? dialogCopy.editTitle : dialogCopy.createTitle}
          </DialogTitle>
          <DialogDescription>{dialogCopy.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {showTypeSelector ? (
            <div className="space-y-2">
              <Label htmlFor="finance-rule-type">Rule format</Label>
              <Select
                onValueChange={(value) =>
                  updateForm({
                    ...emptyFormState(value as FinanceAction["type"]),
                    type: value as FinanceAction["type"],
                    ...(value === "categorize_transaction" &&
                    rule?.action.type === "categorize_transaction"
                      ? { transactionId: rule.action.transactionId }
                      : {}),
                  })
                }
                value={form.type}
              >
                <SelectTrigger id="finance-rule-type">
                  <SelectValue placeholder="Select how this rule should work" />
                </SelectTrigger>
                <SelectContent>
                  {editableTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {financeRuleTypeLabels[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {form.type === "categorize_transactions" ||
          form.type === "exclude_transactions" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="finance-rule-merchant">Merchant contains</Label>
                <Input
                  id="finance-rule-merchant"
                  onChange={(event) =>
                    updateForm({ merchant: event.target.value })
                  }
                  placeholder="Amazon"
                  value={form.merchant}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="finance-rule-description">
                  Description contains
                </Label>
                <Input
                  id="finance-rule-description"
                  onChange={(event) =>
                    updateForm({ descriptionContains: event.target.value })
                  }
                  placeholder="membership"
                  value={form.descriptionContains}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="finance-rule-raw-category">Raw category</Label>
                <Input
                  id="finance-rule-raw-category"
                  list="finance-rule-raw-categories"
                  onChange={(event) =>
                    updateForm({ rawCategory: event.target.value })
                  }
                  placeholder="Restaurants"
                  value={form.rawCategory}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="finance-rule-account">Account</Label>
                <Input
                  id="finance-rule-account"
                  list="finance-rule-accounts"
                  onChange={(event) =>
                    updateForm({ account: event.target.value })
                  }
                  placeholder="Checking"
                  value={form.account}
                />
              </div>
              {form.type === "categorize_transactions" ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="finance-rule-destination">
                    Destination category
                  </Label>
                  <Input
                    id="finance-rule-destination"
                    list="finance-rule-buckets"
                    onChange={(event) =>
                      updateForm({ destinationBucket: event.target.value })
                    }
                    placeholder="Mortgage"
                    value={form.destinationBucket}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {form.type === "remap_raw_category" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="finance-rule-remap-from">Raw category</Label>
                <Input
                  id="finance-rule-remap-from"
                  list="finance-rule-raw-categories"
                  onChange={(event) =>
                    updateForm({ rawCategory: event.target.value })
                  }
                  placeholder="Restaurants"
                  value={form.rawCategory}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="finance-rule-remap-to">
                  Destination category
                </Label>
                <Input
                  id="finance-rule-remap-to"
                  list="finance-rule-buckets"
                  onChange={(event) =>
                    updateForm({ destinationBucket: event.target.value })
                  }
                  placeholder="Dining"
                  value={form.destinationBucket}
                />
              </div>
            </div>
          ) : null}

          {form.type === "categorize_transaction" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="finance-rule-transaction-id">Transaction</Label>
                <Input
                  id="finance-rule-transaction-id"
                  onChange={(event) =>
                    updateForm({ transactionId: event.target.value })
                  }
                  readOnly
                  value={form.transactionId}
                />
                <div className="text-muted-foreground text-xs">
                  Transaction-specific overrides can be retargeted here.
                  Creating brand-new one-off overrides manually is still read
                  only for now.
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="finance-rule-single-to">
                  Destination category
                </Label>
                <Input
                  id="finance-rule-single-to"
                  list="finance-rule-buckets"
                  onChange={(event) =>
                    updateForm({ destinationBucket: event.target.value })
                  }
                  placeholder="Mortgage"
                  value={form.destinationBucket}
                />
              </div>
            </div>
          ) : null}

          {form.type === "merge_buckets" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="finance-rule-merge-from">
                  Source categories
                </Label>
                <Textarea
                  id="finance-rule-merge-from"
                  onChange={(event) =>
                    updateForm({ mergeFrom: event.target.value })
                  }
                  placeholder="Dining, Restaurants"
                  value={form.mergeFrom}
                />
                <div className="text-muted-foreground text-xs">
                  Separate multiple categories with commas or new lines.
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="finance-rule-merge-to">
                  Destination category
                </Label>
                <Input
                  id="finance-rule-merge-to"
                  list="finance-rule-buckets"
                  onChange={(event) =>
                    updateForm({ destinationBucket: event.target.value })
                  }
                  placeholder="Dining"
                  value={form.destinationBucket}
                />
              </div>
            </div>
          ) : null}

          {form.type === "rename_bucket" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="finance-rule-rename-from">
                  Current category
                </Label>
                <Input
                  id="finance-rule-rename-from"
                  list="finance-rule-buckets"
                  onChange={(event) =>
                    updateForm({ renameFrom: event.target.value })
                  }
                  placeholder="Other / Misc"
                  value={form.renameFrom}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="finance-rule-rename-to">New category</Label>
                <Input
                  id="finance-rule-rename-to"
                  list="finance-rule-buckets"
                  onChange={(event) =>
                    updateForm({ destinationBucket: event.target.value })
                  }
                  placeholder="Household"
                  value={form.destinationBucket}
                />
              </div>
            </div>
          ) : null}

          {form.type === "set_bucket_monthly_target" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="finance-rule-target-bucket">Bucket</Label>
                <Input
                  id="finance-rule-target-bucket"
                  list="finance-rule-buckets"
                  onChange={(event) =>
                    updateForm({ targetBucket: event.target.value })
                  }
                  placeholder="Groceries"
                  value={form.targetBucket}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="finance-rule-target-amount">
                  Category budget
                </Label>
                <Input
                  id="finance-rule-target-amount"
                  min="0"
                  onChange={(event) =>
                    updateForm({ amount: event.target.value })
                  }
                  placeholder="600"
                  step="1"
                  type="number"
                  value={form.amount}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="finance-rule-effective-month">
                  Effective month
                </Label>
                <Input
                  id="finance-rule-effective-month"
                  onChange={(event) =>
                    updateForm({ effectiveMonth: event.target.value })
                  }
                  type="month"
                  value={form.effectiveMonth}
                />
              </div>
            </div>
          ) : null}

          {form.type === "set_plan_mode" ? (
            <div className="space-y-2">
              <Label htmlFor="finance-rule-plan-mode">Plan mode</Label>
              <Select
                onValueChange={(value) =>
                  updateForm({ planMode: value as RuleFormState["planMode"] })
                }
                value={form.planMode}
              >
                <SelectTrigger id="finance-rule-plan-mode">
                  <SelectValue placeholder="Select a plan mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="balanced">Balanced</SelectItem>
                  <SelectItem value="conservative">Conservative</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isPreviewing}
              onClick={handlePreview}
              type="button"
              variant="outline"
            >
              {isPreviewing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Eye className="size-4" />
              )}
              {isPreviewing ? "Previewing..." : "Preview impact"}
            </Button>
          </div>

          <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium text-sm">Preview</div>
              {preview && preview.matchedTransactions !== null ? (
                <Badge variant="secondary">
                  {preview.matchedTransactions} matched
                </Badge>
              ) : null}
              {preview && preview.affectedOutflow !== null ? (
                <Badge variant="secondary">
                  {formatCurrency(preview.affectedOutflow)} affected
                </Badge>
              ) : null}
            </div>

            {preview ? (
              <>
                <div className="font-medium">
                  {draftActionResult.action
                    ? describeFinanceRuleAction(
                        draftActionResult.action,
                        preview.details
                      )
                    : preview.summary}
                </div>
                {preview.details.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {preview.details.map((detail) => (
                      <div
                        className="rounded-full border bg-background px-3 py-1.5 text-xs"
                        key={`${detail.label}-${detail.value}`}
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
                  emptyLabel="No transactions currently match this draft rule."
                  preview={preview}
                />
              </>
            ) : (
              <div className="text-muted-foreground text-sm">
                Run a preview to inspect the transactions this rule currently
                affects.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
          <Button disabled={isSubmitting} onClick={handleSave} type="button">
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving...
              </>
            ) : rule ? (
              dialogCopy.editSubmitLabel
            ) : (
              dialogCopy.createSubmitLabel
            )}
          </Button>
        </DialogFooter>

        <datalist id="finance-rule-accounts">
          {(options?.accounts ?? []).map((account) => (
            <option key={account} value={account} />
          ))}
        </datalist>
        <datalist id="finance-rule-raw-categories">
          {(options?.rawCategories ?? []).map((rawCategory) => (
            <option key={rawCategory} value={rawCategory} />
          ))}
        </datalist>
        <datalist id="finance-rule-buckets">
          {(options?.buckets ?? []).map((bucket) => (
            <option key={bucket} value={bucket} />
          ))}
        </datalist>
      </DialogContent>
    </Dialog>
  );
}
