import { convertToModelMessages } from "ai";
import {
  getChatStreamFailures,
  type ChatStreamFailureLog,
} from "@/lib/ai/logging";
import { sanitizeUIMessagesForModel } from "@/lib/ai/message-history";
import type { Chat, DBMessage } from "@/lib/db/schema";
import { convertToUIMessages } from "@/lib/utils";

type ModelMessages = Awaited<ReturnType<typeof convertToModelMessages>>;
type ModelMessage = ModelMessages[number];

export type ChatDebugPartStats = {
  index: number;
  type: string;
  state: string | null;
  bytes: number;
  textBytes: number;
  inputBytes: number;
  outputBytes: number;
};

export type ChatDebugUiMessage = {
  id: string;
  role: string;
  createdAt: string | null;
  bytes: number;
  parts: unknown[];
  partStats: ChatDebugPartStats[];
};

export type ChatDebugModelMessage = {
  role: string;
  bytes: number;
  content: unknown;
};

export type ChatDebugPayload = {
  chat: {
    id: string;
    projectId: string;
    userId: string;
    title: string;
    createdAt: string;
  };
  streamIds: string[];
  totals: {
    persistedMessageCount: number;
    rawUiBytes: number;
    sanitizedUiBytes: number;
    modelBytes: number;
    toolResultCount: number;
    loggedFailureCount: number;
  };
  streamFailures: ChatStreamFailureLog[];
  rawUiMessages: ChatDebugUiMessage[];
  sanitizedUiMessages: ChatDebugUiMessage[];
  modelMessages: ChatDebugModelMessage[];
};

function getJsonByteSize(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function getPartStats(part: unknown, index: number): ChatDebugPartStats {
  const candidate =
    typeof part === "object" && part !== null
      ? (part as {
          type?: string;
          state?: string;
          text?: string;
          input?: unknown;
          output?: unknown;
        })
      : {};

  return {
    index,
    type: candidate.type ?? "unknown",
    state: candidate.state ?? null,
    bytes: getJsonByteSize(part),
    textBytes:
      typeof candidate.text === "string"
        ? Buffer.byteLength(candidate.text, "utf8")
        : 0,
    inputBytes:
      typeof candidate.input === "undefined" ? 0 : getJsonByteSize(candidate.input),
    outputBytes:
      typeof candidate.output === "undefined"
        ? 0
        : getJsonByteSize(candidate.output),
  };
}

function serializeUiMessage(message: {
  id: string;
  role: string;
  parts: unknown[];
  metadata?: { createdAt?: string };
}): ChatDebugUiMessage {
  return {
    id: message.id,
    role: message.role,
    createdAt: message.metadata?.createdAt ?? null,
    bytes: getJsonByteSize(message),
    parts: message.parts,
    partStats: message.parts.map((part, index) => getPartStats(part, index)),
  };
}

function serializeModelMessage(message: ModelMessage): ChatDebugModelMessage {
  return {
    role: message.role,
    bytes: getJsonByteSize(message),
    content: message.content,
  };
}

export async function buildChatDebugPayload({
  chat,
  messages,
  streamIds,
}: {
  chat: Chat;
  messages: DBMessage[];
  streamIds: string[];
}): Promise<ChatDebugPayload> {
  const rawUiMessages = convertToUIMessages(messages);
  const sanitizedUiMessages = sanitizeUIMessagesForModel(rawUiMessages);
  const modelMessages = await convertToModelMessages(sanitizedUiMessages);

  const serializedRawUiMessages = rawUiMessages.map(serializeUiMessage);
  const serializedSanitizedUiMessages =
    sanitizedUiMessages.map(serializeUiMessage);
  const serializedModelMessages = modelMessages.map(serializeModelMessage);
  const streamFailures = getChatStreamFailures({ chatId: chat.id });

  const toolResultCount = serializedModelMessages.reduce((count, message) => {
    const content = Array.isArray(message.content) ? message.content : [];

    return (
      count +
      content.filter(
        (part) =>
          typeof part === "object" &&
          part !== null &&
          "type" in part &&
          (part as { type?: string }).type === "tool-result"
      ).length
    );
  }, 0);

  return {
    chat: {
      id: chat.id,
      projectId: chat.projectId,
      userId: chat.userId,
      title: chat.title,
      createdAt: chat.createdAt.toISOString(),
    },
    streamIds,
    totals: {
      persistedMessageCount: messages.length,
      rawUiBytes: getJsonByteSize(serializedRawUiMessages),
      sanitizedUiBytes: getJsonByteSize(serializedSanitizedUiMessages),
      modelBytes: getJsonByteSize(serializedModelMessages),
      toolResultCount,
      loggedFailureCount: streamFailures.length,
    },
    streamFailures,
    rawUiMessages: serializedRawUiMessages,
    sanitizedUiMessages: serializedSanitizedUiMessages,
    modelMessages: serializedModelMessages,
  };
}
