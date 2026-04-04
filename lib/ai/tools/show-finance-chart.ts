import { tool } from "ai";
import { withToolErrorLogging } from "@/lib/ai/logging";
import {
  getFinanceOverridesByProjectId,
  getTransactionsByProjectId,
} from "@/lib/db/finance-queries";
import {
  buildFinanceChart,
  financeChartInputSchema,
} from "@/lib/finance/chart-visualization";
import { categorizeTransactions } from "@/lib/finance/categorize";
import { getFinanceActionsFromOverrides } from "@/lib/finance/overrides";
import { getFinanceSnapshot } from "@/lib/finance/snapshot";

export const showFinanceChart = ({ projectId }: { projectId: string }) =>
  tool({
    description: `Render a finance chart directly in the chat for the current project.

Use this when the user asks to visualize spend over time, compare the current month to last month, see a monthly spending breakdown by category, or view a Sankey of income flowing into expense categories.

Available chart types:
- monthly-spend: monthly actual spend vs target
- cumulative-spend: cumulative actual spend vs target pace
- month-over-month: current month vs previous month by category
- spending-breakdown: current month spending mix by category
- income-to-expenses: Sankey view of income sources flowing into expense categories`,
    inputSchema: financeChartInputSchema,
    execute: withToolErrorLogging({
      toolName: "showFinanceChart",
      context: { projectId },
      execute: async (input) => {
        const [snapshot, transactions, overrides] = await Promise.all([
          getFinanceSnapshot({ projectId }),
          getTransactionsByProjectId({ projectId }),
          getFinanceOverridesByProjectId({ projectId }),
        ]);
        const categorizedTransactions = categorizeTransactions({
          transactions,
          actions: getFinanceActionsFromOverrides(overrides),
        });

        return buildFinanceChart({
          snapshot,
          input,
          transactions: categorizedTransactions,
        });
      },
    }),
  });
