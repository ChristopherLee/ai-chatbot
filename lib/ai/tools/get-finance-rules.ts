import { tool } from "ai";
import { z } from "zod";
import { withToolErrorLogging } from "@/lib/ai/logging";
import { getFinanceRulesForChat } from "@/lib/finance/tool-execution";

export const getFinanceRulesTool = ({ projectId }: { projectId: string }) =>
  tool({
    description: `Read the current finance rules and overrides for the active project.

Use this when you need to inspect saved categorization rules, exclusions, category budget overrides, plan mode changes, or the available accounts, raw categories, and categories already present in the project.
This is read-only and does not change the plan.`,
    inputSchema: z.object({}),
    execute: withToolErrorLogging({
      toolName: "getFinanceRules",
      context: { projectId },
      execute: () => getFinanceRulesForChat({ projectId }),
    }),
  });
