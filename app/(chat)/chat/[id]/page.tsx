import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { auth } from "@/app/(auth)/auth";
import { Chat } from "@/components/chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { DEFAULT_CHAT_MODEL, getSavedChatModelId } from "@/lib/ai/models";
import { getLlmBackend } from "@/lib/ai/providers";
import {
  getChatById,
  getMessagesByChatId,
  getProjectById,
} from "@/lib/db/queries";
import { getFinanceSnapshot } from "@/lib/finance/snapshot";
import { convertToUIMessages } from "@/lib/utils";

export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <ChatPage params={props.params} />
    </Suspense>
  );
}

async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chat = await getChatById({ id });

  if (!chat) {
    redirect("/");
  }

  const [session, cookieStore] = await Promise.all([auth(), cookies()]);
  const showModelPicker = getLlmBackend() === "openrouter";
  const initialChatModel = showModelPicker
    ? (getSavedChatModelId(cookieStore.get("chat-model")?.value) ??
      DEFAULT_CHAT_MODEL)
    : DEFAULT_CHAT_MODEL;

  if (!session) {
    redirect("/api/auth/guest");
  }

  if (chat.visibility === "private") {
    if (!session.user) {
      return notFound();
    }

    if (session.user.id !== chat.userId) {
      return notFound();
    }
  }

  const messagesFromDb = await getMessagesByChatId({
    id,
  });
  const project = await getProjectById({ id: chat.projectId });
  const financeSnapshot = await getFinanceSnapshot({
    projectId: chat.projectId,
  });

  const uiMessages = convertToUIMessages(messagesFromDb);

  return (
    <>
      <Chat
        autoResume={true}
        id={chat.id}
        initialChatModel={initialChatModel}
        initialFinanceSnapshot={financeSnapshot}
        initialHasFinanceDataset={financeSnapshot.status !== "needs-upload"}
        initialMessages={uiMessages}
        initialVisibilityType={chat.visibility}
        isReadonly={session?.user?.id !== chat.userId}
        projectId={chat.projectId}
        projectTitle={project?.title ?? null}
        showModelPicker={showModelPicker}
      />
      <DataStreamHandler />
    </>
  );
}
