import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getProjectById } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { previewFinanceRule } from "@/lib/finance/rules";
import { financeActionSchema } from "@/lib/finance/types";

const financeRulePreviewRequestSchema = z.object({
  action: financeActionSchema,
  replaceRuleId: z.string().uuid().optional(),
});

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
  const parsed = financeRulePreviewRequestSchema.safeParse(body);

  if (!parsed.success) {
    return new ChatSDKError(
      "bad_request:api",
      "Invalid finance rule preview payload"
    ).toResponse();
  }

  try {
    const preview = await previewFinanceRule({
      projectId: project.id,
      action: parsed.data.action,
      replaceRuleId: parsed.data.replaceRuleId,
    });

    return Response.json(preview);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    throw error;
  }
}
