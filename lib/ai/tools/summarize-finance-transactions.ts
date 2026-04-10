import { tool } from "ai";
import { withToolErrorLogging } from "@/lib/ai/logging";
import { financeTransactionSummaryInputSchema } from "@/lib/finance/summarize-transactions";
import { summarizeFinanceTransactionsForChat } from "@/lib/finance/tool-execution";

export const summarizeFinanceTransactions = ({
  projectId,
}: {
  projectId: string;
}) =>
  tool({
    description: `Summarize transactions for the current finance project into grouped aggregates.

Set representation to "raw" when you need baseline categories before user-created overrides, or "budget" when you need totals as currently represented in the budget.

Use this when the user wants totals or trends by month, category, raw category, merchant, or account, but you do not need transaction-by-transaction rows.
This is read-only and does not change the plan.`,
    inputSchema: financeTransactionSummaryInputSchema,
    execute: withToolErrorLogging({
      toolName: "summarizeFinanceTransactions",
      context: { projectId },
      execute: (input) =>
        summarizeFinanceTransactionsForChat({
          projectId,
          ...input,
        }),
    }),
  });
