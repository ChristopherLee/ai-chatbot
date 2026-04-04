"use client";

import {
  ArrowUpDown,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FinanceTransactionQueryInput } from "@/lib/finance/query-transactions";
import type {
  FinanceTransactionExclusionSource,
  FinanceTransactionsViewData,
} from "@/lib/finance/transactions-view";
import { cn, fetcher } from "@/lib/utils";

type TransactionRow = FinanceTransactionsViewData["transactions"][number];
type TransactionSortKey = FinanceTransactionQueryInput["sortBy"];
type TransactionSortDirection = FinanceTransactionQueryInput["sortDirection"];

type PendingDialogAction =
  | {
      type: "exclude";
      transaction: TransactionRow;
    }
  | {
      type: "delete";
      transaction: TransactionRow;
    };

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function defaultFilters(): FinanceTransactionQueryInput {
  return {
    page: 1,
    sortBy: "date",
    sortDirection: "desc",
  };
}

function getDefaultSortDirection(
  sortKey: TransactionSortKey
): TransactionSortDirection {
  return sortKey === "date" || sortKey === "amount" ? "desc" : "asc";
}

function buildTransactionsKey({
  filters,
  projectId,
}: {
  filters: FinanceTransactionQueryInput;
  projectId: string;
}) {
  const params = new URLSearchParams();

  if (filters.search) {
    params.set("search", filters.search);
  }

  if (filters.category) {
    params.set("category", filters.category);
  }

  if (filters.account) {
    params.set("account", filters.account);
  }

  if (typeof filters.includeFlag === "boolean") {
    params.set("includeFlag", String(filters.includeFlag));
  }

  if (filters.startDate) {
    params.set("startDate", filters.startDate);
  }

  if (filters.endDate) {
    params.set("endDate", filters.endDate);
  }

  params.set("page", String(filters.page));
  params.set("sortBy", filters.sortBy);
  params.set("sortDirection", filters.sortDirection);

  const query = params.toString();
  return query
    ? `/api/finance/project/${projectId}/transactions?${query}`
    : `/api/finance/project/${projectId}/transactions`;
}

function getExclusionSourceLabel(source: FinanceTransactionExclusionSource) {
  switch (source) {
    case "default":
      return "Default rule";
    case "transaction":
      return "This transaction only";
    default:
      return "Reusable rule";
  }
}

function getStatusVariant(transaction: TransactionRow) {
  return transaction.includeFlag ? "secondary" : "outline";
}

function SortableHeader({
  activeSortBy,
  activeSortDirection,
  align = "left",
  label,
  onSortChange,
  sortKey,
}: {
  activeSortBy: TransactionSortKey;
  activeSortDirection: TransactionSortDirection;
  align?: "left" | "right";
  label: string;
  onSortChange: (sortKey: TransactionSortKey) => void;
  sortKey: TransactionSortKey;
}) {
  const isActive = activeSortBy === sortKey;

  return (
    <Button
      className={cn(
        "h-auto w-full gap-1 px-0 py-0 font-medium text-muted-foreground text-xs uppercase tracking-[0.18em] hover:bg-transparent hover:text-foreground",
        align === "right" ? "justify-end" : "justify-start"
      )}
      onClick={() => onSortChange(sortKey)}
      type="button"
      variant="ghost"
    >
      <span>{label}</span>
      {isActive ? (
        activeSortDirection === "asc" ? (
          <ChevronUp className="size-3.5" />
        ) : (
          <ChevronDown className="size-3.5" />
        )
      ) : (
        <ArrowUpDown className="size-3.5 opacity-60" />
      )}
    </Button>
  );
}

function PaginationControls({
  canGoNext,
  canGoPrevious,
  disabled,
  onPageChange,
  page,
  totalPages,
}: {
  canGoNext: boolean;
  canGoPrevious: boolean;
  disabled: boolean;
  onPageChange: (page: number) => void;
  page: number;
  totalPages: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        disabled={disabled || !canGoPrevious}
        onClick={() => onPageChange(1)}
        size="sm"
        type="button"
        variant="outline"
      >
        <ChevronsLeft className="size-4" />
        First
      </Button>
      <Button
        disabled={disabled || !canGoPrevious}
        onClick={() => onPageChange(page - 1)}
        size="sm"
        type="button"
        variant="outline"
      >
        Previous
      </Button>
      <div className="min-w-28 text-center text-muted-foreground text-sm">
        Page {page.toLocaleString()} of {totalPages.toLocaleString()}
      </div>
      <Button
        disabled={disabled || !canGoNext}
        onClick={() => onPageChange(page + 1)}
        size="sm"
        type="button"
        variant="outline"
      >
        Next
      </Button>
      <Button
        disabled={disabled || !canGoNext}
        onClick={() => onPageChange(totalPages)}
        size="sm"
        type="button"
        variant="outline"
      >
        Last
        <ChevronsRight className="size-4" />
      </Button>
    </div>
  );
}

export function ProjectTransactions({
  initialData,
}: {
  initialData: FinanceTransactionsViewData;
}) {
  const { mutate: mutateGlobal } = useSWRConfig();
  const [search, setSearch] = useState(initialData.filters.search ?? "");
  const [category, setCategory] = useState(
    initialData.filters.category ?? "all"
  );
  const [account, setAccount] = useState(initialData.filters.account ?? "all");
  const [includeStatus, setIncludeStatus] = useState<
    "all" | "included" | "excluded"
  >(
    typeof initialData.filters.includeFlag === "boolean"
      ? initialData.filters.includeFlag
        ? "included"
        : "excluded"
      : "all"
  );
  const [startDate, setStartDate] = useState(
    initialData.filters.startDate ?? ""
  );
  const [endDate, setEndDate] = useState(initialData.filters.endDate ?? "");
  const [page, setPage] = useState(initialData.summary.page);
  const [sortBy, setSortBy] = useState<TransactionSortKey>(
    initialData.filters.sortBy
  );
  const [sortDirection, setSortDirection] = useState<TransactionSortDirection>(
    initialData.filters.sortDirection
  );
  const [pendingDialogAction, setPendingDialogAction] =
    useState<PendingDialogAction | null>(null);
  const [activeTransactionId, setActiveTransactionId] = useState<string | null>(
    null
  );

  const deferredSearch = useDeferredValue(search.trim());
  const filters = useMemo<FinanceTransactionQueryInput>(
    () => ({
      search: deferredSearch || undefined,
      category: category === "all" ? undefined : category,
      account: account === "all" ? undefined : account,
      includeFlag:
        includeStatus === "all" ? undefined : includeStatus === "included",
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page,
      sortBy,
      sortDirection,
    }),
    [
      account,
      category,
      deferredSearch,
      endDate,
      includeStatus,
      page,
      sortBy,
      sortDirection,
      startDate,
    ]
  );
  const requestKey = useMemo(
    () =>
      buildTransactionsKey({
        filters,
        projectId: initialData.projectId,
      }),
    [filters, initialData.projectId]
  );
  const { data, isLoading, isValidating, mutate } =
    useSWR<FinanceTransactionsViewData>(requestKey, fetcher, {
      fallbackData: initialData,
    });

  useEffect(() => {
    if (data && page !== data.summary.page) {
      setPage(data.summary.page);
    }
  }, [data, page]);

  if (!data) {
    return null;
  }

  const refreshProjectFinanceData = async () => {
    await Promise.all([
      mutate(),
      mutateGlobal(`/api/finance/project/${data.projectId}`),
      mutateGlobal(`/api/finance/project/${data.projectId}/targets`),
      mutateGlobal(`/api/finance/project/${data.projectId}/rules`),
    ]);
  };

  const runMutation = async ({
    operation,
    transaction,
  }: {
    operation: "exclude" | "include" | "delete";
    transaction: TransactionRow;
  }) => {
    setActiveTransactionId(transaction.id);

    try {
      const response = await fetch(
        `/api/finance/project/${data.projectId}/transactions/${transaction.id}`,
        {
          method: operation === "delete" ? "DELETE" : "PATCH",
          headers:
            operation === "delete"
              ? undefined
              : {
                  "Content-Type": "application/json",
                },
          body:
            operation === "delete" ? undefined : JSON.stringify({ operation }),
        }
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.cause || payload?.message || "Request failed");
      }

      await refreshProjectFinanceData();
      setPendingDialogAction(null);
      toast({
        type: "success",
        description:
          operation === "delete"
            ? "Transaction deleted."
            : operation === "exclude"
              ? "Transaction excluded from the budget."
              : "Transaction added back to the budget.",
      });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update the transaction.",
      });
    } finally {
      setActiveTransactionId(null);
    }
  };

  const resetFilters = () => {
    const defaults = defaultFilters();
    setSearch("");
    setCategory("all");
    setAccount("all");
    setIncludeStatus("all");
    setStartDate("");
    setEndDate("");
    setPage(defaults.page);
    setSortBy(defaults.sortBy);
    setSortDirection(defaults.sortDirection);
  };

  const handleSortChange = (nextSortBy: TransactionSortKey) => {
    if (sortBy === nextSortBy) {
      setSortDirection((currentDirection) =>
        currentDirection === "asc" ? "desc" : "asc"
      );
    } else {
      setSortBy(nextSortBy);
      setSortDirection(getDefaultSortDirection(nextSortBy));
    }

    setPage(1);
  };

  const handlePageChange = (nextPage: number) => {
    if (
      nextPage < 1 ||
      nextPage > data.summary.totalPages ||
      nextPage === page
    ) {
      return;
    }

    setPage(nextPage);
  };

  const isRefreshing = isLoading || isValidating;

  return (
    <>
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-semibold text-3xl tracking-tight">
            Transactions
          </h1>
          {isRefreshing ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" />
              Updating
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm md:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="transactions-search">Search</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    id="transactions-search"
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Merchant, description, category, account..."
                    value={search}
                  />
                </div>
              </div>

              <Button
                className="shrink-0"
                onClick={resetFilters}
                type="button"
                variant="outline"
              >
                <RotateCcw className="size-4" />
                Reset filters
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-2">
                <Label htmlFor="transactions-category">Category</Label>
                <Select
                  onValueChange={(value) => {
                    setCategory(value);
                    setPage(1);
                  }}
                  value={category}
                >
                  <SelectTrigger id="transactions-category">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {data.options.categories.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="transactions-account">Account</Label>
                <Select
                  onValueChange={(value) => {
                    setAccount(value);
                    setPage(1);
                  }}
                  value={account}
                >
                  <SelectTrigger id="transactions-account">
                    <SelectValue placeholder="All accounts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All accounts</SelectItem>
                    {data.options.accounts.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="transactions-status">Budget status</Label>
                <Select
                  onValueChange={(value) => {
                    setIncludeStatus(value as typeof includeStatus);
                    setPage(1);
                  }}
                  value={includeStatus}
                >
                  <SelectTrigger id="transactions-status">
                    <SelectValue placeholder="All transactions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All transactions</SelectItem>
                    <SelectItem value="included">Included only</SelectItem>
                    <SelectItem value="excluded">Excluded only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="transactions-start-date">From</Label>
                <Input
                  id="transactions-start-date"
                  max={endDate || undefined}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    setPage(1);
                  }}
                  type="date"
                  value={startDate}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="transactions-end-date">To</Label>
                <Input
                  id="transactions-end-date"
                  min={startDate || undefined}
                  onChange={(event) => {
                    setEndDate(event.target.value);
                    setPage(1);
                  }}
                  type="date"
                  value={endDate}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border bg-card/60 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1 text-sm">
            <div className="font-medium">
              {data.summary.matchedCount === 0
                ? "No transactions match the current filters."
                : `Showing ${data.summary.startIndex.toLocaleString()}-${data.summary.endIndex.toLocaleString()} of ${data.summary.matchedCount.toLocaleString()} transactions`}
            </div>
            <div className="text-muted-foreground">
              {data.summary.matchedIncludedCount.toLocaleString()} included,{" "}
              {data.summary.matchedExcludedCount.toLocaleString()} excluded
              {data.options.dateRange
                ? ` across ${data.options.dateRange.start} to ${data.options.dateRange.end}`
                : ""}
            </div>
          </div>

          <PaginationControls
            canGoNext={data.summary.hasNextPage}
            canGoPrevious={data.summary.hasPreviousPage}
            disabled={isRefreshing}
            onPageChange={handlePageChange}
            page={data.summary.page}
            totalPages={data.summary.totalPages}
          />
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-3">
                    <SortableHeader
                      activeSortBy={sortBy}
                      activeSortDirection={sortDirection}
                      label="Date"
                      onSortChange={handleSortChange}
                      sortKey="date"
                    />
                  </th>
                  <th className="px-4 py-3">
                    <SortableHeader
                      activeSortBy={sortBy}
                      activeSortDirection={sortDirection}
                      label="Description"
                      onSortChange={handleSortChange}
                      sortKey="description"
                    />
                  </th>
                  <th className="px-4 py-3">
                    <SortableHeader
                      activeSortBy={sortBy}
                      activeSortDirection={sortDirection}
                      label="Account"
                      onSortChange={handleSortChange}
                      sortKey="account"
                    />
                  </th>
                  <th className="px-4 py-3">
                    <SortableHeader
                      activeSortBy={sortBy}
                      activeSortDirection={sortDirection}
                      label="Category"
                      onSortChange={handleSortChange}
                      sortKey="category"
                    />
                  </th>
                  <th className="px-4 py-3">
                    <SortableHeader
                      activeSortBy={sortBy}
                      activeSortDirection={sortDirection}
                      label="Status"
                      onSortChange={handleSortChange}
                      sortKey="status"
                    />
                  </th>
                  <th className="px-4 py-3">
                    <SortableHeader
                      activeSortBy={sortBy}
                      activeSortDirection={sortDirection}
                      align="right"
                      label="Amount"
                      onSortChange={handleSortChange}
                      sortKey="amount"
                    />
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-10 text-center text-muted-foreground"
                      colSpan={7}
                    >
                      No transactions matched those filters.
                    </td>
                  </tr>
                ) : (
                  data.transactions.map((transaction) => {
                    const isBusy = activeTransactionId === transaction.id;
                    const disableExclude = !transaction.includeFlag;
                    const canInclude = Boolean(transaction.oneOffExcludeRuleId);

                    return (
                      <tr className="border-t align-top" key={transaction.id}>
                        <td className="whitespace-nowrap px-4 py-4">
                          {transaction.transactionDate}
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-medium">
                            {transaction.description}
                          </div>
                          <div className="mt-1 text-muted-foreground text-xs">
                            {transaction.merchant}
                          </div>
                        </td>
                        <td className="px-4 py-4">{transaction.account}</td>
                        <td className="px-4 py-4">{transaction.category}</td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={getStatusVariant(transaction)}>
                              {transaction.includeFlag
                                ? "Included"
                                : "Excluded"}
                            </Badge>
                            {!transaction.includeFlag &&
                            transaction.exclusionSource ? (
                              <Badge variant="outline">
                                {getExclusionSourceLabel(
                                  transaction.exclusionSource
                                )}
                              </Badge>
                            ) : null}
                          </div>
                          {!transaction.includeFlag &&
                          transaction.exclusionReason ? (
                            <div className="mt-1 text-muted-foreground text-xs">
                              {transaction.exclusionReason}
                            </div>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-right font-medium">
                          {formatCurrency(transaction.amount)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            {canInclude ? (
                              <Button
                                disabled={isBusy}
                                onClick={() =>
                                  runMutation({
                                    operation: "include",
                                    transaction,
                                  })
                                }
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                {isBusy ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : null}
                                Re-include
                              </Button>
                            ) : (
                              <Button
                                disabled={disableExclude || isBusy}
                                onClick={() =>
                                  setPendingDialogAction({
                                    type: "exclude",
                                    transaction,
                                  })
                                }
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Exclude
                              </Button>
                            )}
                            <Button
                              disabled={isBusy}
                              onClick={() =>
                                setPendingDialogAction({
                                  type: "delete",
                                  transaction,
                                })
                              }
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <PaginationControls
          canGoNext={data.summary.hasNextPage}
          canGoPrevious={data.summary.hasPreviousPage}
          disabled={isRefreshing}
          onPageChange={handlePageChange}
          page={data.summary.page}
          totalPages={data.summary.totalPages}
        />
      </div>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingDialogAction(null);
          }
        }}
        open={Boolean(pendingDialogAction)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDialogAction?.type === "delete"
                ? "Delete transaction?"
                : "Exclude transaction from the budget?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDialogAction?.type === "delete"
                ? "This permanently removes the transaction from the project and deletes any one-off overrides tied to it."
                : "This saves a one-off exclusion so this transaction stops counting toward the budget while the rest of the dataset stays intact."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(activeTransactionId)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(activeTransactionId) || !pendingDialogAction}
              onClick={() => {
                if (!pendingDialogAction) {
                  return;
                }

                runMutation({
                  operation:
                    pendingDialogAction.type === "delete"
                      ? "delete"
                      : "exclude",
                  transaction: pendingDialogAction.transaction,
                });
              }}
            >
              {activeTransactionId ? "Working..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
