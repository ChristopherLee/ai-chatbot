import type { FinanceCategoryCard } from "@/lib/finance/types";

export function TransactionTable({
  transactions,
}: {
  transactions: FinanceCategoryCard["transactions"];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-muted/70">
          <tr>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Description</th>
            <th className="px-3 py-2 font-medium">Account</th>
            <th className="px-3 py-2 font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr className="border-t" key={transaction.id}>
              <td className="px-3 py-2">{transaction.transactionDate}</td>
              <td className="px-3 py-2">
                <div className="font-medium">{transaction.description}</div>
                <div className="text-muted-foreground text-xs">
                  {transaction.rawCategory} · {transaction.merchant}
                </div>
              </td>
              <td className="px-3 py-2">{transaction.account}</td>
              <td className="px-3 py-2 font-medium">
                ${transaction.amount.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
