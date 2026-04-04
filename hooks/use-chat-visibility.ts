"use client";

import useSWR, { useSWRConfig } from "swr";
import { updateChatVisibility } from "@/app/(chat)/actions";
import type { VisibilityType } from "@/components/visibility-selector";
import { isChatHistoryCacheKey } from "@/lib/chat-history";

export function useChatVisibility({
  chatId,
  initialVisibilityType,
}: {
  chatId: string;
  initialVisibilityType: VisibilityType;
}) {
  const { mutate } = useSWRConfig();

  const { data: visibilityType, mutate: setLocalVisibility } = useSWR(
    `${chatId}-visibility`,
    null,
    {
      fallbackData: initialVisibilityType,
    }
  );

  const setVisibilityType = (updatedVisibilityType: VisibilityType) => {
    setLocalVisibility(updatedVisibilityType);
    mutate(isChatHistoryCacheKey, undefined, { revalidate: true });

    updateChatVisibility({
      chatId,
      visibility: updatedVisibilityType,
    });
  };

  return { visibilityType, setVisibilityType };
}
