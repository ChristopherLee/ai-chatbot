import { tool } from "ai";
import { z } from "zod";
import { withToolErrorLogging } from "@/lib/ai/logging";
import { getFinanceCategorizationMemory } from "@/lib/finance/categorization-review";

export const getFinanceCategorizationMemoryTool = ({
  projectId,
}: {
  projectId: string;
}) =>
  tool({
    description: `Read accepted categorization rules, one-off transaction overrides, and explicitly denied categorization guidance for the current finance project.

Use this before proposing new categorization rules when prior accepted or denied guidance may affect the answer.`,
    inputSchema: z.object({}),
    execute: withToolErrorLogging({
      toolName: "getFinanceCategorizationMemory",
      context: { projectId },
      execute: () => getFinanceCategorizationMemory({ projectId }),
    }),
  });
