import { tool } from "ai";
import { withToolErrorLogging } from "@/lib/ai/logging";
import {
  buildFinanceChart,
  financeChartInputSchema,
} from "@/lib/finance/chart-visualization";
import { getFinanceSnapshot } from "@/lib/finance/snapshot";

export const showFinanceChart = ({ projectId }: { projectId: string }) =>
  tool({
    description: `Render a finance chart directly in the chat for the current project.

Use this when the user asks to visualize spend over time, compare the current month to last month, or see a monthly spending breakdown by bucket.

Available chart types:
- monthly-spend: monthly actual spend vs target
- cumulative-spend: cumulative actual spend vs target pace
- month-over-month: current month vs previous month by bucket
- spending-breakdown: current month spending mix by bucket`,
    inputSchema: financeChartInputSchema,
    execute: withToolErrorLogging({
      toolName: "showFinanceChart",
      context: { projectId },
      execute: async (input) => {
        const snapshot = await getFinanceSnapshot({ projectId });

        return buildFinanceChart({
          snapshot,
          input,
        });
      },
    }),
  });
