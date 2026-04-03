"use client";

import type {
  FinanceRulePreview,
  FinanceRuleRecord,
} from "@/lib/finance/types";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

type RuleTransactionPreview = Pick<
  FinanceRulePreview,
  | "affectedTransactions"
  | "affectedTransactionsTruncated"
  | "totalAffectedTransactions"
> &
  Pick<
    FinanceRuleRecord,
    | "affectedTransactions"
    | "affectedTransactionsTruncated"
    | "totalAffectedTransactions"
  >;

export function FinanceRulesTransactionTable({
  emptyLabel,
  preview,
}: {
  emptyLabel: string;
  preview: RuleTransactionPreview;
}) {
  if (preview.affectedTransactions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-muted-foreground text-sm">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-muted-foreground text-xs">
        Showing {preview.affectedTransactions.length} of{" "}
        {preview.totalAffectedTransactions} matching transactions
        {preview.affectedTransactionsTruncated ? "." : "."}
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Included</th>
              <th className="px-3 py-2 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {preview.affectedTransactions.map((transaction) => (
              <tr className="border-t" key={transaction.id}>
                <td className="px-3 py-2">{transaction.transactionDate}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{transaction.description}</div>
                  <div className="text-muted-foreground text-xs">
                    {transaction.rawCategory} | {transaction.merchant}
                  </div>
                </td>
                <td className="px-3 py-2">{transaction.account}</td>
                <td className="px-3 py-2">{transaction.category}</td>
                <td className="px-3 py-2">
                  {transaction.includeFlag ? "Yes" : "No"}
                </td>
                <td className="px-3 py-2 font-medium">
                  {formatCurrency(transaction.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
