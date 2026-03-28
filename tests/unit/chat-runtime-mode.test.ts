import assert from "node:assert/strict";
import test from "node:test";
import { getChatRuntimeMode } from "@/lib/ai/chat-runtime-mode";

test("finance chats stay on the finance runtime during approval continuations", () => {
  assert.equal(
    getChatRuntimeMode({
      isFinanceChat: true,
    }),
    "finance"
  );
});

test("non-finance chats use the general runtime", () => {
  assert.equal(
    getChatRuntimeMode({
      isFinanceChat: false,
    }),
    "general"
  );
});
