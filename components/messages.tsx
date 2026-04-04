import type { UseChatHelpers } from "@ai-sdk/react";
import { ArrowDownIcon } from "lucide-react";
import { memo } from "react";
import { useMessages } from "@/hooks/use-messages";
import { getRetryableChatHistory } from "@/lib/ai/message-history";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDataStream } from "./data-stream-provider";
import { Greeting } from "./greeting";
import { PreviewMessage, ThinkingMessage } from "./message";

type MessagesProps = {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  hasFinanceDataset: boolean;
  status: UseChatHelpers<ChatMessage>["status"];
  errorMessage: string | null;
  votes: Vote[] | undefined;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  retryIncompleteResponse: () => Promise<void>;
  isReadonly: boolean;
  isArtifactVisible: boolean;
  selectedModelId: string;
};

function PureMessages({
  addToolApprovalResponse,
  chatId,
  hasFinanceDataset,
  status,
  errorMessage,
  votes,
  messages,
  setMessages,
  regenerate,
  retryIncompleteResponse,
  isReadonly,
  selectedModelId: _selectedModelId,
}: MessagesProps) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    scrollToBottom,
    hasSentMessage,
  } = useMessages({
    status,
  });

  useDataStream();

  const lastMessage = messages.at(-1);
  const retryableHistory = getRetryableChatHistory(messages);
  const canRetryResponse = Boolean(retryableHistory);
  const hasApprovalContinuation = messages.some((msg) =>
    msg.parts?.some(
      (part) => "state" in part && part.state === "approval-responded"
    )
  );
  const shouldShowThinkingMessage =
    !hasApprovalContinuation &&
    (status === "submitted" ||
      (status === "streaming" && lastMessage?.role !== "assistant"));
  const shouldShowChatIssueNotice =
    !isReadonly &&
    (status === "error" || (canRetryResponse && status === "ready"));

  return (
    <div className="relative flex-1">
      <div
        className="absolute inset-0 touch-pan-y overflow-y-auto"
        ref={messagesContainerRef}
      >
        <div className="mx-auto flex min-w-0 max-w-4xl flex-col gap-4 px-3 py-4 md:gap-6 md:px-4 md:py-6">
          {messages.length === 0 && (
            <Greeting hasFinanceDataset={hasFinanceDataset} />
          )}

          {messages.map((message, index) => (
            <PreviewMessage
              addToolApprovalResponse={addToolApprovalResponse}
              chatId={chatId}
              isLoading={
                status === "streaming" && messages.length - 1 === index
              }
              isReadonly={isReadonly}
              key={message.id}
              message={message}
              regenerate={regenerate}
              requiresScrollPadding={
                hasSentMessage && index === messages.length - 1
              }
              setMessages={setMessages}
              vote={
                votes
                  ? votes.find((vote) => vote.messageId === message.id)
                  : undefined
              }
            />
          ))}

          {shouldShowThinkingMessage && <ThinkingMessage />}

          {shouldShowChatIssueNotice && (
            <div
              className={cn(
                "rounded-lg border px-4 py-3 text-sm",
                status === "error"
                  ? "border-red-200 bg-red-50 text-red-950"
                  : "border-amber-200 bg-amber-50 text-amber-950"
              )}
              data-testid="chat-issue-banner"
            >
              <div className="font-medium">
                {status === "error"
                  ? "The previous reply failed before it finished."
                  : lastMessage?.role === "assistant"
                    ? "The previous reply was interrupted mid-response."
                    : "The previous reply did not finish."}
              </div>
              <div
                className={cn(
                  "mt-1",
                  status === "error" ? "text-red-900/80" : "text-amber-900/80"
                )}
              >
                {status === "error"
                  ? errorMessage ??
                    "We couldn't finish that reply. Please try again."
                  : "Retry the last response to continue from the saved chat history."}
                {status === "error" && canRetryResponse
                  ? " Retry the last response to continue from the saved chat history."
                  : ""}
              </div>
              {canRetryResponse && (
                <button
                  className={cn(
                    "mt-3 inline-flex items-center rounded-md px-3 py-1.5 font-medium transition-colors",
                    status === "error"
                      ? "bg-red-900 text-red-50 hover:bg-red-950"
                      : "bg-amber-900 text-amber-50 hover:bg-amber-950"
                  )}
                  onClick={() => {
                    retryIncompleteResponse().catch(() => undefined);
                  }}
                  type="button"
                >
                  Retry response
                </button>
              )}
            </div>
          )}

          <div
            className="min-h-24 min-w-[24px] shrink-0 md:min-h-28"
            ref={messagesEndRef}
          />
        </div>
      </div>

      <button
        aria-label="Scroll to bottom"
        className={`absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-background p-2 shadow-lg transition-all hover:bg-muted md:bottom-6 ${
          isAtBottom
            ? "pointer-events-none scale-0 opacity-0"
            : "pointer-events-auto scale-100 opacity-100"
        }`}
        onClick={() => scrollToBottom("smooth")}
        type="button"
      >
        <ArrowDownIcon className="size-4" />
      </button>
    </div>
  );
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  return (
    prevProps.addToolApprovalResponse === nextProps.addToolApprovalResponse &&
    prevProps.chatId === nextProps.chatId &&
    prevProps.hasFinanceDataset === nextProps.hasFinanceDataset &&
    prevProps.status === nextProps.status &&
    prevProps.errorMessage === nextProps.errorMessage &&
    prevProps.votes === nextProps.votes &&
    prevProps.messages === nextProps.messages &&
    prevProps.setMessages === nextProps.setMessages &&
    prevProps.regenerate === nextProps.regenerate &&
    prevProps.retryIncompleteResponse === nextProps.retryIncompleteResponse &&
    prevProps.isReadonly === nextProps.isReadonly &&
    prevProps.isArtifactVisible === nextProps.isArtifactVisible &&
    prevProps.selectedModelId === nextProps.selectedModelId
  );
});
