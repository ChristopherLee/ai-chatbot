import { tool } from "ai";
import { z } from "zod";
import { withToolErrorLogging } from "@/lib/ai/logging";
import { findMiscategorizedTransactions as findMiscategorizedTransactionsForProject } from "@/lib/finance/categorization-review";

export const findMiscategorizedTransactions = ({
  projectId,
  selectedChatModel,
}: {
  projectId: string;
  selectedChatModel: string;
}) =>
  tool({
    description: `Find likely miscategorized transactions and propose reusable categorization rules when possible.

Use this when the user asks to audit the dataset, find miscategorized transactions, or review categorization mistakes.
Prefer this over guessing in prose because it returns saveable rule suggestions and one-off transaction suggestions.`,
    inputSchema: z.object({
      maxRules: z.number().int().min(1).max(8).default(6),
      maxTransactions: z.number().int().min(1).max(16).default(12),
    }),
    execute: withToolErrorLogging({
      toolName: "findMiscategorizedTransactions",
      context: { projectId, selectedChatModel },
      execute: ({ maxRules, maxTransactions }) =>
        findMiscategorizedTransactionsForProject({
          projectId,
          selectedChatModel,
          maxRules,
          maxTransactions,
        }),
    }),
  });
