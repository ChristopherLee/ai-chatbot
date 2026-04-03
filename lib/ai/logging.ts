type LogContext = Record<string, unknown>;
const MAX_CHAT_STREAM_FAILURES_PER_CHAT = 20;

function formatLogPayload(payload: Record<string, unknown>) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return payload;
  }
}

function getErrorCause(error: Error) {
  if (!("cause" in error)) {
    return undefined;
  }

  const { cause } = error;

  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message,
      stack: cause.stack,
    };
  }

  return cause;
}

export function getErrorLogDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: getErrorCause(error),
    };
  }

  return {
    message:
      typeof error === "string" ? error : "A non-Error value was thrown.",
    value: typeof error === "string" ? undefined : error,
  };
}

export type ChatStreamFailureLog = {
  chatId: string;
  projectId: string | null;
  scope: "chat" | "finance" | "stream";
  selectedChatModel: string;
  timestamp: string;
  error: ReturnType<typeof getErrorLogDetails>;
};

declare global {
  // eslint-disable-next-line no-var
  var __chatStreamFailuresByChatId:
    | Map<string, ChatStreamFailureLog[]>
    | undefined;
}

function getChatStreamFailureStore() {
  if (!globalThis.__chatStreamFailuresByChatId) {
    globalThis.__chatStreamFailuresByChatId = new Map();
  }

  return globalThis.__chatStreamFailuresByChatId;
}

function recordChatStreamFailure(log: ChatStreamFailureLog) {
  const store = getChatStreamFailureStore();
  const existingLogs = store.get(log.chatId) ?? [];
  const nextLogs = [...existingLogs, log].slice(-MAX_CHAT_STREAM_FAILURES_PER_CHAT);
  store.set(log.chatId, nextLogs);
}

export function getChatStreamFailures({ chatId }: { chatId: string }) {
  return [...(getChatStreamFailureStore().get(chatId) ?? [])];
}

export function resetChatStreamFailuresForTests() {
  getChatStreamFailureStore().clear();
}

export function withToolErrorLogging<Input, Output>({
  context,
  execute,
  toolName,
}: {
  context?: LogContext;
  execute: (input: Input) => Promise<Output> | Output;
  toolName: string;
}) {
  return async (input: Input) => {
    try {
      return await execute(input);
    } catch (error) {
      console.error(
        "Tool execution failed",
        formatLogPayload({
          toolName,
          input,
          ...(context ?? {}),
          error: getErrorLogDetails(error),
        })
      );
      throw error;
    }
  };
}

export function logChatStreamFailure({
  chatId,
  error,
  projectId,
  scope,
  selectedChatModel,
}: {
  chatId: string;
  error: unknown;
  projectId: string | null;
  scope: "chat" | "finance" | "stream";
  selectedChatModel: string;
}) {
  const payload: ChatStreamFailureLog = {
    chatId,
    projectId,
    scope,
    selectedChatModel,
    timestamp: new Date().toISOString(),
    error: getErrorLogDetails(error),
  };

  recordChatStreamFailure(payload);

  console.error(
    "Chat stream failed",
    formatLogPayload(payload)
  );
}
