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
import {
  filterPersistableMessages,
  sanitizeUIMessagesForModel,
} from "@/lib/ai/message-history";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { applyFinanceActions } from "@/lib/ai/tools/apply-finance-actions";
import { createDocument } from "@/lib/ai/tools/create-document";
import { getFinanceCategorizationMemoryTool } from "@/lib/ai/tools/get-finance-categorization-memory";
import { getFinanceSnapshotTool } from "@/lib/ai/tools/get-finance-snapshot";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { queryFinanceTransactions } from "@/lib/ai/tools/query-finance-transactions";
import { refreshFinancePlan } from "@/lib/ai/tools/refresh-finance-plan";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { showFinanceChart } from "@/lib/ai/tools/show-finance-chart";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { isProductionEnvironment } from "@/lib/constants";
import { hasFinanceDataset } from "@/lib/db/finance-queries";
import {
  createProject,
  createStreamId,
  deleteChatById,
  getChatById,
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
import {
  getFinanceSnapshot,
  recomputeFinanceSnapshot,
} from "@/lib/finance/snapshot";
import type { FinanceSnapshot } from "@/lib/finance/types";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

function isGatewayActivationError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes(
      "AI Gateway requires a valid credit card on file to service requests"
    )
  );
}

function formatCurrency(value: number | null) {
  if (value === null) {
    return "Not set";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildFinanceFallbackMessage({
  snapshot,
  error,
}: {
  snapshot: FinanceSnapshot | null;
  error: unknown;
}) {
  const intro = isGatewayActivationError(error)
    ? "The finance response is unavailable until AI Gateway is activated."
    : "I ran into an issue while finishing the finance response. Here is the latest deterministic summary instead.";

  if (!snapshot || snapshot.status === "needs-upload") {
    return `${intro}\n\nUpload a transaction CSV to begin.`;
  }

  if (snapshot.status === "needs-onboarding") {
    return `${intro}\n\nYour dataset is loaded. Answer the onboarding questions and I will generate the first plan from the transactions already on file.`;
  }

  const planSummary = snapshot.planSummary;

  if (!planSummary) {
    return `${intro}\n\nYour transactions are loaded, but I do not have a plan summary ready yet.`;
  }

  const topBuckets = planSummary.bucketTargets
    .slice(0, 3)
    .map(
      (bucket) =>
        `${bucket.bucket} (${formatCurrency(bucket.monthlyTarget)}/mo)`
    )
    .join(", ");

  const latestOverrides = snapshot.appliedOverrides
    .slice(-2)
    .map((override) => override.summary)
    .join("; ");

  return `${intro}

Total monthly budget: ${formatCurrency(snapshot.cashFlowSummary.totalMonthlyBudgetTarget)}
Bucket allocations: ${formatCurrency(planSummary.totalMonthlyTarget)}
Catch-all budget: ${formatCurrency(snapshot.cashFlowSummary.catchAllBudget)}
Plan mode: ${planSummary.mode}
Top buckets: ${topBuckets || "No included buckets yet."}
${latestOverrides ? `Latest changes: ${latestOverrides}` : ""}

You can keep chatting and I will continue applying finance changes even without the model-written explanation.`;
}

function buildStreamErrorMessage(error: unknown) {
  if (isGatewayActivationError(error)) {
    return "The model could not respond because AI Gateway is not activated for this project yet. Once it is activated, you can retry this message.";
  }

  return "I ran into a model error while finishing that response. Please try again.";
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
    const {
      id,
      projectId: requestedProjectId,
      message,
      messages,
      selectedChatModel,
      selectedVisibilityType,
    } = requestBody;

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

    const chat = await getChatById({ id });
    let projectId = chat?.projectId ?? requestedProjectId ?? null;
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
    } else if (message?.role === "user") {
      if (projectId) {
        const existingProject = await getProjectById({ id: projectId });

        if (!existingProject) {
          return new ChatSDKError(
            "not_found:database",
            "Project not found"
          ).toResponse();
        }

        if (existingProject.userId !== session.user.id) {
          return new ChatSDKError("forbidden:chat").toResponse();
        }
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
      titlePromise = generateTitleFromUserMessage({ message });
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
      : [...convertToUIMessages(messagesFromDb), message as ChatMessage];

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    if (message?.role === "user") {
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: "user",
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
    }

    const isReasoningModel =
      selectedChatModel.includes("reasoning") ||
      selectedChatModel.includes("thinking");

    const modelMessages = await convertToModelMessages(
      isToolApprovalFlow ? uiMessages : sanitizeUIMessagesForModel(uiMessages)
    );

    let financeSnapshot: FinanceSnapshot | null = null;

    if (projectId && chatRuntimeMode === "finance") {
      financeSnapshot = await getFinanceSnapshot({ projectId });

      if (
        message?.role === "user" &&
        !isToolApprovalFlow &&
        financeSnapshot.status === "needs-onboarding"
      ) {
        financeSnapshot = await recomputeFinanceSnapshot({ projectId });
      }
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
          const result = streamText({
            model: getLanguageModel(selectedChatModel),
            system: `You are a helpful finance planning assistant inside a budgeting app.

Use the finance snapshot to explain the user's current plan, what changed, and any meaningful trends.
Keep the tone practical and supportive.

You can use tools to inspect, visualize, or update the finance plan:
- getFinanceSnapshot: read the full finance dashboard snapshot currently shown to the user
- showFinanceChart: render a chart directly in the chat for trend, comparison, or spending mix questions
- queryFinanceTransactions: search and filter the project's transactions in detail
- refreshFinancePlan: generate or recompute the current plan
- applyFinanceActions: persist structured plan changes
- getFinanceCategorizationMemory: read previously accepted categorization rules, one-off transaction overrides, and denied guidance

Rules:
- Never claim a change was applied unless you called a finance tool in this response and it succeeded.
- Use getFinanceSnapshot whenever you need to inspect the latest full dashboard data in detail or after a tool changes the plan.
- Use showFinanceChart when the user explicitly wants to see a visual, a trend line, a bucket comparison, or a current-month spending mix in the chat.
- Use queryFinanceTransactions when you need transaction-level detail beyond the snapshot, such as keyword search, merchant lookups, current bucket filters, raw category filters, account filters, date windows, or amount ranges.
- Use getFinanceCategorizationMemory before auditing likely miscategorizations or proposing categorization changes, so you can avoid already approved rules, one-off manual overrides, and explicitly denied guidance.
- If the snapshot status is "needs-onboarding" and the user has provided enough context to start planning, call refreshFinancePlan before answering.
- If the user asks for a plan change and it is specific enough to represent exactly, call applyFinanceActions.
- If a requested change is ambiguous, ask a concise follow-up question instead of guessing.
- For categorization and remapping requests, keep the source match and target bucket/category aligned with the user's exact request. Do not silently substitute a different merchant, raw category, or destination bucket.
- If you cannot represent the requested source or destination exactly, ask a concise clarification question instead of calling applyFinanceActions.
- When the user refers to an entire raw category like Uncategorized, prefer an action with match.rawCategory using the exact category name from the snapshot.
- When the user refers to a merchant or recurring transaction label like "Direct Debit Crosscountry", prefer a match-based categorization action instead of remapping the whole raw category.
- When the user asks to review, audit, or find likely miscategorized transactions, inspect the snapshot and memory yourself instead of relying on a separate audit tool.
- For deeper transaction investigations, prefer querying transactions directly over guessing from aggregate charts.
- For miscategorization audits, focus on ambiguous buckets, inconsistent merchant placement, recurring merchants, and large outflows that do not fit their current bucket.
- Ignore transactions that already have one-off manual categorization overrides, and ignore rules that are already accepted.
- Prefer categorize_transactions for stable recurring patterns. Use categorize_transaction only for isolated exceptions. Do not propose both a rule and a redundant one-off for the same transaction.
- When you have one to four strong categorization candidates, call applyFinanceActions with those actions. The UI may ask the user to approve or deny them before anything is persisted.
- If the user denies suggested categorization actions, use that feedback to continue the investigation, refine the proposal, or ask whether they want a deeper review.
- After any finance tool call, summarize the result and any plan changes that occurred.
- Do not invent transactions, categories, tool results, or chart values beyond the snapshot or tool outputs.
- Distinguish between the user-set total monthly budget/income and the derived bucket allocations in the plan. The catch-all budget is whatever remains after bucket allocations.

Finance snapshot:
${JSON.stringify(resolvedFinanceSnapshot)}`,
            messages: modelMessages,
            stopWhen: stepCountIs(6),
            experimental_activeTools: [
              "getFinanceCategorizationMemory",
              "getFinanceSnapshot",
              "queryFinanceTransactions",
              "refreshFinancePlan",
              "showFinanceChart",
              "applyFinanceActions",
            ],
            tools: {
              getFinanceCategorizationMemory:
                getFinanceCategorizationMemoryTool({
                  projectId,
                }),
              getFinanceSnapshot: getFinanceSnapshotTool({ projectId }),
              queryFinanceTransactions: queryFinanceTransactions({
                projectId,
              }),
              refreshFinancePlan: refreshFinancePlan({ projectId }),
              showFinanceChart: showFinanceChart({ projectId }),
              applyFinanceActions: applyFinanceActions({ projectId }),
            },
            providerOptions: isReasoningModel
              ? {
                  anthropic: {
                    thinking: { type: "enabled", budgetTokens: 10_000 },
                  },
                }
              : undefined,
            experimental_telemetry: {
              isEnabled: isProductionEnvironment,
              functionId: "finance-stream-text",
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

                return buildFinanceFallbackMessage({
                  snapshot: resolvedFinanceSnapshot,
                  error,
                });
              },
            })
          );
          await emitGeneratedTitle();
          return;
        }

        const result = streamText({
          model: getLanguageModel(selectedChatModel),
          system: systemPrompt({ selectedChatModel, requestHints }),
          messages: modelMessages,
          stopWhen: stepCountIs(5),
          experimental_activeTools: isReasoningModel
            ? []
            : [
                "getWeather",
                "createDocument",
                "updateDocument",
                "requestSuggestions",
              ],
          providerOptions: isReasoningModel
            ? {
                anthropic: {
                  thinking: { type: "enabled", budgetTokens: 10_000 },
                },
              }
            : undefined,
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
        const persistableMessages = filterPersistableMessages(
          finishedMessages as ChatMessage[]
        );

        if (isToolApprovalFlow) {
          for (const finishedMsg of persistableMessages) {
            const existingMsg = uiMessages.find((m) => m.id === finishedMsg.id);
            if (existingMsg) {
              await updateMessage({
                id: finishedMsg.id,
                parts: finishedMsg.parts,
              });
            } else {
              await saveMessages({
                messages: [
                  {
                    id: finishedMsg.id,
                    role: finishedMsg.role,
                    parts: finishedMsg.parts,
                    createdAt: new Date(),
                    attachments: [],
                    chatId: id,
                  },
                ],
              });
            }
          }
        } else if (persistableMessages.length > 0) {
          await saveMessages({
            messages: persistableMessages.map((currentMessage) => ({
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

        return "Oops, an error occurred!";
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
