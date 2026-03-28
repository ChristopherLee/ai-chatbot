"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { useWindowSize } from "usehooks-ts";
import { ChatHeader } from "@/components/chat-header";
import { FinanceDashboard } from "@/components/finance/finance-dashboard";
import { FinanceRulesView } from "@/components/finance/finance-rules-view";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useArtifactSelector } from "@/hooks/use-artifact";
import { useAutoResume } from "@/hooks/use-auto-resume";
import { useChatVisibility } from "@/hooks/use-chat-visibility";
import { autoDenyPendingToolApprovals } from "@/lib/ai/message-history";
import type { Vote } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import type { FinanceSnapshot } from "@/lib/finance/types";
import type { Attachment, ChatMessage } from "@/lib/types";
import { fetcher, fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { Artifact } from "./artifact";
import { useDataStream } from "./data-stream-provider";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";
import { getChatHistoryPaginationKey } from "./sidebar-history";
import { toast } from "./toast";
import type { VisibilityType } from "./visibility-selector";

export function Chat({
  id,
  projectId,
  projectTitle,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  autoResume,
  initialHasFinanceDataset,
  initialFinanceSnapshot,
}: {
  id: string;
  projectId: string | null;
  projectTitle: string | null;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  autoResume: boolean;
  initialHasFinanceDataset: boolean;
  initialFinanceSnapshot: FinanceSnapshot | null;
}) {
  const router = useRouter();
  const { width } = useWindowSize();

  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const { mutate } = useSWRConfig();

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      // When user navigates back/forward, refresh to sync with URL
      router.refresh();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [router]);
  const { setDataStream } = useDataStream();

  const [input, setInput] = useState<string>("");
  const [showCreditCardAlert, setShowCreditCardAlert] = useState(false);
  const [currentModelId, setCurrentModelId] = useState(initialChatModel);
  const [currentProjectTitle, setCurrentProjectTitle] = useState(projectTitle);
  const [hasFinanceDataset, setHasFinanceDataset] = useState(
    initialHasFinanceDataset
  );
  const currentModelIdRef = useRef(currentModelId);
  const resumedApprovalContinuationRef = useRef<string | null>(null);
  const financeSnapshotKey = hasFinanceDataset
    ? projectId
      ? `/api/finance/project/${projectId}`
      : null
    : null;

  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

  useEffect(() => {
    setCurrentProjectTitle(projectTitle);
  }, [projectTitle]);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    resumeStream,
    addToolApprovalResponse,
  } = useChat<ChatMessage>({
    id,
    messages: initialMessages,
    generateId: generateUUID,
    sendAutomaticallyWhen: ({ messages: currentMessages }) => {
      const lastMessage = currentMessages.at(-1);
      const shouldContinue =
        lastMessage?.parts?.some(
          (part) =>
            "state" in part &&
            (part.state === "approval-responded" ||
              part.state === "output-denied")
        ) ?? false;
      return shouldContinue;
    },
    transport: new DefaultChatTransport({
      api: "/api/chat",
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest(request) {
        const lastMessage = request.messages.at(-1);
        const isToolApprovalContinuation =
          lastMessage?.role !== "user" ||
          request.messages.some((msg) =>
            msg.parts?.some((part) => {
              const state = (part as { state?: string }).state;
              return (
                state === "approval-responded" || state === "output-denied"
              );
            })
          );

        return {
          body: {
            id: request.id,
            ...(projectId ? { projectId } : {}),
            ...(isToolApprovalContinuation
              ? { messages: request.messages }
              : { message: lastMessage }),
            selectedChatModel: currentModelIdRef.current,
            selectedVisibilityType: visibilityType,
            ...request.body,
          },
        };
      },
    }),
    onData: (dataPart) => {
      if (dataPart.type === "data-chat-title" && !projectTitle) {
        setCurrentProjectTitle(dataPart.data);
      }
      setDataStream((ds) => (ds ? [...ds, dataPart] : []));
    },
    onFinish: () => {
      mutate(unstable_serialize(getChatHistoryPaginationKey));
      if (financeSnapshotKey) {
        mutate(financeSnapshotKey);
      }
    },
    onError: (error) => {
      if (error instanceof ChatSDKError) {
        if (
          error.message?.includes("AI Gateway requires a valid credit card")
        ) {
          setShowCreditCardAlert(true);
        } else {
          toast({
            type: "error",
            description: error.message,
          });
        }
      }
    },
  });

  const sendMessageWithAutoDenyPendingToolApprovals = useCallback<
    typeof sendMessage
  >(
    async (message, options) => {
      if (message) {
        const nextMessages = autoDenyPendingToolApprovals(messages);

        if (nextMessages !== messages) {
          setMessages(nextMessages);
        }
      }

      await sendMessage(message, options);
    },
    [messages, sendMessage, setMessages]
  );

  const retryIncompleteResponse = useCallback(async () => {
    const lastMessage = messages.at(-1);

    if (!lastMessage || lastMessage.role !== "user") {
      return;
    }

    await sendMessage(undefined, {
      body: {
        messages,
      },
    });
  }, [messages, sendMessage]);

  const searchParams = useSearchParams();
  const query = searchParams.get("query");
  const showRulesView =
    searchParams.get("view") === "rules" &&
    Boolean(projectId) &&
    hasFinanceDataset;

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      sendMessageWithAutoDenyPendingToolApprovals({
        role: "user" as const,
        parts: [{ type: "text", text: query }],
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, "", `/chat/${id}`);
    }
  }, [
    query,
    sendMessageWithAutoDenyPendingToolApprovals,
    hasAppendedQuery,
    id,
  ]);

  useEffect(() => {
    if (status !== "ready") {
      return;
    }

    if (
      !lastAssistantMessageIsCompleteWithApprovalResponses({
        messages,
      })
    ) {
      return;
    }

    const lastMessage = messages.at(-1);

    if (!lastMessage) {
      return;
    }

    const continuationKey = `${lastMessage.id}:${lastMessage.parts
      .map((part) => {
        const state = "state" in part ? part.state : "";
        const approvalId =
          "approval" in part && part.approval
            ? ((part.approval as { id?: string }).id ?? "")
            : "";

        return `${part.type}:${state}:${approvalId}`;
      })
      .join("|")}`;

    if (resumedApprovalContinuationRef.current === continuationKey) {
      return;
    }

    resumedApprovalContinuationRef.current = continuationKey;
    sendMessage();
  }, [messages, sendMessage, status]);

  const { data: votes } = useSWR<Vote[]>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher
  );

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  useAutoResume({
    autoResume,
    initialMessages,
    resumeStream,
    setMessages,
  });

  const chatShell = (
    <div className="overscroll-behavior-contain flex h-full min-w-0 touch-pan-y flex-col bg-background">
      <ChatHeader
        chatId={id}
        isReadonly={isReadonly}
        projectId={projectId}
        projectTitle={currentProjectTitle}
        selectedVisibilityType={initialVisibilityType}
      />

      <Messages
        addToolApprovalResponse={addToolApprovalResponse}
        chatId={id}
        hasFinanceDataset={hasFinanceDataset}
        isArtifactVisible={isArtifactVisible}
        isReadonly={isReadonly}
        messages={messages}
        regenerate={regenerate}
        retryIncompleteResponse={retryIncompleteResponse}
        selectedModelId={initialChatModel}
        setMessages={setMessages}
        status={status}
        votes={votes}
      />

      <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl gap-2 border-t-0 bg-background px-2 pb-3 md:px-4 md:pb-4">
        {!isReadonly && (
          <MultimodalInput
            attachments={attachments}
            chatId={id}
            hasFinanceDataset={hasFinanceDataset}
            input={input}
            messages={messages}
            onFinanceUploaded={() => {
              setHasFinanceDataset(true);
              if (projectId) {
                mutate(`/api/finance/project/${projectId}`);
              }
            }}
            onModelChange={setCurrentModelId}
            projectId={projectId}
            selectedModelId={currentModelId}
            selectedVisibilityType={visibilityType}
            sendMessage={sendMessageWithAutoDenyPendingToolApprovals}
            setAttachments={setAttachments}
            setInput={setInput}
            setMessages={setMessages}
            status={status}
            stop={stop}
          />
        )}
      </div>
    </div>
  );
  const mainShell =
    showRulesView && projectId ? (
      <FinanceRulesView
        projectId={projectId}
        projectTitle={currentProjectTitle}
      />
    ) : (
      chatShell
    );

  return (
    <>
      {hasFinanceDataset && projectId && width && width >= 1024 ? (
        <PanelGroup className="h-dvh" direction="horizontal">
          <Panel defaultSize={48} minSize={34}>
            {mainShell}
          </Panel>
          <PanelResizeHandle className="w-px bg-border" />
          <Panel defaultSize={52} minSize={30}>
            <div className="h-dvh overflow-y-auto border-l bg-muted/20">
              <FinanceDashboard
                initialSnapshot={initialFinanceSnapshot}
                projectId={projectId}
              />
            </div>
          </Panel>
        </PanelGroup>
      ) : hasFinanceDataset && projectId ? (
        <div className="flex h-dvh flex-col">
          <div className="min-h-0 flex-1">{mainShell}</div>
          <div className="min-h-[20rem] border-t bg-muted/20">
            <FinanceDashboard
              initialSnapshot={initialFinanceSnapshot}
              projectId={projectId}
            />
          </div>
        </div>
      ) : (
        <div className="h-dvh">{mainShell}</div>
      )}

      <Artifact
        addToolApprovalResponse={addToolApprovalResponse}
        attachments={attachments}
        chatId={id}
        input={input}
        isReadonly={isReadonly}
        messages={messages}
        regenerate={regenerate}
        selectedModelId={currentModelId}
        selectedVisibilityType={visibilityType}
        sendMessage={sendMessageWithAutoDenyPendingToolApprovals}
        setAttachments={setAttachments}
        setInput={setInput}
        setMessages={setMessages}
        status={status}
        stop={stop}
        votes={votes}
      />

      <AlertDialog
        onOpenChange={setShowCreditCardAlert}
        open={showCreditCardAlert}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate AI Gateway</AlertDialogTitle>
            <AlertDialogDescription>
              This application requires{" "}
              {process.env.NODE_ENV === "production" ? "the owner" : "you"} to
              activate Vercel AI Gateway.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                window.open(
                  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card",
                  "_blank"
                );
                window.location.href = "/";
              }}
            >
              Activate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
