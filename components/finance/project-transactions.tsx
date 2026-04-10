"use client";

import {
  ArrowUpDown,
  Check,
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
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FinanceTransactionQueryInput } from "@/lib/finance/query-transactions";
import { describeFinanceRuleAction } from "@/lib/finance/rule-display";
import type {
  FinanceTransactionExclusionSource,
  FinanceTransactionsViewData,
} from "@/lib/finance/transactions-view";
import type { FinanceTransactionCategoryChangePreview } from "@/lib/finance/types";
import { cn, fetcher } from "@/lib/utils";
import { FinanceRulesTransactionTable } from "./finance-rules-transaction-table";

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

type PendingCategoryChange = {
  transaction: TransactionRow;
  nextCategory: string;
  preview: FinanceTransactionCategoryChangePreview | null;
  previewError: string | null;
  isPreviewLoading: boolean;
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

function SearchableCategoryPicker({
  categories,
  disabled = false,
  onSelectCategory,
  value,
}: {
  categories: string[];
  disabled?: boolean;
  onSelectCategory: (category: string) => void;
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const filteredCategories = useMemo(() => {
    const normalizedSearchValue = searchValue.trim().toLowerCase();

    if (!normalizedSearchValue) {
      return categories;
    }

    return categories.filter((category) =>
      category.toLowerCase().includes(normalizedSearchValue)
    );
  }, [categories, searchValue]);

  useEffect(() => {
    if (!isOpen) {
      setSearchValue("");
    }
  }, [isOpen]);

  return (
    <Popover modal={false} onOpenChange={setIsOpen} open={isOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={isOpen}
          className="h-9 min-w-44 justify-between font-normal"
          disabled={disabled}
          role="combobox"
          type="button"
          variant="outline"
        >
          <span className="truncate">{value}</span>
          <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(24rem,calc(100vw-2rem))] p-0"
        collisionPadding={16}
      >
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            onValueChange={setSearchValue}
            placeholder="Search categories..."
            value={searchValue}
          />
          <CommandList className="max-h-[min(18rem,var(--radix-popover-content-available-height))]">
            <CommandEmpty>No categories found.</CommandEmpty>
            {filteredCategories.map((category) => (
              <CommandItem
                className="justify-between gap-3"
                key={category}
                onSelect={() => {
                  setIsOpen(false);

                  if (category !== value) {
                    onSelectCategory(category);
                  }
                }}
                value={category}
              >
                <span className="truncate">{category}</span>
                <Check
                  className={cn(
                    "size-4 shrink-0",
                    category === value ? "opacity-100" : "opacity-0"
                  )}
                />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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
  const [pendingCategoryChange, setPendingCategoryChange] =
    useState<PendingCategoryChange | null>(null);
  const [activeTransactionId, setActiveTransactionId] = useState<string | null>(
    null
  );
  const [activeCategorySaveMode, setActiveCategorySaveMode] = useState<
    "transaction" | "rule" | null
  >(null);

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

  const previewCategoryChange = async ({
    nextCategory,
    transaction,
  }: {
    nextCategory: string;
    transaction: TransactionRow;
  }) => {
    if (nextCategory === transaction.category) {
      return;
    }

    setPendingCategoryChange({
      transaction,
      nextCategory,
      preview: null,
      previewError: null,
      isPreviewLoading: true,
    });

    try {
      const response = await fetch(
        `/api/finance/project/${data.projectId}/transactions/${transaction.id}/category-preview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            category: nextCategory,
          }),
        }
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.cause || payload?.message || "Request failed");
      }

      setPendingCategoryChange((current) => {
        if (
          !current ||
          current.transaction.id !== transaction.id ||
          current.nextCategory !== nextCategory
        ) {
          return current;
        }

        return {
          ...current,
          preview: payload satisfies FinanceTransactionCategoryChangePreview,
          previewError: null,
          isPreviewLoading: false,
        };
      });
    } catch (error) {
      setPendingCategoryChange((current) => {
        if (
          !current ||
          current.transaction.id !== transaction.id ||
          current.nextCategory !== nextCategory
        ) {
          return current;
        }

        return {
          ...current,
          previewError:
            error instanceof Error
              ? error.message
              : "Unable to preview the category change.",
          isPreviewLoading: false,
        };
      });
    }
  };

  const saveCategoryChange = async ({
    applySuggestedRule,
    transaction,
  }: {
    applySuggestedRule: boolean;
    transaction: PendingCategoryChange;
  }) => {
    setActiveTransactionId(transaction.transaction.id);
    setActiveCategorySaveMode(applySuggestedRule ? "rule" : "transaction");

    try {
      const response = await fetch(
        `/api/finance/project/${data.projectId}/transactions/${transaction.transaction.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            operation: "categorize",
            category: transaction.nextCategory,
            applySuggestedRule,
          }),
        }
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.cause || payload?.message || "Request failed");
      }

      await refreshProjectFinanceData();
      setPendingCategoryChange(null);
      toast({
        type: "success",
        description:
          payload?.savedAs === "rule"
            ? "Updated the category and saved the recurring rule."
            : "Updated the category for this transaction.",
      });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update the transaction category.",
      });
    } finally {
      setActiveCategorySaveMode(null);
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
                        <td className="px-4 py-4">
                          <SearchableCategoryPicker
                            categories={data.options.categories}
                            disabled={isBusy}
                            onSelectCategory={(value) =>
                              previewCategoryChange({
                                nextCategory: value,
                                transaction,
                              })
                            }
                            value={transaction.category}
                          />
                        </td>
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

      <Dialog
        onOpenChange={(open) => {
          if (!open && !activeTransactionId) {
            setPendingCategoryChange(null);
          }
        }}
        open={Boolean(pendingCategoryChange)}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Change transaction category?</DialogTitle>
            <DialogDescription>
              Save this as a one-off change, or save the suggested recurring
              rule when the same description pattern looks stable enough.
            </DialogDescription>
          </DialogHeader>

          {pendingCategoryChange ? (
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="font-medium">
                  {pendingCategoryChange.transaction.description}
                </div>
                <div className="mt-1 text-muted-foreground text-sm">
                  {[
                    pendingCategoryChange.transaction.transactionDate,
                    pendingCategoryChange.transaction.account,
                    pendingCategoryChange.transaction.merchant,
                  ].join(" - ")}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <div className="rounded-full border bg-background px-3 py-1.5">
                    Current:{" "}
                    <span className="font-medium">
                      {pendingCategoryChange.preview?.currentCategory ??
                        pendingCategoryChange.transaction.category}
                    </span>
                  </div>
                  <div className="rounded-full border bg-background px-3 py-1.5">
                    New:{" "}
                    <span className="font-medium">
                      {pendingCategoryChange.nextCategory}
                    </span>
                  </div>
                </div>
              </div>

              {pendingCategoryChange.isPreviewLoading ? (
                <div className="flex items-center gap-2 rounded-xl border bg-muted/20 p-4 text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Looking for a recurring rule based on matching descriptions...
                </div>
              ) : pendingCategoryChange.previewError ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">
                  {pendingCategoryChange.previewError}
                </div>
              ) : pendingCategoryChange.preview?.suggestedRule ? (
                <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="font-medium text-sm">
                      Suggested recurring rule
                    </Label>
                    <Badge variant="secondary">Recommended</Badge>
                    {pendingCategoryChange.preview.suggestedRule
                      .replaceRuleId ? (
                      <Badge variant="outline">Updates existing rule</Badge>
                    ) : (
                      <Badge variant="outline">Creates new rule</Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="font-medium">
                      {describeFinanceRuleAction(
                        pendingCategoryChange.preview.suggestedRule.action,
                        pendingCategoryChange.preview.suggestedRule.details
                      )}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {pendingCategoryChange.preview.suggestedRule.rationale}
                    </div>
                    {pendingCategoryChange.preview.suggestedRule
                      .replaceRuleSummary ? (
                      <div className="text-muted-foreground text-sm">
                        This will update:{" "}
                        {
                          pendingCategoryChange.preview.suggestedRule
                            .replaceRuleSummary
                        }
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    {pendingCategoryChange.preview.suggestedRule
                      .matchedTransactions !== null ? (
                      <Badge variant="secondary">
                        {
                          pendingCategoryChange.preview.suggestedRule
                            .matchedTransactions
                        }{" "}
                        matched
                      </Badge>
                    ) : null}
                    {pendingCategoryChange.preview.suggestedRule
                      .affectedOutflow !== null ? (
                      <Badge variant="secondary">
                        {formatCurrency(
                          pendingCategoryChange.preview.suggestedRule
                            .affectedOutflow
                        )}{" "}
                        affected
                      </Badge>
                    ) : null}
                  </div>

                  <FinanceRulesTransactionTable
                    emptyLabel="No matching transactions would be affected."
                    preview={pendingCategoryChange.preview.suggestedRule}
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed bg-muted/10 p-4 text-muted-foreground text-sm">
                  No reliable recurring rule was found from the matching
                  descriptions, so this will be saved as a transaction-only
                  change.
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              disabled={Boolean(activeTransactionId)}
              onClick={() => setPendingCategoryChange(null)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            {pendingCategoryChange ? (
              <Button
                disabled={Boolean(activeTransactionId)}
                onClick={() =>
                  saveCategoryChange({
                    applySuggestedRule: false,
                    transaction: pendingCategoryChange,
                  })
                }
                type="button"
                variant="outline"
              >
                {activeTransactionId &&
                activeCategorySaveMode === "transaction" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save just this transaction"
                )}
              </Button>
            ) : null}
            {pendingCategoryChange?.preview?.suggestedRule ? (
              <Button
                disabled={Boolean(activeTransactionId)}
                onClick={() =>
                  saveCategoryChange({
                    applySuggestedRule: true,
                    transaction: pendingCategoryChange,
                  })
                }
                type="button"
              >
                {activeTransactionId && activeCategorySaveMode === "rule" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : pendingCategoryChange.preview.suggestedRule
                    .replaceRuleId ? (
                  "Save change + update rule"
                ) : (
                  "Save change + recurring rule"
                )}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
