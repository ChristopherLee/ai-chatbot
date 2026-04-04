import { tool } from "ai";
import { z } from "zod";
import { withToolErrorLogging } from "@/lib/ai/logging";
import { getFinanceBudgetTargetsForChat } from "@/lib/finance/tool-execution";

export const getFinanceBudgetTargetsTool = ({
  projectId,
}: {
  projectId: string;
}) =>
  tool({
    description: `Read the current finance budget settings for the active project.

Use this when you need the user's total monthly budget or income targets, current category budgets, catch-all budget, suggested category budgets, or current plan mode.
This is read-only and does not change the plan.`,
    inputSchema: z.object({}),
    execute: withToolErrorLogging({
      toolName: "getFinanceBudgetTargets",
      context: { projectId },
      execute: () => getFinanceBudgetTargetsForChat({ projectId }),
    }),
  });
