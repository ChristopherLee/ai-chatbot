import { geolocation } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
} from "ai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { auth, type UserType } from "@/app/(auth)/auth";
import { getChatRuntimeMode } from "@/lib/ai/chat-runtime-mode";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { logChatStreamFailure } from "@/lib/ai/logging";
import { sanitizeUIMessagesForModel } from "@/lib/ai/message-history";
import { planPersistableMessageWrites } from "@/lib/ai/message-persistence";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import {
  buildFinanceStreamErrorMessage,
  buildStreamErrorMessage,
} from "@/lib/ai/stream-error-messages";
import {
  getLanguageModel,
  getLanguageModelProviderOptions,
  isReasoningModelId,
} from "@/lib/ai/providers";
import {
  createStreamTimeout,
} from "@/lib/ai/stream-timeout";
import { applyFinanceActions } from "@/lib/ai/tools/apply-finance-actions";
import { createDocument } from "@/lib/ai/tools/create-document";
import { getFinanceBudgetTargetsTool } from "@/lib/ai/tools/get-finance-budget-targets";
import { getFinanceCategorizationMemoryTool } from "@/lib/ai/tools/get-finance-categorization-memory";
import { getFinanceRulesTool } from "@/lib/ai/tools/get-finance-rules";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { queryFinanceTransactions } from "@/lib/ai/tools/query-finance-transactions";
import { refreshFinancePlan } from "@/lib/ai/tools/refresh-finance-plan";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { showFinanceChart } from "@/lib/ai/tools/show-finance-chart";
import { summarizeFinanceTransactions } from "@/lib/ai/tools/summarize-finance-transactions";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { isProductionEnvironment } from "@/lib/constants";
import { hasFinanceDataset } from "@/lib/db/finance-queries";
import {
  createProject,
  createStreamId,
  deleteChatById,
  getChatById,
  getLatestProjectByUserId,
  getMessageCountByUserId,
  getMessagesByChatId,
  getProjectById,
  saveChat,
  saveMessages,
  updateChatTitleById,
  updateMessage,
  updateProjectTitleById,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { getFinanceSnapshot } from "@/lib/finance/snapshot";
import type { FinanceSnapshot } from "@/lib/finance/types";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

// Next.js segment config exports must be statically analyzable in this file.
export const maxDuration = 120;

function buildFinancePromptContext(snapshot: FinanceSnapshot) {
  return {
    snapshotStatus: snapshot.status,
    planMode: snapshot.planSummary?.mode ?? null,
    latestTransactionDate: snapshot.datasetSummary?.dateRange.end ?? null,
    cashFlowSummary: snapshot.cashFlowSummary,
    suggestedCategoryBudgetTotal: snapshot.planSummary?.totalMonthlyTarget ?? null,
    topCategoryTargets:
      snapshot.planSummary?.categoryTargets.slice(0, 6).map((category) => ({
        category: category.category,
        group: category.group,
        monthlyTarget: category.monthlyTarget,
        trailingAverage: category.trailingAverage,
      })) ?? [],
    latestOverrideSummaries: snapshot.appliedOverrides
      .slice(-3)
      .map((override) => override.summary),
  };
}

function buildFinanceSystemPrompt(snapshot: FinanceSnapshot) {
  return `You are a helpful finance planning assistant inside a budgeting app.

Use the finance context and finance tools to explain the user's current plan, what changed, and any meaningful trends.
Keep the tone practical and supportive.

You can use tools to inspect, visualize, or update the finance plan:
- getFinanceBudgetTargets: read total budget and income targets, current category budgets, catch-all budget, suggested category budgets, and current plan mode
- getFinanceRules: inspect saved categorization rules, exclusions, budget overrides, plan mode changes, and available raw categories/accounts/categories
- summarizeFinanceTransactions: get grouped totals by month, category, raw category, merchant, or account, using either raw or budget representation
- showFinanceChart: render a chart directly in the chat for trend, comparison, spending mix, or income-allocation Sankey questions
- queryFinanceTransactions: search and filter the project's transactions in detail, using either raw or budget representation
- refreshFinancePlan: generate or recompute the current plan
- applyFinanceActions: persist structured plan changes
- getFinanceCategorizationMemory: read previously accepted categorization rules, one-off transaction overrides, and denied guidance

Onboarding behavior:
- If the finance context snapshotStatus is "needs-onboarding", the user is in the first-upload onboarding flow.
- In onboarding, start by helping the user validate data cleanliness and categorization before treating the plan as finalized.
- Treat suggested category budgets and target recommendations in onboarding as provisional guidance derived from historical spend, not as final approved budgets.
- Do not call refreshFinancePlan just because the user sent their first onboarding message.
- After the user has reviewed the cleanup suggestions or intentionally chosen to skip that step, recommend starter budgets only for meaningful categories.
- When discussing starter budgets, skip tiny categories and use judgment about whether spend is steady, variable, newly recent, or mostly in older months.
- Use merchant and description clues to infer whether a category behaves like a recurring bill, flexible monthly spend, or occasional spending.
- Call refreshFinancePlan only when the user explicitly wants to finalize onboarding, skip onboarding, or move into the main planning experience.
- After budgets are set or the user says they are ready to move on, ask whether they want (1) a last-month vs budget analysis or (2) a current-month progress check.

Rules:
- Never claim a change was applied unless you called a finance tool in this response and it succeeded.
- Use getFinanceBudgetTargets whenever you need the latest budget settings, category budgets, catch-all budget, or plan mode, especially after a plan change.
- Use getFinanceRules when you need to inspect saved rules or learn the available raw categories, categories, accounts, and override history.
- Use summarizeFinanceTransactions when you need grouped totals or trends without transaction-level rows.
- For summarizeFinanceTransactions, set representation="raw" for baseline categorization audits and representation="budget" for current budgeted view.
- Use showFinanceChart when the user explicitly wants to see a visual, a trend line, a category comparison, a current-month spending mix, or an income-to-expense Sankey in the chat.
- Use queryFinanceTransactions when you need transaction-level detail beyond aggregated results, such as keyword search, merchant lookups, current category filters, raw category filters, account filters, or date windows.
- For queryFinanceTransactions, set representation="raw" for baseline categorization audits and representation="budget" for current budgeted view.
- Use getFinanceCategorizationMemory before auditing likely miscategorizations or proposing categorization changes, so you can avoid already approved rules, one-off manual overrides, and explicitly denied guidance.
- If the user asks for a plan change and it is specific enough to represent exactly, call applyFinanceActions.
- If a requested change is ambiguous, ask a concise follow-up question instead of guessing.
- For categorization requests, keep the source match and target category aligned with the user's exact request. Do not silently substitute a different merchant, raw category, or destination category.
- If the user asks to rename or merge categories, explain that reusable rules now work by categorizing source transactions into the destination category instead of using separate rename or merge actions.
- If you cannot represent the requested source or destination exactly, ask a concise clarification question instead of calling applyFinanceActions.
- When the user refers to an entire raw category like Uncategorized, prefer an action with match.rawCategory using the exact category name from the rules or transaction tools.
- When the user refers to a merchant or recurring transaction label like "Direct Debit Crosscountry", prefer a match-based categorization action instead of remapping the whole raw category.
- When the user asks to review, audit, or find likely miscategorized transactions, inspect rules, summaries, transaction rows, and categorization memory yourself instead of relying on a separate audit tool.
- For deeper transaction investigations, prefer querying transactions directly over guessing from aggregate charts or grouped summaries.
- For miscategorization audits, focus on ambiguous categories, inconsistent merchant placement, recurring merchants, and large outflows that do not fit their current category.
- Ignore transactions that already have one-off manual categorization overrides, and ignore rules that are already accepted.
- Prefer categorize_transactions for stable recurring patterns. Use categorize_transaction only for isolated exceptions. Do not propose both a rule and a redundant one-off for the same transaction.
- When you have one to four strong categorization candidates, call applyFinanceActions with those actions. The UI may ask the user to approve or deny them before anything is persisted.
- If the user denies suggested categorization actions, use that feedback to continue the investigation, refine the proposal, or ask whether they want a deeper review.
- After any finance tool call, summarize the result and any plan changes that occurred.
- Do not invent transactions, categories, tool results, or chart values beyond the finance context or tool outputs.
- Distinguish between the user-set total monthly budget/income and the derived category allocations in the plan. The catch-all budget is whatever remains after category allocations.

Finance context:
${JSON.stringify(buildFinancePromptContext(snapshot))}`;
}

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}

export { getStreamContext };

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  try {
    const { id, message, messages, selectedChatModel, selectedVisibilityType } =
      requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError("rate_limit:chat").toResponse();
    }

    const isToolApprovalFlow = Boolean(messages);
    const incomingMessage = isToolApprovalFlow ? undefined : message;

    const chat = await getChatById({ id });
    let projectId = chat?.projectId ?? null;
    let createdProjectId: string | null = null;
    let messagesFromDb: DBMessage[] = [];
    let titlePromise: Promise<string> | null = null;

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError("forbidden:chat").toResponse();
      }
      if (!isToolApprovalFlow) {
        messagesFromDb = await getMessagesByChatId({ id });
      }
    } else if (incomingMessage?.role === "user") {
      const existingProject = projectId
        ? await getProjectById({ id: projectId })
        : await getLatestProjectByUserId({ userId: session.user.id });

      if (existingProject) {
        if (existingProject.userId !== session.user.id) {
          return new ChatSDKError("forbidden:chat").toResponse();
        }

        projectId = existingProject.id;
      } else {
        const createdProject = await createProject({
          userId: session.user.id,
          title: "New project",
        });

        projectId = createdProject.id;
        createdProjectId = createdProject.id;
      }

      if (!projectId) {
        return new ChatSDKError(
          "bad_request:api",
          "Project could not be created for this chat"
        ).toResponse();
      }

      await saveChat({
        id,
        userId: session.user.id,
        projectId,
        title: "New chat",
        visibility: selectedVisibilityType,
      });
      titlePromise = generateTitleFromUserMessage({ message: incomingMessage });
    } else if (projectId) {
      const existingProject = await getProjectById({ id: projectId });

      if (!existingProject || existingProject.userId !== session.user.id) {
        return new ChatSDKError("forbidden:chat").toResponse();
      }
    }

    const isFinanceChat = projectId
      ? await hasFinanceDataset({ projectId })
      : false;
    const chatRuntimeMode = getChatRuntimeMode({
      isFinanceChat,
    });

    const uiMessages = isToolApprovalFlow
      ? (messages as ChatMessage[])
      : [
          ...convertToUIMessages(messagesFromDb),
          incomingMessage as ChatMessage,
        ];

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    if (incomingMessage?.role === "user") {
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: incomingMessage.id,
            role: "user",
            parts: incomingMessage.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
    }

    const isReasoningModel = isReasoningModelId(selectedChatModel);

    const modelMessages = await convertToModelMessages(
      isToolApprovalFlow ? uiMessages : sanitizeUIMessagesForModel(uiMessages)
    );

    let financeSnapshot: FinanceSnapshot | null = null;

    if (projectId && chatRuntimeMode === "finance") {
      financeSnapshot = await getFinanceSnapshot({ projectId });
    }

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        const emitGeneratedTitle = async () => {
          if (!titlePromise) {
            return;
          }

          const title = await titlePromise;
          dataStream.write({ type: "data-chat-title", data: title });
          await updateChatTitleById({ chatId: id, title });

          if (createdProjectId) {
            await updateProjectTitleById({
              projectId: createdProjectId,
              title,
            });
          }
        };

        if (chatRuntimeMode === "finance") {
          if (!projectId) {
            throw new ChatSDKError(
              "bad_request:api",
              "Finance project context is missing"
            );
          }

          const resolvedFinanceSnapshot =
            financeSnapshot ?? (await getFinanceSnapshot({ projectId }));
          const streamTimeout = createStreamTimeout();
          const result = streamText({
            model: getLanguageModel(selectedChatModel),
            system: buildFinanceSystemPrompt(resolvedFinanceSnapshot),
            messages: modelMessages,
            abortSignal: streamTimeout.signal,
            stopWhen: stepCountIs(6),
            experimental_activeTools: [
              "getFinanceBudgetTargets",
              "getFinanceCategorizationMemory",
              "getFinanceRules",
              "queryFinanceTransactions",
              "refreshFinancePlan",
              "showFinanceChart",
              "summarizeFinanceTransactions",
              "applyFinanceActions",
            ],
            tools: {
              getFinanceBudgetTargets: getFinanceBudgetTargetsTool({
                projectId,
              }),
              getFinanceCategorizationMemory:
                getFinanceCategorizationMemoryTool({
                  projectId,
                }),
              getFinanceRules: getFinanceRulesTool({ projectId }),
              queryFinanceTransactions: queryFinanceTransactions({
                projectId,
              }),
              refreshFinancePlan: refreshFinancePlan({ projectId }),
              showFinanceChart: showFinanceChart({ projectId }),
              summarizeFinanceTransactions: summarizeFinanceTransactions({
                projectId,
              }),
              applyFinanceActions: applyFinanceActions({ projectId }),
            },
            providerOptions: getLanguageModelProviderOptions(selectedChatModel),
            experimental_telemetry: {
              isEnabled: isProductionEnvironment,
              functionId: "finance-stream-text",
            },
            onAbort: () => {
              streamTimeout.clear();
            },
            onError: () => {
              streamTimeout.clear();
            },
            onFinish: () => {
              streamTimeout.clear();
            },
          });

          dataStream.merge(
            result.toUIMessageStream({
              sendReasoning: true,
              onError: (error) => {
                logChatStreamFailure({
                  chatId: id,
                  error,
                  projectId,
                  scope: "finance",
                  selectedChatModel,
                });

                return buildFinanceStreamErrorMessage(error);
              },
            })
          );
          await emitGeneratedTitle();
          return;
        }

        const streamTimeout = createStreamTimeout();
        const result = streamText({
          model: getLanguageModel(selectedChatModel),
          system: systemPrompt({ selectedChatModel, requestHints }),
          messages: modelMessages,
          abortSignal: streamTimeout.signal,
          stopWhen: stepCountIs(5),
          experimental_activeTools: isReasoningModel
            ? []
            : [
                "getWeather",
                "createDocument",
                "updateDocument",
                "requestSuggestions",
              ],
          providerOptions: getLanguageModelProviderOptions(selectedChatModel),
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({ session, dataStream }),
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
          onAbort: () => {
            streamTimeout.clear();
          },
          onError: () => {
            streamTimeout.clear();
          },
          onFinish: () => {
            streamTimeout.clear();
          },
        });

        dataStream.merge(
          result.toUIMessageStream({
            sendReasoning: true,
            onError: (error) => {
              logChatStreamFailure({
                chatId: id,
                error,
                projectId,
                scope: "chat",
                selectedChatModel,
              });

              return buildStreamErrorMessage(error);
            },
          })
        );

        await emitGeneratedTitle();
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        const { inserts, updates } = planPersistableMessageWrites({
          existingMessages: uiMessages,
          finishedMessages: finishedMessages as ChatMessage[],
        });

        for (const finishedMsg of updates) {
          await updateMessage({
            id: finishedMsg.id,
            parts: finishedMsg.parts,
          });
        }

        if (inserts.length > 0) {
          await saveMessages({
            messages: inserts.map((currentMessage) => ({
              id: currentMessage.id,
              role: currentMessage.role,
              parts: currentMessage.parts,
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            })),
          });
        }
      },
      onError: (error) => {
        logChatStreamFailure({
          chatId: id,
          error,
          projectId,
          scope: "stream",
          selectedChatModel,
        });

        return chatRuntimeMode === "finance"
          ? buildFinanceStreamErrorMessage(error)
          : buildStreamErrorMessage(error);
      },
    });

    return createUIMessageStreamResponse({
      stream,
      async consumeSseStream({ stream: sseStream }) {
        if (!process.env.REDIS_URL) {
          return;
        }
        try {
          const streamContext = getStreamContext();
          if (streamContext) {
            const streamId = generateId();
            await createStreamId({ streamId, chatId: id });
            await streamContext.createNewResumableStream(
              streamId,
              () => sseStream
            );
          }
        } catch (_) {
          // ignore redis errors
        }
      },
    });
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      return new ChatSDKError("bad_request:activate_gateway").toResponse();
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatSDKError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
