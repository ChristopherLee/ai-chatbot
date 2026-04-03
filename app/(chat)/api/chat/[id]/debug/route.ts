import { auth } from "@/app/(auth)/auth";
import { isDevelopmentEnvironment } from "@/lib/constants";
import {
  getChatById,
  getMessagesByChatId,
  getStreamIdsByChatId,
} from "@/lib/db/queries";
import { buildChatDebugPayload } from "@/lib/debug/chat-history";
import { ChatSDKError } from "@/lib/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isDevelopmentEnvironment) {
    return new ChatSDKError(
      "forbidden:chat",
      "Chat debug history is only available in development."
    ).toResponse();
  }

  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (!chat) {
    return new ChatSDKError(
      "not_found:chat",
      "Chat not found"
    ).toResponse();
  }

  if (chat.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const [messages, streamIds] = await Promise.all([
    getMessagesByChatId({ id }),
    getStreamIdsByChatId({ chatId: id }),
  ]);
  const payload = await buildChatDebugPayload({
    chat,
    messages,
    streamIds,
  });

  return Response.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
