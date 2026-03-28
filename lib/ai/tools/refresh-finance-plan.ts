import { tool } from "ai";
import { z } from "zod";
import { withToolErrorLogging } from "@/lib/ai/logging";
import { refreshFinancePlanForChat } from "@/lib/finance/tool-execution";

export const refreshFinancePlan = ({
  projectId,
}: {
  projectId: string;
}) =>
  tool({
    description: `Recompute the finance snapshot for the current project.

Use this when the user has provided enough onboarding context to generate the first plan,
or when you need a fresh plan after the current dataset and overrides should be recalculated.`,
    inputSchema: z.object({}),
    execute: withToolErrorLogging({
      toolName: "refreshFinancePlan",
      context: { projectId },
      execute: async () => {
        return refreshFinancePlanForChat({ projectId });
      },
    }),
  });
