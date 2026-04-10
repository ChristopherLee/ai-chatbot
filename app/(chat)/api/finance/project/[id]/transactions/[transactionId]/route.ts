import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  deleteFinanceOverrideById,
  deleteTransactionById,
  saveFinanceOverrides,
  updateFinanceOverrideById,
} from "@/lib/db/finance-queries";
import { getProjectById } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { buildFinanceActionKey } from "@/lib/finance/action-keys";
import {
  applyFinanceOverrides,
  getFinanceActionsFromOverrides,
} from "@/lib/finance/overrides";
import { recomputeFinanceSnapshot } from "@/lib/finance/snapshot";
import { buildTransactionCategoryRuleSuggestion } from "@/lib/finance/transaction-category-suggestions";
import {
  getTransactionExclusionSource,
  getTransactionScopedOverrideIds,
  loadFinanceTransactionState,
} from "@/lib/finance/transactions-view";
import { safeLower } from "@/lib/finance/utils";

const mutationSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.enum(["exclude", "include"]),
  }),
  z.object({
    operation: z.literal("categorize"),
    category: z.string().trim().min(1),
    applySuggestedRule: z.boolean().optional(),
  }),
]);

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

  return { error: null, project };
}

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; transactionId: string }>;
  }
) {
  const { id, transactionId } = await params;
  const { error, project } = await getAuthorizedProject(id);

  if (error || !project) {
    return error;
  }

  const body = await request.json();
  const parsed = mutationSchema.safeParse(body);

  if (!parsed.success) {
    return new ChatSDKError(
      "bad_request:api",
      "Invalid transaction update payload"
    ).toResponse();
  }

  const state = await loadFinanceTransactionState({ projectId: project.id });
  const finalTransaction = state.finalTransactions.find(
    (transaction) => transaction.id === transactionId
  );

  if (!finalTransaction) {
    return new ChatSDKError(
      "not_found:database",
      "Transaction not found"
    ).toResponse();
  }

  const oneOffExcludeRuleId =
    state.oneOffExcludeRuleIdsByTransactionId.get(transactionId) ?? null;

  if (parsed.data.operation === "categorize") {
    const transactionScopedOverrideIds = getTransactionScopedOverrideIds({
      overrides: state.overrides,
      transactionId,
    });
    const remainingOverrides = state.overrides.filter(
      (override) => !transactionScopedOverrideIds.includes(override.id)
    );
    const remainingActions = getFinanceActionsFromOverrides(remainingOverrides);
    const finalTransactionsWithoutScopedOverrides = applyFinanceOverrides(
      state.baseTransactions,
      remainingActions
    );
    const transactionWithoutScopedOverrides =
      finalTransactionsWithoutScopedOverrides.find(
        (transaction) => transaction.id === transactionId
      ) ?? null;
    const suggestedRule = buildTransactionCategoryRuleSuggestion({
      baseTransactions: state.baseTransactions,
      finalTransactions: finalTransactionsWithoutScopedOverrides,
      nextCategory: parsed.data.category,
      overrides: remainingOverrides,
      transactionId,
    });
    let changed = false;

    for (const overrideId of transactionScopedOverrideIds) {
      await deleteFinanceOverrideById({
        id: overrideId,
        projectId: project.id,
      });
      changed = true;
    }

    if (parsed.data.applySuggestedRule && suggestedRule) {
      if (suggestedRule.replaceRuleId) {
        await updateFinanceOverrideById({
          id: suggestedRule.replaceRuleId,
          projectId: project.id,
          action: suggestedRule.action,
        });
      } else {
        const existingActionKeys = new Set(
          remainingActions.map((action) => buildFinanceActionKey(action))
        );

        if (
          !existingActionKeys.has(buildFinanceActionKey(suggestedRule.action))
        ) {
          await saveFinanceOverrides({
            projectId: project.id,
            actions: [suggestedRule.action],
          });
        }
      }

      changed = true;
    } else {
      const needsTransactionOverride =
        !transactionWithoutScopedOverrides ||
        transactionWithoutScopedOverrides.includeFlag === false ||
        safeLower(transactionWithoutScopedOverrides.mappedCategory) !==
          safeLower(parsed.data.category);

      if (needsTransactionOverride) {
        await saveFinanceOverrides({
          projectId: project.id,
          actions: [
            {
              type: "categorize_transaction",
              transactionId,
              to: parsed.data.category,
            },
          ],
        });
        changed = true;
      }
    }

    if (!changed) {
      return Response.json({
        changed: false,
      });
    }

    const snapshot = await recomputeFinanceSnapshot({ projectId: project.id });

    return Response.json({
      changed: true,
      snapshot,
      savedAs:
        parsed.data.applySuggestedRule && suggestedRule
          ? "rule"
          : "transaction",
    });
  }

  if (parsed.data.operation === "exclude") {
    if (!finalTransaction.includeFlag) {
      return Response.json({
        changed: false,
      });
    }

    await saveFinanceOverrides({
      projectId: project.id,
      actions: [
        {
          type: "exclude_transaction",
          transactionId,
        },
      ],
    });

    const snapshot = await recomputeFinanceSnapshot({ projectId: project.id });

    return Response.json({
      changed: true,
      snapshot,
    });
  }

  if (oneOffExcludeRuleId) {
    await deleteFinanceOverrideById({
      id: oneOffExcludeRuleId,
      projectId: project.id,
    });

    const snapshot = await recomputeFinanceSnapshot({ projectId: project.id });

    return Response.json({
      changed: true,
      snapshot,
    });
  }

  const exclusionSource = getTransactionExclusionSource({
    baseTransaction: state.baseTransactions.find(
      (transaction) => transaction.id === transactionId
    ),
    finalTransaction,
    oneOffExcludeRuleId,
  });

  if (exclusionSource === "default") {
    return new ChatSDKError(
      "bad_request:api",
      "This transaction is excluded by a default budget rule."
    ).toResponse();
  }

  if (exclusionSource === "rule") {
    return new ChatSDKError(
      "bad_request:api",
      "This transaction is excluded by a reusable rule. Edit or remove that rule instead."
    ).toResponse();
  }

  return Response.json({
    changed: false,
  });
}

export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; transactionId: string }>;
  }
) {
  const { id, transactionId } = await params;
  const { error, project } = await getAuthorizedProject(id);

  if (error || !project) {
    return error;
  }

  const state = await loadFinanceTransactionState({ projectId: project.id });
  const finalTransaction = state.finalTransactions.find(
    (transaction) => transaction.id === transactionId
  );

  if (!finalTransaction) {
    return new ChatSDKError(
      "not_found:database",
      "Transaction not found"
    ).toResponse();
  }

  const transactionScopedOverrideIds = getTransactionScopedOverrideIds({
    overrides: state.overrides,
    transactionId,
  });

  for (const overrideId of transactionScopedOverrideIds) {
    await deleteFinanceOverrideById({
      id: overrideId,
      projectId: project.id,
    });
  }

  await deleteTransactionById({
    projectId: project.id,
    transactionId,
  });

  const snapshot = await recomputeFinanceSnapshot({ projectId: project.id });

  return Response.json({
    deletedId: transactionId,
    snapshot,
  });
}
