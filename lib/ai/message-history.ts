import {
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import type { ChatMessage } from "@/lib/types";

const UNRESOLVED_APPROVAL_STATES = new Set([
  "approval-requested",
  "approval-responded",
]);
const PENDING_APPROVAL_STATE = "approval-requested";

export const AUTO_DENY_TOOL_APPROVAL_REASON =
  "User sent a follow-up message instead of responding to the pending tool approval.";

type RetryableChatHistory = {
  messages: ChatMessage[];
  trailingMessageIdToDelete: string | null;
};

function stripUnresolvedApprovalParts(message: ChatMessage) {
  if (message.role !== "assistant") {
    return message;
  }

  const nextParts = message.parts.filter((part) => {
    const state = (part as { state?: string }).state;
    return !UNRESOLVED_APPROVAL_STATES.has(state ?? "");
  });

  if (nextParts.length === message.parts.length) {
    return message;
  }

  return {
    ...message,
    parts: nextParts,
  };
}

function denyPendingApprovalParts(message: ChatMessage, reason: string) {
  if (message.role !== "assistant") {
    return message;
  }

  let didChange = false;
  const nextParts = message.parts.map((part) => {
    const state = (part as { state?: string }).state;
    const approvalId = (part as { approval?: { id?: string } }).approval?.id;

    if (state !== PENDING_APPROVAL_STATE || !approvalId) {
      return part;
    }

    didChange = true;

    return {
      ...part,
      state: "approval-responded",
      approval: {
        id: approvalId,
        approved: false,
        reason,
      },
    } as typeof part;
  });

  if (!didChange) {
    return message;
  }

  return {
    ...message,
    parts: nextParts,
  };
}

export function sanitizeUIMessagesForModel(messages: ChatMessage[]) {
  return messages
    .map(stripUnresolvedApprovalParts)
    .filter((message) => message.parts.length > 0);
}

export function autoDenyPendingToolApprovals(
  messages: ChatMessage[],
  reason = AUTO_DENY_TOOL_APPROVAL_REASON
) {
  let didChange = false;
  const nextMessages = messages.map((message) => {
    const nextMessage = denyPendingApprovalParts(message, reason);

    if (nextMessage !== message) {
      didChange = true;
    }

    return nextMessage;
  });

  return didChange ? nextMessages : messages;
}

function isRecoverableTrailingAssistantMessage(messages: ChatMessage[]) {
  const lastMessage = messages.at(-1);

  if (lastMessage?.role !== "assistant") {
    return false;
  }

  const hasPendingApproval = lastMessage.parts.some((part) => {
    const state = (part as { state?: string }).state;
    return state === "approval-requested";
  });

  if (hasPendingApproval) {
    return false;
  }

  const hasStreamingPart = lastMessage.parts.some((part) => {
    const state = (part as { state?: string }).state;
    return state === "streaming";
  });

  if (hasStreamingPart) {
    return true;
  }

  const hasOnlyTransientParts =
    lastMessage.parts.length > 0 &&
    lastMessage.parts.every(
      (part) => part.type === "step-start" || part.type.startsWith("data-")
    );

  if (hasOnlyTransientParts) {
    return true;
  }

  const hasToolParts = lastMessage.parts.some((part) =>
    part.type.startsWith("tool-")
  );

  if (!hasToolParts) {
    return false;
  }

  return !(
    lastAssistantMessageIsCompleteWithApprovalResponses({ messages }) ||
    lastAssistantMessageIsCompleteWithToolCalls({ messages })
  );
}

export function getRetryableChatHistory(
  messages: ChatMessage[]
): RetryableChatHistory | null {
  const lastMessage = messages.at(-1);

  if (!lastMessage) {
    return null;
  }

  if (lastMessage.role === "user") {
    return {
      messages,
      trailingMessageIdToDelete: null,
    };
  }

  if (!isRecoverableTrailingAssistantMessage(messages)) {
    return null;
  }

  const retryableMessages = messages.slice(0, -1);

  if (retryableMessages.length === 0) {
    return null;
  }

  return {
    messages: retryableMessages,
    trailingMessageIdToDelete: lastMessage.id,
  };
}

export function filterPersistableMessages(messages: ChatMessage[]) {
  return messages.filter((message) => message.parts.length > 0);
}
