import type { ChatMessage } from "@/lib/types";

type BuildChatTransportBodyParams = {
  id: string;
  projectId: string | null;
  requestMessages: ChatMessage[];
  requestBody?: Record<string, unknown>;
  selectedChatModel: string;
  selectedVisibilityType: "public" | "private";
};

export function buildChatTransportBody({
  id,
  projectId,
  requestMessages,
  requestBody,
  selectedChatModel,
  selectedVisibilityType,
}: BuildChatTransportBodyParams) {
  const rawBody = (requestBody ?? {}) as Record<string, unknown> & {
    message?: unknown;
    messages?: unknown;
  };
  const { message: _ignoredMessage, messages: _ignoredMessages, ...restBody } =
    rawBody;
  const explicitMessages = Array.isArray(rawBody.messages)
    ? (rawBody.messages as ChatMessage[])
    : null;
  const lastMessage = requestMessages.at(-1);
  const isContinuation =
    explicitMessages !== null ||
    lastMessage?.role !== "user" ||
    requestMessages.some((message) =>
      message.parts?.some((part) => {
        const state = (part as { state?: string }).state;
        return state === "approval-responded" || state === "output-denied";
      })
    );

  const baseBody = {
    id,
    ...(projectId ? { projectId } : {}),
    selectedChatModel,
    selectedVisibilityType,
  };

  if (isContinuation) {
    return {
      ...baseBody,
      messages: explicitMessages ?? requestMessages,
      ...restBody,
    };
  }

  if (!lastMessage) {
    return {
      ...baseBody,
      ...restBody,
    };
  }

  return {
    ...baseBody,
    message: lastMessage,
    ...restBody,
  };
}
