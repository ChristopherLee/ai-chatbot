import assert from "node:assert/strict";
import test from "node:test";
import {
  logChatStreamFailure,
  resetChatStreamFailuresForTests,
} from "@/lib/ai/logging";
import { buildChatDebugPayload } from "@/lib/debug/chat-history";
import type { Chat } from "@/lib/db/schema";

function buildChat(chatId: string): Chat {
  return {
    id: chatId,
    projectId: "project-1",
    userId: "user-1",
    title: "Debug chat",
    visibility: "private",
    createdAt: new Date("2026-04-02T12:00:00.000Z"),
  };
}

test.afterEach(() => {
  resetChatStreamFailuresForTests();
});

test("buildChatDebugPayload includes full logged failure details for the chat", async () => {
  const chatId = "chat-debug-1";
  const error = new Error("Primary stream failure", {
    cause: new Error("Nested provider cause"),
  });

  logChatStreamFailure({
    chatId,
    error,
    projectId: "project-1",
    scope: "finance",
    selectedChatModel: "openai/gpt-5.4-mini",
  });

  const payload = await buildChatDebugPayload({
    chat: buildChat(chatId),
    messages: [],
    streamIds: [],
  });

  assert.equal(payload.totals.loggedFailureCount, 1);
  assert.equal(payload.streamFailures.length, 1);
  assert.equal(payload.streamFailures[0]?.scope, "finance");
  assert.equal(
    payload.streamFailures[0]?.selectedChatModel,
    "openai/gpt-5.4-mini"
  );
  assert.equal(
    payload.streamFailures[0]?.error.message,
    "Primary stream failure"
  );
  assert.equal(
    (
      payload.streamFailures[0]?.error.cause as {
        message?: string;
      }
    )?.message,
    "Nested provider cause"
  );
  assert.match(payload.streamFailures[0]?.timestamp ?? "", /2026|T/);
});

test("buildChatDebugPayload scopes logged failures to the requested chat", async () => {
  logChatStreamFailure({
    chatId: "chat-debug-a",
    error: new Error("Failure A"),
    projectId: "project-a",
    scope: "chat",
    selectedChatModel: "model-a",
  });

  logChatStreamFailure({
    chatId: "chat-debug-b",
    error: new Error("Failure B"),
    projectId: "project-b",
    scope: "stream",
    selectedChatModel: "model-b",
  });

  const payload = await buildChatDebugPayload({
    chat: buildChat("chat-debug-b"),
    messages: [],
    streamIds: [],
  });

  assert.equal(payload.totals.loggedFailureCount, 1);
  assert.equal(payload.streamFailures.length, 1);
  assert.equal(payload.streamFailures[0]?.chatId, "chat-debug-b");
  assert.equal(payload.streamFailures[0]?.error.message, "Failure B");
});
