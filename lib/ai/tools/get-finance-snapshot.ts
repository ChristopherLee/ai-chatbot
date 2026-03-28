import { tool } from "ai";
import { z } from "zod";
import { withToolErrorLogging } from "@/lib/ai/logging";
import { getFinanceSnapshotForChat } from "@/lib/finance/tool-execution";

export const getFinanceSnapshotTool = ({ projectId }: { projectId: string }) =>
  tool({
    description: `Fetch the current finance snapshot for the active project.

Use this when you need the full dashboard data currently shown in the finance side panel,
including summary cards, charts, bucket drilldowns, transaction highlights, and applied overrides.`,
    inputSchema: z.object({}),
    execute: withToolErrorLogging({
      toolName: "getFinanceSnapshot",
      context: { projectId },
      execute: async () => {
        return getFinanceSnapshotForChat({ projectId });
      },
    }),
  });
