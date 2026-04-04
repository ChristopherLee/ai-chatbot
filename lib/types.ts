import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { ArtifactKind } from "@/components/artifact";
import type { applyFinanceActions } from "./ai/tools/apply-finance-actions";
import type { createDocument } from "./ai/tools/create-document";
import type { findMiscategorizedTransactions } from "./ai/tools/find-miscategorized-transactions";
import type { getFinanceBudgetTargetsTool } from "./ai/tools/get-finance-budget-targets";
import type { getFinanceCategorizationMemoryTool } from "./ai/tools/get-finance-categorization-memory";
import type { getFinanceRulesTool } from "./ai/tools/get-finance-rules";
import type { getFinanceSnapshotTool } from "./ai/tools/get-finance-snapshot";
import type { getWeather } from "./ai/tools/get-weather";
import type { queryFinanceTransactions } from "./ai/tools/query-finance-transactions";
import type { refreshFinancePlan } from "./ai/tools/refresh-finance-plan";
import type { requestSuggestions } from "./ai/tools/request-suggestions";
import type { showFinanceChart } from "./ai/tools/show-finance-chart";
import type { summarizeFinanceTransactions } from "./ai/tools/summarize-finance-transactions";
import type { updateDocument } from "./ai/tools/update-document";
import type { Suggestion } from "./db/schema";

export type DataPart = { type: "append-message"; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type weatherTool = InferUITool<typeof getWeather>;
type applyFinanceActionsTool = InferUITool<
  ReturnType<typeof applyFinanceActions>
>;
type createDocumentTool = InferUITool<ReturnType<typeof createDocument>>;
type findMiscategorizedTransactionsTool = InferUITool<
  ReturnType<typeof findMiscategorizedTransactions>
>;
type getFinanceBudgetTargetsUiTool = InferUITool<
  ReturnType<typeof getFinanceBudgetTargetsTool>
>;
type getFinanceCategorizationMemoryUiTool = InferUITool<
  ReturnType<typeof getFinanceCategorizationMemoryTool>
>;
type getFinanceRulesUiTool = InferUITool<ReturnType<typeof getFinanceRulesTool>>;
type getFinanceSnapshotUiTool = InferUITool<
  ReturnType<typeof getFinanceSnapshotTool>
>;
type queryFinanceTransactionsTool = InferUITool<
  ReturnType<typeof queryFinanceTransactions>
>;
type refreshFinancePlanTool = InferUITool<ReturnType<typeof refreshFinancePlan>>;
type showFinanceChartTool = InferUITool<ReturnType<typeof showFinanceChart>>;
type summarizeFinanceTransactionsTool = InferUITool<
  ReturnType<typeof summarizeFinanceTransactions>
>;
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;
type requestSuggestionsTool = InferUITool<
  ReturnType<typeof requestSuggestions>
>;

export type ChatTools = {
  applyFinanceActions: applyFinanceActionsTool;
  getWeather: weatherTool;
  createDocument: createDocumentTool;
  findMiscategorizedTransactions: findMiscategorizedTransactionsTool;
  getFinanceBudgetTargets: getFinanceBudgetTargetsUiTool;
  getFinanceCategorizationMemory: getFinanceCategorizationMemoryUiTool;
  getFinanceRules: getFinanceRulesUiTool;
  getFinanceSnapshot: getFinanceSnapshotUiTool;
  queryFinanceTransactions: queryFinanceTransactionsTool;
  refreshFinancePlan: refreshFinancePlanTool;
  showFinanceChart: showFinanceChartTool;
  summarizeFinanceTransactions: summarizeFinanceTransactionsTool;
  updateDocument: updateDocumentTool;
  requestSuggestions: requestSuggestionsTool;
};

export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  "chat-title": string;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export type Attachment = {
  name: string;
  url: string;
  contentType: string;
};
