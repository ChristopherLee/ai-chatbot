import { auth } from "@/app/(auth)/auth";
import { getProjectById } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { persistFinanceCategorizationSelections } from "@/lib/finance/categorization-review";
import { financeCategorizationSelectionRequestSchema } from "@/lib/finance/categorization-review-shared";

export async function POST(
  request: Request,
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

  const body = await request.json();
  const parsed = financeCategorizationSelectionRequestSchema.safeParse(body);

  if (!parsed.success) {
    return new ChatSDKError(
      "bad_request:api",
      "Invalid categorization review payload"
    ).toResponse();
  }

  const result = await persistFinanceCategorizationSelections({
    projectId: project.id,
    ...parsed.data,
  });

  return Response.json(result);
}
