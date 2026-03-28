import { cookies } from "next/headers";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { Chat } from "@/components/chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
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
  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get("chat-model");
  const id = generateUUID();
  const { projectId: requestedProjectId } = await searchParams;
  const session = await auth();

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

  if (!modelIdFromCookie) {
    return (
      <>
        <Chat
          autoResume={false}
          id={id}
          initialChatModel={DEFAULT_CHAT_MODEL}
          initialFinanceSnapshot={financeSnapshot}
          initialHasFinanceDataset={hasFinanceDataset}
          initialMessages={[]}
          initialVisibilityType="private"
          isReadonly={false}
          key={id}
          projectId={projectId}
          projectTitle={projectTitle}
        />
        <DataStreamHandler />
      </>
    );
  }

  return (
    <>
      <Chat
        autoResume={false}
        id={id}
        initialChatModel={modelIdFromCookie.value}
        initialFinanceSnapshot={financeSnapshot}
        initialHasFinanceDataset={hasFinanceDataset}
        initialMessages={[]}
        initialVisibilityType="private"
        isReadonly={false}
        key={id}
        projectId={projectId}
        projectTitle={projectTitle}
      />
      <DataStreamHandler />
    </>
  );
}
