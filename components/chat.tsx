"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { deleteTrailingMessages } from "@/app/(chat)/actions";
import { ChatHeader } from "@/components/chat-header";
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
import { buildChatTransportBody } from "@/lib/ai/chat-request";
import {
  autoDenyPendingToolApprovals,
  getRetryableChatHistory,
} from "@/lib/ai/message-history";
import { isChatHistoryCacheKey } from "@/lib/chat-history";
import type { Vote } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import type { Attachment, ChatMessage } from "@/lib/types";
import { fetcher, fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { Artifact } from "./artifact";
import { useDataStream } from "./data-stream-provider";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";
import { toast } from "./toast";
import type { VisibilityType } from "./visibility-selector";

function getRequestErrorMessage(error: unknown) {
  if (error instanceof ChatSDKError) {
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message.trim();

    if (message.length > 0) {
      return message;
    }
  }

  return "We couldn't finish that reply. Please try again.";
}

export function Chat({
  id,
  projectId,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  autoResume,
  initialHasFinanceDataset,
  showModelPicker,
}: {
  id: string;
  projectId: string | null;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  autoResume: boolean;
  initialHasFinanceDataset: boolean;
  showModelPicker: boolean;
}) {
  const router = useRouter();

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
  const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(
    null
  );
  const [currentModelId, setCurrentModelId] = useState(initialChatModel);
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
        return {
          body: buildChatTransportBody({
            id: request.id,
            projectId,
            requestMessages: request.messages,
            requestBody: request.body,
            selectedChatModel: currentModelIdRef.current,
            selectedVisibilityType: visibilityType,
          }),
        };
      },
    }),
    onData: (dataPart) => {
      setDataStream((ds) => (ds ? [...ds, dataPart] : []));
    },
    onFinish: () => {
      setRequestErrorMessage(null);
      mutate(isChatHistoryCacheKey, undefined, { revalidate: true });
      if (financeSnapshotKey) {
        mutate(financeSnapshotKey);
      }
    },
    onError: (error) => {
      const description = getRequestErrorMessage(error);
      setRequestErrorMessage(description);

      if (error instanceof ChatSDKError) {
        if (
          error.message?.includes("AI Gateway requires a valid credit card")
        ) {
          setShowCreditCardAlert(true);
        } else {
          toast({
            type: "error",
            description,
          });
        }

        return;
      }

      toast({
        type: "error",
        description,
      });
    },
  });

  const sendMessageWithAutoDenyPendingToolApprovals = useCallback<
    typeof sendMessage
  >(
    async (message, options) => {
      setRequestErrorMessage(null);

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
    const retryableHistory = getRetryableChatHistory(messages);

    if (!retryableHistory) {
      return;
    }

    if (retryableHistory.trailingMessageIdToDelete) {
      await deleteTrailingMessages({
        id: retryableHistory.trailingMessageIdToDelete,
      });

      setMessages(retryableHistory.messages);
    }

    setRequestErrorMessage(null);
    await sendMessage(undefined, {
      body: {
        messages: retryableHistory.messages,
      },
    });
  }, [messages, sendMessage, setMessages]);

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
        selectedVisibilityType={initialVisibilityType}
      />

      <Messages
        addToolApprovalResponse={addToolApprovalResponse}
        chatId={id}
        errorMessage={status === "error" ? requestErrorMessage : null}
        hasFinanceDataset={hasFinanceDataset}
        isArtifactVisible={isArtifactVisible}
        isReadonly={isReadonly}
        messages={messages}
        regenerate={regenerate}
        retryIncompleteResponse={retryIncompleteResponse}
        selectedModelId={currentModelId}
        setMessages={setMessages}
        status={status}
        votes={votes}
      />

      <div className="sticky bottom-0 z-10 mx-auto flex w-full max-w-4xl gap-2 border-border/60 border-t bg-gradient-to-t from-background via-background to-background/90 px-2 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur supports-[backdrop-filter]:bg-background/90 md:px-4 md:pb-[calc(env(safe-area-inset-bottom)+1rem)]">
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
            showModelSelector={showModelPicker}
            status={status}
            stop={stop}
          />
        )}
      </div>
    </div>
  );
  const mainShell =
    showRulesView && projectId ? (
      <FinanceRulesView projectId={projectId} />
    ) : (
      chatShell
    );

  return (
    <>
      <div className="h-dvh">{mainShell}</div>

      <Artifact
        addToolApprovalResponse={addToolApprovalResponse}
        attachments={attachments}
        chatId={id}
        input={input}
        isReadonly={isReadonly}
        messages={messages}
        onModelChange={setCurrentModelId}
        regenerate={regenerate}
        selectedModelId={currentModelId}
        selectedVisibilityType={visibilityType}
        sendMessage={sendMessageWithAutoDenyPendingToolApprovals}
        setAttachments={setAttachments}
        setInput={setInput}
        setMessages={setMessages}
        showModelSelector={showModelPicker}
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
