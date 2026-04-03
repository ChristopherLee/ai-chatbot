import { tool } from "ai";
import { z } from "zod";
import { withToolErrorLogging } from "@/lib/ai/logging";
import { applyFinanceActionsForChat } from "@/lib/finance/tool-execution";
import { financeActionsSchema } from "@/lib/finance/types";

const approvalRequiredActionTypes = new Set([
  "categorize_transaction",
  "categorize_transactions",
]);

export const applyFinanceActions = ({ projectId }: { projectId: string }) =>
  tool({
    description: `Apply one or more finance plan changes for the current project.

Use this when the user clearly asks to change the plan, such as:
- excluding transactions from the budget
- categorizing matching transactions into a category
- categorizing a specific transaction into a category
- changing a category budget
- switching plan mode

You can also use this to present strong categorization suggestions for user approval.
Categorization actions may require approval before anything is persisted.

Keep the source match, source category, and target category aligned with the user's request.
Never substitute a different merchant, raw category, or destination category just because it seems more plausible or already exists.
If the user asks for Furniture, do not change the target to Electronics.

If the user asks to rename or merge categories, do not invent a removed action type. Explain that reusable rules now work by categorizing source transactions into the destination category and by adjusting category budgets separately.

Do not call this tool if the request is ambiguous or if you cannot represent the requested source and destination exactly. Ask a follow-up question instead.`,
    inputSchema: z.object({
      actions: financeActionsSchema.min(1).max(6),
    }),
    needsApproval: ({ actions }) =>
      actions.some((action) => approvalRequiredActionTypes.has(action.type)),
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
