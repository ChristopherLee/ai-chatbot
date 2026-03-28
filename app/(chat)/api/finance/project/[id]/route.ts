import { auth } from "@/app/(auth)/auth";
import { getProjectById } from "@/lib/db/queries";
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

  const project = await getProjectById({ id });

  if (!project) {
    return new ChatSDKError(
      "not_found:database",
      "Project not found"
    ).toResponse();
  }

  if (project.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const snapshot = await getFinanceSnapshot({ projectId: project.id });

  return Response.json(snapshot);
}
