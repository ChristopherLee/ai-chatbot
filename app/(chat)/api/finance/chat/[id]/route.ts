import { auth } from "@/app/(auth)/auth";
import { getChatById } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getFinanceSnapshot } from "@/lib/finance/snapshot";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (!chat) {
    return new ChatSDKError(
      "not_found:database",
      "Chat not found"
    ).toResponse();
  }

  if (chat.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const snapshot = await getFinanceSnapshot({ projectId: chat.projectId });

  return Response.json(snapshot);
}
