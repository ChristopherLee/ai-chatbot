type LogContext = Record<string, unknown>;

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
      console.error("Tool execution failed", {
        toolName,
        input,
        ...(context ?? {}),
        error: getErrorLogDetails(error),
      });
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
  console.error("Chat stream failed", {
    chatId,
    projectId,
    scope,
    selectedChatModel,
    error: getErrorLogDetails(error),
  });
}
