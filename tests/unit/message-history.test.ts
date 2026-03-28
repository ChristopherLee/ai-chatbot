import assert from "node:assert/strict";
import test from "node:test";
import { convertToModelMessages } from "ai";
import {
  AUTO_DENY_TOOL_APPROVAL_REASON,
  autoDenyPendingToolApprovals,
  filterPersistableMessages,
  sanitizeUIMessagesForModel,
} from "@/lib/ai/message-history";
import type { ChatMessage } from "@/lib/types";

function buildMessage(message: Partial<ChatMessage>): ChatMessage {
  return {
    id: message.id ?? "message-id",
    role: message.role ?? "assistant",
    parts: message.parts ?? [],
    metadata: message.metadata ?? {
      createdAt: "2026-03-28T00:00:00.000Z",
    },
  } as ChatMessage;
}

test("sanitizeUIMessagesForModel strips unresolved approval tool parts", async () => {
  const messages = sanitizeUIMessagesForModel([
    buildMessage({
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "Please fix Smartwings." }],
    }),
    buildMessage({
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "text",
          text: "I'll make those changes and then drill into the items.",
          state: "done",
        },
        {
          type: "tool-applyFinanceActions",
          toolCallId: "tool-call-1",
          state: "approval-requested",
          input: {
            actions: [
              {
                type: "categorize_transactions",
                match: { merchant: "Sp Smartwings" },
                to: "Furniture",
              },
            ],
          },
          approval: { id: "approval-1" },
        },
      ],
    }),
    buildMessage({
      id: "user-2",
      role: "user",
      parts: [{ type: "text", text: "Try one more time." }],
    }),
  ]);

  assert.equal(messages.length, 3);
  assert.deepEqual(
    messages[1]?.parts.map((part) => part.type),
    ["text"]
  );

  const modelMessages = await convertToModelMessages(messages);

  assert.equal(
    modelMessages.some(
      (message) =>
        Array.isArray(message.content) &&
        message.content.some((part) => part.type === "tool-approval-request")
    ),
    false
  );
});

test("autoDenyPendingToolApprovals converts pending approvals into denied responses", () => {
  const messages = autoDenyPendingToolApprovals([
    buildMessage({
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "text",
          text: "I can save those finance changes after you approve them.",
          state: "done",
        },
        {
          type: "tool-applyFinanceActions",
          toolCallId: "tool-call-1",
          state: "approval-requested",
          input: {
            actions: [
              {
                type: "categorize_transactions",
                match: { merchant: "Sp Smartwings" },
                to: "Furniture",
              },
            ],
          },
          approval: { id: "approval-1" },
        },
      ],
    }),
  ]);

  const deniedPart = messages[0]?.parts[1] as {
    state?: string;
    approval?: {
      id: string;
      approved?: boolean;
      reason?: string;
    };
  };

  assert.equal(deniedPart.state, "approval-responded");
  assert.deepEqual(deniedPart.approval, {
    id: "approval-1",
    approved: false,
    reason: AUTO_DENY_TOOL_APPROVAL_REASON,
  });
});

test("filterPersistableMessages drops empty streamed messages", () => {
  const messages = filterPersistableMessages([
    buildMessage({
      id: "assistant-empty",
      role: "assistant",
      parts: [],
    }),
    buildMessage({
      id: "assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "Recovered response." }],
    }),
  ]);

  assert.deepEqual(
    messages.map((message) => message.id),
    ["assistant-1"]
  );
});
