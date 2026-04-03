import equal from "fast-deep-equal";
import { filterPersistableMessages } from "./message-history";
import type { ChatMessage } from "@/lib/types";

export function planPersistableMessageWrites({
  existingMessages,
  finishedMessages,
}: {
  existingMessages: ChatMessage[];
  finishedMessages: ChatMessage[];
}) {
  const existingMessagesById = new Map(
    existingMessages.map((message) => [message.id, message])
  );
  const updates: ChatMessage[] = [];
  const inserts: ChatMessage[] = [];

  for (const message of filterPersistableMessages(finishedMessages)) {
    const existingMessage = existingMessagesById.get(message.id);

    if (!existingMessage) {
      inserts.push(message);
      continue;
    }

    if (!equal(existingMessage.parts, message.parts)) {
      updates.push(message);
    }
  }

  return { updates, inserts };
}
