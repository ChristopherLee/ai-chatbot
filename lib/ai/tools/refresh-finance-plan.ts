import { tool } from "ai";
import { z } from "zod";
import { withToolErrorLogging } from "@/lib/ai/logging";
import { refreshFinancePlanForChat } from "@/lib/finance/tool-execution";

export const refreshFinancePlan = ({ projectId }: { projectId: string }) =>
  tool({
    description: `Recompute the finance plan and latest snapshot for the active project.

Use this when the dataset is loaded but the plan is stale, missing, or the user has
provided enough onboarding context to generate the first plan.`,
    inputSchema: z.object({}),
    execute: withToolErrorLogging({
      toolName: "refreshFinancePlan",
      context: { projectId },
      execute: async () => {
        return refreshFinancePlanForChat({ projectId });
      },
    }),
  });
