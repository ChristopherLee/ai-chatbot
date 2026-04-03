import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CHAT_MODEL,
  getChatModelById,
  getSavedChatModelId,
} from "@/lib/ai/models";

test("restores a saved chat model from an encoded cookie value", () => {
  const restoredModelId = getSavedChatModelId("openai%2Fgpt-oss-20b%3Afree");

  assert.equal(restoredModelId, "openai/gpt-oss-20b:free");
  assert.equal(getChatModelById(restoredModelId)?.name, "gpt-oss-20b");
});

test("falls back to the project default for unsupported saved models", () => {
  assert.equal(getSavedChatModelId("not-a-real-model"), DEFAULT_CHAT_MODEL);
});
