type ChatHistoryPage = {
  chats: Array<{ id: string }>;
  hasMore: boolean;
};

export const CHAT_HISTORY_PAGE_SIZE = 20;

function buildChatHistoryPageUrl({
  endingBefore,
  projectId,
}: {
  endingBefore?: string;
  projectId: string | null;
}) {
  const searchParams = new URLSearchParams({
    limit: CHAT_HISTORY_PAGE_SIZE.toString(),
  });

  if (endingBefore) {
    searchParams.set("ending_before", endingBefore);
  }

  if (projectId) {
    searchParams.set("projectId", projectId);
  }

  return `/api/history?${searchParams.toString()}`;
}

export function createChatHistoryPaginationKey(projectId: string | null) {
  return (pageIndex: number, previousPageData: ChatHistoryPage | null) => {
    if (previousPageData && previousPageData.hasMore === false) {
      return null;
    }

    if (pageIndex === 0) {
      return buildChatHistoryPageUrl({ projectId });
    }

    const firstChatFromPage = previousPageData?.chats.at(-1);

    if (!firstChatFromPage) {
      return null;
    }

    return buildChatHistoryPageUrl({
      endingBefore: firstChatFromPage.id,
      projectId,
    });
  };
}

export function isChatHistoryCacheKey(key: unknown) {
  return typeof key === "string" && key.includes("/api/history");
}
