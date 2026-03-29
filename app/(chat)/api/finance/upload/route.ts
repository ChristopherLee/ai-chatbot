import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  getUploadedFileByProjectId,
  saveTransactions,
  saveUploadedFile,
} from "@/lib/db/finance-queries";
import {
  createProject,
  getChatById,
  getProjectById,
  saveChat,
  saveMessages,
  updateChatTitleById,
  updateProjectTitleById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import {
  buildFinanceChatTitle,
  parseTransactionsCsv,
} from "@/lib/finance/csv-ingest";
import { generateUUID } from "@/lib/utils";

function buildOnboardingMessage({
  filename,
  rowCount,
}: {
  filename: string;
  rowCount: number;
}) {
  return `I loaded ${rowCount} transactions from ${filename}.

Before I generate your first spending control plan, tell me:
1. What are your top financial goals right now?
2. What matters most in your monthly spending?
3. Are there any upcoming life changes or expense changes I should reflect?
4. Is there anything you want excluded or treated specially?`;
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
        { access: "public" }
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

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const chatIdValue = formData.get("chatId");
    const projectIdValue = formData.get("projectId");

    if (!(file instanceof File) || typeof chatIdValue !== "string") {
      return NextResponse.json(
        { error: "Upload requires a CSV file and chat id." },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json(
        { error: "Only CSV uploads are supported." },
        { status: 400 }
      );
    }

    const chatId = chatIdValue;
    const existingChat = await getChatById({ id: chatId });
    let projectId =
      existingChat?.projectId ??
      (typeof projectIdValue === "string" ? projectIdValue : null);

    if (existingChat && existingChat.userId !== session.user.id) {
      return new ChatSDKError("forbidden:chat").toResponse();
    }

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
      projectId = generateUUID();
    }

    const existingUpload = await getUploadedFileByProjectId({ projectId });

    if (existingUpload) {
      return NextResponse.json(
        { error: "This project already has a dataset." },
        { status: 409 }
      );
    }

    const csvText = await file.text();
    const parsed = await parseTransactionsCsv({
      projectId,
      filename: file.name,
      csvText,
    });
    const financeTitle = buildFinanceChatTitle({
      filename: parsed.filename,
      startDate: parsed.dateRange.start,
      endDate: parsed.dateRange.end,
    });

    const existingProject = await getProjectById({ id: projectId });

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
      transactions: parsed.transactions,
    });

    await saveMessages({
      messages: [
        {
          id: generateUUID(),
          chatId,
          role: "assistant",
          parts: [
            {
              type: "text",
              text: buildOnboardingMessage({
                filename: file.name,
                rowCount: parsed.rowCount,
              }),
            },
          ],
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    return NextResponse.json({ chatId, projectId });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error("Failed finance upload", error);
    return NextResponse.json(
      { error: "Failed to upload and parse the CSV file." },
      { status: 500 }
    );
  }
}
