import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  deleteFinanceOverrideById,
  getFinanceOverridesByProjectId,
  saveFinanceOverrides,
  updateFinanceOverrideById,
} from "@/lib/db/finance-queries";
import {
  getProjectById,
  updateProjectFinanceTargetsById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import {
  buildCategoryBudgetSuggestions,
  getCurrentCategoryBudgetOverrideGroups,
  getCurrentCategoryBudgetOverrides,
  resolveCategoryBudgetGroup,
} from "@/lib/finance/category-budgets";
import {
  getFinanceSnapshot,
  recomputeFinanceSnapshot,
} from "@/lib/finance/snapshot";
import {
  normalizeWhitespace,
  roundCurrency,
  safeLower,
  toMonthKey,
} from "@/lib/finance/utils";

const categoryBudgetInputSchema = z.object({
  bucket: z.string().trim().min(1).max(80),
  amount: z.number().finite().nonnegative(),
});

const updateTargetsSchema = z
  .object({
    totalMonthlyBudgetTarget: z.number().finite().nonnegative().nullable(),
    totalMonthlyIncomeTarget: z.number().finite().nonnegative().nullable(),
    categoryBudgets: z.array(categoryBudgetInputSchema).max(100).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.categoryBudgets) {
      return;
    }

    const seenBuckets = new Set<string>();

    for (const [index, budget] of value.categoryBudgets.entries()) {
      const bucketKey = safeLower(normalizeWhitespace(budget.bucket));

      if (seenBuckets.has(bucketKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate category budgets are not allowed.",
          path: ["categoryBudgets", index, "bucket"],
        });
      }

      seenBuckets.add(bucketKey);
    }
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

async function syncCurrentCategoryBudgets({
  categoryBudgets,
  projectId,
}: {
  categoryBudgets: z.infer<typeof categoryBudgetInputSchema>[];
  projectId: string;
}) {
  const normalizedBudgets = categoryBudgets.map((budget) => ({
    bucket: normalizeWhitespace(budget.bucket),
    amount: roundCurrency(budget.amount),
  }));
  const desiredByBucket = new Map(
    normalizedBudgets.map((budget) => [safeLower(budget.bucket), budget])
  );
  const existingOverrides = await getFinanceOverridesByProjectId({ projectId });
  const currentOverrideGroups =
    getCurrentCategoryBudgetOverrideGroups(existingOverrides);
  const overrideIdsToDelete: string[] = [];
  const overrideUpdates: Promise<unknown>[] = [];

  for (const group of currentOverrideGroups) {
    const desiredBudget = desiredByBucket.get(group.bucketKey);

    if (!desiredBudget) {
      overrideIdsToDelete.push(...group.overrideIds);
      continue;
    }

    const shouldUpdate =
      group.amount !== desiredBudget.amount ||
      group.bucket !== desiredBudget.bucket;

    if (shouldUpdate && group.overrideId) {
      overrideUpdates.push(
        updateFinanceOverrideById({
          id: group.overrideId,
          projectId,
          action: {
            type: "set_bucket_monthly_target",
            bucket: desiredBudget.bucket,
            amount: desiredBudget.amount,
          },
        })
      );
    }

    overrideIdsToDelete.push(
      ...group.overrideIds.filter(
        (overrideId) => overrideId !== group.overrideId
      )
    );
    desiredByBucket.delete(group.bucketKey);
  }

  if (overrideUpdates.length > 0) {
    await Promise.all(overrideUpdates);
  }

  if (overrideIdsToDelete.length > 0) {
    await Promise.all(
      overrideIdsToDelete.map((overrideId) =>
        deleteFinanceOverrideById({
          id: overrideId,
          projectId,
        })
      )
    );
  }

  if (desiredByBucket.size > 0) {
    await saveFinanceOverrides({
      projectId,
      actions: [...desiredByBucket.values()].map((budget) => ({
        type: "set_bucket_monthly_target" as const,
        bucket: budget.bucket,
        amount: budget.amount,
      })),
    });
  }
}

async function buildTargetsResponse({
  projectId,
  projectTitle,
  snapshot,
}: {
  projectId: string;
  projectTitle: string;
  snapshot: Awaited<ReturnType<typeof getFinanceSnapshot>>;
}) {
  const overrides = await getFinanceOverridesByProjectId({ projectId });
  const currentCategoryBudgets = getCurrentCategoryBudgetOverrides(overrides);
  const latestTransactionDate = snapshot.datasetSummary?.dateRange.end ?? null;
  const currentMonth = latestTransactionDate
    ? toMonthKey(latestTransactionDate)
    : null;

  return {
    projectId,
    projectTitle,
    snapshotStatus: snapshot.status,
    cashFlowSummary: snapshot.cashFlowSummary,
    suggestedCategoryBudgetTotal:
      snapshot.planSummary?.totalMonthlyTarget ?? null,
    categoryBudgets: currentCategoryBudgets
      .map((budget) => {
        const categoryCard = snapshot.categoryCards.find(
          (card) => safeLower(card.bucket) === safeLower(budget.bucket)
        );
        const currentMonthEntry = currentMonth
          ? categoryCard?.monthly.find((entry) => entry.month === currentMonth)
          : null;

        return {
          bucket: budget.bucket,
          group: resolveCategoryBudgetGroup({
            bucket: budget.bucket,
            categoryCards: snapshot.categoryCards,
          }),
          amount: budget.amount,
          overrideId: budget.overrideId,
          lastMonthActual: roundCurrency(
            currentMonthEntry?.actual ?? categoryCard?.trailingAverage ?? 0
          ),
        };
      })
      .sort(
        (left, right) =>
          right.amount - left.amount || left.bucket.localeCompare(right.bucket)
      ),
    suggestedCategoryBudgets: buildCategoryBudgetSuggestions({
      categoryCards: snapshot.categoryCards,
      currentBudgets: currentCategoryBudgets,
      latestTransactionDate,
    }),
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

  const snapshot = await getFinanceSnapshot({ projectId: project.id });

  return Response.json(
    await buildTargetsResponse({
      projectId: project.id,
      projectTitle: project.title,
      snapshot,
    })
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error, project } = await getAuthorizedProject(id);

  if (error || !project) {
    return error;
  }

  let body: z.infer<typeof updateTargetsSchema>;

  try {
    body = updateTargetsSchema.parse(await request.json());
  } catch (_error) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const updatedProject = await updateProjectFinanceTargetsById({
    projectId: project.id,
    totalMonthlyBudgetTarget: body.totalMonthlyBudgetTarget,
    totalMonthlyIncomeTarget: body.totalMonthlyIncomeTarget,
  });

  if (!updatedProject) {
    return new ChatSDKError(
      "not_found:database",
      "Project not found"
    ).toResponse();
  }

  if (body.categoryBudgets) {
    await syncCurrentCategoryBudgets({
      projectId: updatedProject.id,
      categoryBudgets: body.categoryBudgets,
    });
  }

  const snapshot = await recomputeFinanceSnapshot({
    projectId: updatedProject.id,
  });

  return Response.json(
    await buildTargetsResponse({
      projectId: updatedProject.id,
      projectTitle: updatedProject.title,
      snapshot,
    })
  );
}
