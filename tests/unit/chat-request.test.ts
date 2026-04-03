import assert from "node:assert/strict";
import test from "node:test";
import { buildChatTransportBody } from "@/lib/ai/chat-request";
import type { ChatMessage } from "@/lib/types";

function buildMessage(message: Partial<ChatMessage>): ChatMessage {
  return {
    id: message.id ?? "message-id",
    role: message.role ?? "assistant",
    parts: message.parts ?? [],
    metadata: message.metadata ?? {
      createdAt: "2026-04-02T00:00:00.000Z",
    },
  } as ChatMessage;
}

test("buildChatTransportBody sends a single user message for normal chat requests", () => {
  const userMessage = buildMessage({
    id: "user-1",
    role: "user",
    parts: [{ type: "text", text: "Make this plan more conservative." }],
  });

  const body = buildChatTransportBody({
    id: "chat-1",
    projectId: "project-1",
    requestMessages: [userMessage],
    selectedChatModel: "openrouter/auto",
    selectedVisibilityType: "private",
  });

  assert.deepEqual(body, {
    id: "chat-1",
    projectId: "project-1",
    message: userMessage,
    selectedChatModel: "openrouter/auto",
    selectedVisibilityType: "private",
  });
});

test("buildChatTransportBody treats explicit retry history as a continuation payload", () => {
  const userMessage = buildMessage({
    id: "user-1",
    role: "user",
    parts: [{ type: "text", text: "Retry that answer." }],
  });

  const body = buildChatTransportBody({
    id: "chat-1",
    projectId: "project-1",
    requestMessages: [userMessage],
    requestBody: {
      messages: [userMessage],
      retryReason: "incomplete-response",
    },
    selectedChatModel: "openrouter/auto",
    selectedVisibilityType: "private",
  });

  assert.deepEqual(body, {
    id: "chat-1",
    projectId: "project-1",
    messages: [userMessage],
    retryReason: "incomplete-response",
    selectedChatModel: "openrouter/auto",
    selectedVisibilityType: "private",
  });
  assert.equal("message" in body, false);
});

test("buildChatTransportBody keeps approval continuations on the messages path", () => {
  const userMessage = buildMessage({
    id: "user-1",
    role: "user",
    parts: [{ type: "text", text: "Save these changes." }],
  });
  const assistantMessage = buildMessage({
    id: "assistant-1",
    role: "assistant",
    parts: [
      {
        type: "tool-applyFinanceActions",
        toolCallId: "tool-call-1",
        state: "approval-responded",
        input: { actions: [] },
        approval: {
          id: "approval-1",
          approved: false,
          reason: "User rejected the proposal.",
        },
      },
    ],
  });

  const body = buildChatTransportBody({
    id: "chat-1",
    projectId: "project-1",
    requestMessages: [userMessage, assistantMessage],
    selectedChatModel: "openrouter/auto",
    selectedVisibilityType: "private",
  });

  assert.deepEqual(body, {
    id: "chat-1",
    projectId: "project-1",
    messages: [userMessage, assistantMessage],
    selectedChatModel: "openrouter/auto",
    selectedVisibilityType: "private",
  });
});
