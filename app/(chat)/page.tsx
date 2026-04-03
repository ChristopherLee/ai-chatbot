import { cookies } from "next/headers";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { Chat } from "@/components/chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { DEFAULT_CHAT_MODEL, getSavedChatModelId } from "@/lib/ai/models";
import { getLlmBackend } from "@/lib/ai/providers";
import { getProjectById } from "@/lib/db/queries";
import { getFinanceSnapshot } from "@/lib/finance/snapshot";
import type { FinanceSnapshot } from "@/lib/finance/types";
import { generateUUID } from "@/lib/utils";

export default function Page(props: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <NewChatPage searchParams={props.searchParams} />
    </Suspense>
  );
}

async function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { projectId: requestedProjectId } = await searchParams;
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);
  const id = generateUUID();
  const showModelPicker = getLlmBackend() === "openrouter";
  const initialChatModel = showModelPicker
    ? (getSavedChatModelId(cookieStore.get("chat-model")?.value) ??
      DEFAULT_CHAT_MODEL)
    : DEFAULT_CHAT_MODEL;

  let projectId: string | null = null;
  let projectTitle: string | null = null;
  let financeSnapshot: FinanceSnapshot | null = null;

  if (requestedProjectId && session?.user) {
    const project = await getProjectById({ id: requestedProjectId });

    if (project && project.userId === session.user.id) {
      projectId = project.id;
      projectTitle = project.title;
      financeSnapshot = await getFinanceSnapshot({ projectId: project.id });
    }
  }

  const hasFinanceDataset = financeSnapshot
    ? financeSnapshot.status !== "needs-upload"
    : false;

  return (
    <>
      <Chat
        autoResume={false}
        id={id}
        initialChatModel={initialChatModel}
        initialFinanceSnapshot={financeSnapshot}
        initialHasFinanceDataset={hasFinanceDataset}
        initialMessages={[]}
        initialVisibilityType="private"
        isReadonly={false}
        key={id}
        projectId={projectId}
        projectTitle={projectTitle}
        showModelPicker={showModelPicker}
      />
      <DataStreamHandler />
    </>
  );
}
