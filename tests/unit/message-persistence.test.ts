import assert from "node:assert/strict";
import test from "node:test";
import { planPersistableMessageWrites } from "@/lib/ai/message-persistence";
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

test("planPersistableMessageWrites inserts only the new assistant reply when the user message already exists", () => {
  const userMessage = buildMessage({
    id: "user-1",
    role: "user",
    parts: [{ type: "text", text: "Where are the mortgage payments?" }],
  });
  const assistantMessage = buildMessage({
    id: "assistant-1",
    role: "assistant",
    parts: [{ type: "text", text: "They start in August 2025." }],
  });

  const result = planPersistableMessageWrites({
    existingMessages: [userMessage],
    finishedMessages: [userMessage, assistantMessage],
  });

  assert.deepEqual(result.updates, []);
  assert.deepEqual(result.inserts, [assistantMessage]);
});

test("planPersistableMessageWrites updates an existing assistant message when the parts changed", () => {
  const userMessage = buildMessage({
    id: "user-1",
    role: "user",
    parts: [{ type: "text", text: "Where are the mortgage payments?" }],
  });
  const partialAssistant = buildMessage({
    id: "assistant-1",
    role: "assistant",
    parts: [{ type: "text", text: "Let me check", state: "streaming" }],
  });
  const completedAssistant = buildMessage({
    id: "assistant-1",
    role: "assistant",
    parts: [{ type: "text", text: "They start in August 2025." }],
  });

  const result = planPersistableMessageWrites({
    existingMessages: [userMessage, partialAssistant],
    finishedMessages: [userMessage, completedAssistant],
  });

  assert.deepEqual(result.updates, [completedAssistant]);
  assert.deepEqual(result.inserts, []);
});

test("planPersistableMessageWrites ignores unchanged existing messages and empty outputs", () => {
  const userMessage = buildMessage({
    id: "user-1",
    role: "user",
    parts: [{ type: "text", text: "Where are the mortgage payments?" }],
  });
  const emptyAssistant = buildMessage({
    id: "assistant-empty",
    role: "assistant",
    parts: [],
  });

  const result = planPersistableMessageWrites({
    existingMessages: [userMessage],
    finishedMessages: [userMessage, emptyAssistant],
  });

  assert.deepEqual(result.updates, []);
  assert.deepEqual(result.inserts, []);
});
