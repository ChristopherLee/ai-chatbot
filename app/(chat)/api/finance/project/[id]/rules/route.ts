import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  getFinanceOverridesByProjectId,
  saveFinanceOverrides,
} from "@/lib/db/finance-queries";
import { getProjectById } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { buildFinanceActionKey } from "@/lib/finance/action-keys";
import { getFinanceActionsFromOverrides } from "@/lib/finance/overrides";
import { getFinanceRulesViewData } from "@/lib/finance/rules";
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error, project } = await getAuthorizedProject(id);

  if (error || !project) {
    return error;
  }

  const rules = await getFinanceRulesViewData({ projectId: project.id });

  return Response.json(rules);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const existingOverrides = await getFinanceOverridesByProjectId({
    projectId: project.id,
  });
  const existingActionKeys = new Set(
    getFinanceActionsFromOverrides(existingOverrides).map((action) =>
      buildFinanceActionKey(action)
    )
  );
  const nextActionKey = buildFinanceActionKey(parsed.data.action);

  if (existingActionKeys.has(nextActionKey)) {
    return new ChatSDKError(
      "bad_request:api",
      "That finance rule already exists."
    ).toResponse();
  }

  await saveFinanceOverrides({
    projectId: project.id,
    actions: [parsed.data.action],
  });

  const snapshot = await recomputeFinanceSnapshot({ projectId: project.id });

  return Response.json({
    snapshot,
  });
}
