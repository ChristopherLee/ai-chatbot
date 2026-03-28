import { tool } from "ai";
import { z } from "zod";
import { withToolErrorLogging } from "@/lib/ai/logging";
import { applyFinanceActionsForChat } from "@/lib/finance/tool-execution";
import { financeActionsSchema } from "@/lib/finance/types";

export const applyFinanceActions = ({ projectId }: { projectId: string }) =>
  tool({
    description: `Apply one or more finance plan changes for the current project.

Use this when the user clearly asks to change the plan, such as:
- excluding or including transactions
- remapping categories
- categorizing matching transactions into a bucket
- categorizing a specific transaction into a bucket
- merging or renaming buckets
- changing a bucket monthly budget
- switching plan mode

Do not call this tool if the request is ambiguous. Ask a follow-up question instead.`,
    inputSchema: z.object({
      actions: financeActionsSchema.min(1).max(6),
    }),
    execute: withToolErrorLogging({
      toolName: "applyFinanceActions",
      context: { projectId },
      execute: ({ actions }) =>
        applyFinanceActionsForChat({
          projectId,
          actions,
        }),
    }),
  });
