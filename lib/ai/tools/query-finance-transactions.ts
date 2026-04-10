import { tool } from "ai";
import { withToolErrorLogging } from "@/lib/ai/logging";
import { financeTransactionQueryInputSchema } from "@/lib/finance/query-transactions";
import { queryFinanceTransactionsForChat } from "@/lib/finance/tool-execution";

export const queryFinanceTransactions = ({
  projectId,
}: {
  projectId: string;
}) =>
  tool({
    description: `Query transactions for the current finance project using filters like keyword search, merchant, description, raw category, current category, account, include flag, date range, or amount range.

Set representation to "raw" when you need baseline categories before user-created overrides, or "budget" when you need transactions as currently represented in the budget.

Use this when the user asks to find, search, inspect, or audit transactions in more detail than the finance snapshot provides.
This is read-only and does not change the plan.`,
    inputSchema: financeTransactionQueryInputSchema,
    execute: withToolErrorLogging({
      toolName: "queryFinanceTransactions",
      context: { projectId },
      execute: (input) =>
        queryFinanceTransactionsForChat({
          projectId,
          ...input,
        }),
    }),
  });
