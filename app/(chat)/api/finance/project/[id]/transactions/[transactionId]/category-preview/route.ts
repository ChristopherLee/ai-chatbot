import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getProjectById } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import {
  applyFinanceOverrides,
  getFinanceActionsFromOverrides,
} from "@/lib/finance/overrides";
import { buildTransactionCategoryRuleSuggestion } from "@/lib/finance/transaction-category-suggestions";
import { loadFinanceTransactionState } from "@/lib/finance/transactions-view";
import type { FinanceTransactionCategoryChangePreview } from "@/lib/finance/types";

const previewRequestSchema = z.object({
  category: z.string().trim().min(1),
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

  return { error: null, project };
}

export async function POST(
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
  const parsed = previewRequestSchema.safeParse(body);

  if (!parsed.success) {
    return new ChatSDKError(
      "bad_request:api",
      "Invalid transaction category preview payload"
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

  const transactionScopedOverrideIds = state.overrides.flatMap((override) => {
    const value = override.valueJson;

    if (
      typeof value !== "object" ||
      value === null ||
      !("transactionId" in value) ||
      value.transactionId !== transactionId
    ) {
      return [];
    }

    return [override.id];
  });
  const remainingOverrides = state.overrides.filter(
    (override) => !transactionScopedOverrideIds.includes(override.id)
  );
  const finalTransactionsWithoutScopedOverrides = applyFinanceOverrides(
    state.baseTransactions,
    getFinanceActionsFromOverrides(remainingOverrides)
  );
  const suggestedRule = buildTransactionCategoryRuleSuggestion({
    baseTransactions: state.baseTransactions,
    finalTransactions: finalTransactionsWithoutScopedOverrides,
    nextCategory: parsed.data.category,
    overrides: remainingOverrides,
    transactionId,
  });

  return Response.json({
    transactionId,
    currentCategory: finalTransaction.mappedCategory,
    nextCategory: parsed.data.category,
    suggestedRule,
  } satisfies FinanceTransactionCategoryChangePreview);
}
