import type { ChatMessage } from "@/lib/types";

const UNRESOLVED_APPROVAL_STATES = new Set([
  "approval-requested",
  "approval-responded",
]);
const PENDING_APPROVAL_STATE = "approval-requested";

export const AUTO_DENY_TOOL_APPROVAL_REASON =
  "User sent a follow-up message instead of responding to the pending tool approval.";

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

export function filterPersistableMessages(messages: ChatMessage[]) {
  return messages.filter((message) => message.parts.length > 0);
}
