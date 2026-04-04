import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getErrorLogDetails } from "@/lib/ai/logging";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import {
  getTransactionsByProjectId,
  getUploadedFileByProjectId,
  replaceFinancePlan,
  saveTransactions,
  saveUploadedFile,
} from "@/lib/db/finance-queries";
import {
  createProject,
  getChatById,
  getLatestProjectByUserId,
  getProjectById,
  saveChat,
  saveMessages,
  updateChatTitleById,
  updateProjectTitleById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { findMiscategorizedTransactions } from "@/lib/finance/categorization-review";
import type { FinanceCategorizationReview } from "@/lib/finance/categorization-review-shared";
import { buildCategoryBudgetSuggestions } from "@/lib/finance/category-budgets";
import {
  buildFinanceChatTitle,
  parseTransactionsCsv,
} from "@/lib/finance/csv-ingest";
import {
  buildNeedsOnboardingSnapshot,
  recomputeFinanceSnapshot,
} from "@/lib/finance/snapshot";
import { filterNewTransactions } from "@/lib/finance/transaction-dedupe";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildFirstUploadOnboardingMessage({
  budgetSuggestions,
  endDate,
  filename,
  rowCount,
  startDate,
}: {
  budgetSuggestions: ReturnType<typeof buildCategoryBudgetSuggestions>;
  endDate: string;
  filename: string;
  rowCount: number;
  startDate: string;
}) {
  const suggestionPreview = budgetSuggestions
    .slice(0, 3)
    .map(
      (suggestion) =>
        `${suggestion.category} (${formatCurrency(suggestion.suggestedAmount)})`
    )
    .join(", ");

  return `Welcome to the app. I loaded ${rowCount} transactions from ${filename} covering ${startDate} to ${endDate}.

Step 1 is making sure the dataset is clean and categorized correctly. Review the suggested cleanup rules below and save or deny anything that looks off.

Step 2 is setting starter budgets for the categories that matter most in your history.${suggestionPreview ? ` I already have starter recommendations queued up for ${suggestionPreview}.` : ""}

After your budgets are set, we can either compare last month's spending to the budget or check how this month is tracking so far.`;
}

function buildFollowUpUploadMessage({
  filename,
  rowCount,
}: {
  filename: string;
  rowCount: number;
}) {
  return `I loaded ${rowCount} new transactions from ${filename}.

I refreshed the finance dataset and checked it for any new categorization cleanup suggestions below.

Tell me what you want to adjust next:
1. Update a budget, bill, or income target.
2. Exclude or recategorize transactions.
3. Compare recent spending to the current budget.`;
}

function buildFallbackStoragePath({
  projectId,
  filename,
}: {
  projectId: string;
  filename: string;
}) {
  return `local://finance/${projectId}/${filename}`;
}

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

type FinanceUploadLogContext = {
  chatId: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  projectId: string | null;
  stage: string;
  userId: string;
  vercelId: string | null;
};

function formatFinanceUploadLogPayload(payload: Record<string, unknown>) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return payload;
  }
}

function getFileUploadContext(file: FormDataEntryValue | null) {
  if (!(file instanceof File)) {
    return {
      fileName: null,
      fileSize: null,
      mimeType: null,
    };
  }

  return {
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || null,
  };
}

function logFinanceUploadFailure({
  context,
  error,
}: {
  context: FinanceUploadLogContext;
  error: unknown;
}) {
  const payload: Record<string, unknown> = {
    ...context,
    error: getErrorLogDetails(error),
  };

  if (error instanceof ChatSDKError) {
    payload.code = `${error.type}:${error.surface}`;
    payload.errorMessage = error.message;
    payload.cause = error.cause;
    payload.statusCode = error.statusCode;
  }

  const logMethod =
    error instanceof ChatSDKError && error.statusCode < 500
      ? console.warn
      : console.error;

  logMethod("Finance upload failed", formatFinanceUploadLogPayload(payload));
}

function joinSummaryParts(parts: string[]) {
  if (parts.length === 0) {
    return "";
  }

  if (parts.length === 1) {
    return parts[0] ?? "";
  }

  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }

  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

function buildCategorizationReviewMessage(review: FinanceCategorizationReview) {
  const updateCount = review.suggestedRules.filter(
    (rule) => typeof rule.replaceRuleId === "string"
  ).length;
  const newRuleCount = review.suggestedRules.length - updateCount;
  const oneOffCount = review.suggestedTransactions.length;
  const summaryParts = [
    newRuleCount > 0 ? pluralize(newRuleCount, "new rule") : null,
    updateCount > 0 ? pluralize(updateCount, "rule update") : null,
    oneOffCount > 0 ? pluralize(oneOffCount, "one-off transaction fix") : null,
  ].filter((value): value is string => Boolean(value));

  if (summaryParts.length === 0) {
    return "I also reviewed the dataset for categorization cleanup after this upload and did not find any new high-confidence rule additions or rule updates.";
  }

  return `I also reviewed the dataset for categorization cleanup after this upload and found ${joinSummaryParts(
    summaryParts
  )}. Save the ones that look right below.${updateCount > 0 ? " Suggestions marked as rule updates will replace an existing rule instead of creating a duplicate." : ""}`;
}

function buildCategorizationReviewParts(
  review: FinanceCategorizationReview
): ChatMessage["parts"] {
  return [
    {
      type: "text",
      text: buildCategorizationReviewMessage(review),
    },
    {
      type: "tool-findMiscategorizedTransactions",
      toolCallId: `upload-review-${generateUUID()}`,
      state: "output-available",
      input: {
        maxRules: 6,
        maxTransactions: 12,
      },
      output: review,
    },
  ];
}

async function storeUploadedCsv({
  projectId,
  filename,
  file,
}: {
  projectId: string;
  filename: string;
  file: File;
}) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const uploaded = await put(
        `finance/${projectId}/${Date.now()}-${filename}`,
        await file.arrayBuffer(),
        { access: "private" }
      );

      return uploaded.url;
    } catch (error) {
      console.warn(
        "Finance CSV blob upload failed, falling back to local-only metadata storage.",
        error
      );

      return buildFallbackStoragePath({
        projectId,
        filename,
      });
    }
  }

  return buildFallbackStoragePath({
    projectId,
    filename,
  });
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const vercelId = request.headers.get("x-vercel-id");
  let stage = "parse-form-data";
  let logContext: FinanceUploadLogContext = {
    chatId: null,
    fileName: null,
    fileSize: null,
    mimeType: null,
    projectId: null,
    stage,
    userId: session.user.id,
    vercelId,
  };

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const chatIdValue = formData.get("chatId");
    const projectIdValue = formData.get("projectId");

    logContext = {
      ...logContext,
      chatId: typeof chatIdValue === "string" ? chatIdValue : null,
      projectId: typeof projectIdValue === "string" ? projectIdValue : null,
      ...getFileUploadContext(file),
    };

    stage = "validate-request";
    logContext = {
      ...logContext,
      stage,
    };

    if (!(file instanceof File) || typeof chatIdValue !== "string") {
      throw new ChatSDKError(
        "bad_request:api",
        "Upload requires a CSV file and chat id."
      );
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      throw new ChatSDKError(
        "bad_request:api",
        "Only CSV uploads are supported."
      );
    }

    stage = "load-chat";
    logContext = {
      ...logContext,
      stage,
    };

    const chatId = chatIdValue;
    const existingChat = await getChatById({ id: chatId });
    let projectId = existingChat?.projectId ?? null;

    if (existingChat && existingChat.userId !== session.user.id) {
      throw new ChatSDKError("forbidden:chat");
    }

    if (projectId) {
      logContext = {
        ...logContext,
        projectId,
      };

      const existingProject = await getProjectById({ id: projectId });

      if (!existingProject) {
        throw new ChatSDKError("bad_request:api", "Project not found");
      }

      if (existingProject.userId !== session.user.id) {
        throw new ChatSDKError("forbidden:chat");
      }
    } else {
      const existingProject = await getLatestProjectByUserId({
        userId: session.user.id,
      });

      projectId = existingProject?.id ?? generateUUID();
      logContext = {
        ...logContext,
        projectId,
      };
    }

    stage = "parse-csv";
    logContext = {
      ...logContext,
      stage,
    };

    const csvText = await file.text();
    const parsed = await parseTransactionsCsv({
      projectId,
      filename: file.name,
      csvText,
    });
    const [existingUpload, existingTransactions] = await Promise.all([
      getUploadedFileByProjectId({ projectId }),
      getTransactionsByProjectId({ projectId }),
    ]);

    const newTransactions = filterNewTransactions({
      existingTransactions,
      candidateTransactions: parsed.transactions,
    });

    const financeTitle = buildFinanceChatTitle({
      filename: parsed.filename,
      startDate: parsed.dateRange.start,
      endDate: parsed.dateRange.end,
    });

    const existingProject = await getProjectById({ id: projectId });

    stage = "persist-project";
    logContext = {
      ...logContext,
      stage,
    };

    if (existingProject) {
      await updateProjectTitleById({
        projectId,
        title: financeTitle,
      });
    } else {
      await createProject({
        id: projectId,
        userId: session.user.id,
        title: financeTitle,
      });
    }

    if (existingChat) {
      await updateChatTitleById({
        chatId,
        title: financeTitle,
      });
    } else {
      await saveChat({
        id: chatId,
        userId: session.user.id,
        projectId,
        title: financeTitle,
        visibility: "private",
      });
    }

    stage = "store-upload";
    logContext = {
      ...logContext,
      stage,
    };

    const storagePath = await storeUploadedCsv({
      projectId,
      filename: file.name,
      file,
    });

    await saveUploadedFile({
      projectId,
      filename: file.name,
      storagePath,
    });

    await saveTransactions({
      transactions: newTransactions,
    });

    stage = "recompute-snapshot";
    logContext = {
      ...logContext,
      stage,
    };

    const categorizationReviewPromise =
      newTransactions.length > 0
        ? findMiscategorizedTransactions({
            projectId,
            selectedChatModel: DEFAULT_CHAT_MODEL,
          }).catch((error) => {
            console.warn(
              "Finance categorization review failed after upload; continuing without review suggestions.",
              error
            );

            return null;
          })
        : Promise.resolve(null);

    const [snapshot, categorizationReview] = await Promise.all([
      existingUpload
        ? recomputeFinanceSnapshot({ projectId })
        : (async () => {
            const onboardingSnapshot = await buildNeedsOnboardingSnapshot({
              projectId,
            });

            await replaceFinancePlan({
              projectId,
              snapshot: onboardingSnapshot,
            });

            return onboardingSnapshot;
          })(),
      categorizationReviewPromise,
    ]);
    const budgetSuggestions = snapshot.datasetSummary
      ? buildCategoryBudgetSuggestions({
          categoryCards: snapshot.categoryCards,
          currentBudgets: [],
          latestTransactionDate: snapshot.datasetSummary.dateRange.end,
        })
      : [];
    const onboardingCreatedAt = new Date();
    const uploadMessages: Array<{
      id: string;
      chatId: string;
      role: "assistant";
      parts: ChatMessage["parts"];
      attachments: [];
      createdAt: Date;
    }> = [
      {
        id: generateUUID(),
        chatId,
        role: "assistant",
        parts: [
          {
            type: "text",
            text: existingUpload
              ? buildFollowUpUploadMessage({
                  filename: file.name,
                  rowCount: newTransactions.length,
                })
              : buildFirstUploadOnboardingMessage({
                  budgetSuggestions,
                  endDate:
                    snapshot.datasetSummary?.dateRange.end ??
                    parsed.dateRange.end,
                  filename: file.name,
                  rowCount: newTransactions.length,
                  startDate:
                    snapshot.datasetSummary?.dateRange.start ??
                    parsed.dateRange.start,
                }),
          },
        ],
        attachments: [],
        createdAt: onboardingCreatedAt,
      },
    ];

    if (categorizationReview) {
      uploadMessages.push({
        id: generateUUID(),
        chatId,
        role: "assistant",
        parts: buildCategorizationReviewParts(categorizationReview),
        attachments: [],
        createdAt: new Date(onboardingCreatedAt.getTime() + 1),
      });
    }

    stage = "save-messages";
    logContext = {
      ...logContext,
      stage,
    };

    await saveMessages({
      messages: uploadMessages,
    });

    return NextResponse.json({
      chatId,
      projectId,
      uploadedBefore: Boolean(existingUpload),
      insertedRows: newTransactions.length,
      parsedRows: parsed.rowCount,
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      logFinanceUploadFailure({
        context: {
          ...logContext,
          stage,
        },
        error,
      });
      return error.toResponse();
    }

    logFinanceUploadFailure({
      context: {
        ...logContext,
        stage,
      },
      error,
    });

    return NextResponse.json(
      { error: "Failed to upload and parse the CSV file." },
      { status: 500 }
    );
  }
}
