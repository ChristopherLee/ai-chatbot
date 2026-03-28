import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  deleteFinanceOverrideById,
  getFinanceOverridesByProjectId,
  updateFinanceOverrideById,
} from "@/lib/db/finance-queries";
import { getProjectById } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { buildFinanceActionKey } from "@/lib/finance/action-keys";
import { getFinanceActionsFromOverrides } from "@/lib/finance/overrides";
import { recomputeFinanceSnapshot } from "@/lib/finance/snapshot";
import { financeActionSchema } from "@/lib/finance/types";

const financeRuleRequestSchema = z.object({
  action: financeActionSchema,
});

async function getAuthorizedProject(projectId: string) {
  const session = await auth();

  if (!session?.user) {
    return {
      error: new ChatSDKError("unauthorized:chat").toResponse(),
      project: null,
    };
  }

  const project = await getProjectById({ id: projectId });

  if (!project) {
    return {
      error: new ChatSDKError(
        "not_found:database",
        "Project not found"
      ).toResponse(),
      project: null,
    };
  }

  if (project.userId !== session.user.id) {
    return {
      error: new ChatSDKError("forbidden:chat").toResponse(),
      project: null,
    };
  }

  return {
    error: null,
    project,
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  const { id, ruleId } = await params;
  const { error, project } = await getAuthorizedProject(id);

  if (error || !project) {
    return error;
  }

  const body = await request.json();
  const parsed = financeRuleRequestSchema.safeParse(body);

  if (!parsed.success) {
    return new ChatSDKError(
      "bad_request:api",
      "Invalid finance rule payload"
    ).toResponse();
  }

  const overrides = await getFinanceOverridesByProjectId({
    projectId: project.id,
  });
  const existingOverride = overrides.find((override) => override.id === ruleId);

  if (!existingOverride) {
    return new ChatSDKError(
      "not_found:database",
      "Finance rule not found"
    ).toResponse();
  }

  const otherActionKeys = new Set(
    getFinanceActionsFromOverrides(
      overrides.filter((override) => override.id !== ruleId)
    ).map((action) => buildFinanceActionKey(action))
  );
  const nextActionKey = buildFinanceActionKey(parsed.data.action);

  if (otherActionKeys.has(nextActionKey)) {
    return new ChatSDKError(
      "bad_request:api",
      "That finance rule already exists."
    ).toResponse();
  }

  const updatedOverride = await updateFinanceOverrideById({
    id: ruleId,
    projectId: project.id,
    action: parsed.data.action,
  });

  if (!updatedOverride) {
    return new ChatSDKError(
      "not_found:database",
      "Finance rule not found"
    ).toResponse();
  }

  const snapshot = await recomputeFinanceSnapshot({ projectId: project.id });

  return Response.json({
    snapshot,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  const { id, ruleId } = await params;
  const { error, project } = await getAuthorizedProject(id);

  if (error || !project) {
    return error;
  }

  const deletedOverride = await deleteFinanceOverrideById({
    id: ruleId,
    projectId: project.id,
  });

  if (!deletedOverride) {
    return new ChatSDKError(
      "not_found:database",
      "Finance rule not found"
    ).toResponse();
  }

  const snapshot = await recomputeFinanceSnapshot({ projectId: project.id });

  return Response.json({
    snapshot,
  });
}
