import assert from "node:assert/strict";
import test from "node:test";
import { createChatHistoryPaginationKey } from "@/lib/chat-history";

test("createChatHistoryPaginationKey scopes the first page to the selected project", () => {
  const getKey = createChatHistoryPaginationKey("project-1");

  assert.equal(getKey(0, null), "/api/history?limit=20&projectId=project-1");
});

test("createChatHistoryPaginationKey keeps the selected project when paginating", () => {
  const getKey = createChatHistoryPaginationKey("project-1");

  assert.equal(
    getKey(1, {
      chats: [{ id: "chat-42" }],
      hasMore: true,
    }),
    "/api/history?limit=20&ending_before=chat-42&projectId=project-1"
  );
});

test("createChatHistoryPaginationKey preserves the unfiltered history URL when no project is selected", () => {
  const getKey = createChatHistoryPaginationKey(null);

  assert.equal(getKey(0, null), "/api/history?limit=20");
});

test("createChatHistoryPaginationKey stops pagination when there are no more chats", () => {
  const getKey = createChatHistoryPaginationKey("project-1");

  assert.equal(
    getKey(1, {
      chats: [{ id: "chat-42" }],
      hasMore: false,
    }),
    null
  );
});
