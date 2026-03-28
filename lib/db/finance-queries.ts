import "server-only";

import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { ChatSDKError } from "@/lib/errors";
import type { FinanceAction, FinanceSnapshot } from "@/lib/finance/types";
import {
  financeCategorizationDenial,
  financeOverride,
  financePlan,
  type Transaction,
  transaction,
  type UploadedFile,
  uploadedFile,
} from "./schema";

export async function getUploadedFileByProjectId({
  projectId,
}: {
  projectId: string;
}): Promise<UploadedFile | null> {
  try {
    const [file] = await db
      .select()
      .from(uploadedFile)
      .where(eq(uploadedFile.projectId, projectId))
      .orderBy(desc(uploadedFile.uploadedAt))
      .limit(1);

    return file ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get uploaded file by project id"
    );
  }
}

export async function saveUploadedFile({
  projectId,
  filename,
  storagePath,
}: {
  projectId: string;
  filename: string;
  storagePath: string;
}) {
  try {
    return await db
      .insert(uploadedFile)
      .values({
        projectId,
        filename,
        storagePath,
        uploadedAt: new Date(),
      })
      .returning();
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to save uploaded file"
    );
  }
}

export async function hasFinanceDataset({
  projectId,
}: {
  projectId: string;
}): Promise<boolean> {
  return Boolean(await getUploadedFileByProjectId({ projectId }));
}

export async function saveTransactions({
  transactions,
}: {
  transactions: Array<
    Omit<Transaction, "id" | "createdAt"> & { createdAt?: Date; id?: string }
  >;
}) {
  try {
    if (transactions.length === 0) {
      return [];
    }

    return await db
      .insert(transaction)
      .values(
        transactions.map((item) => ({
          ...item,
          createdAt: item.createdAt ?? new Date(),
        }))
      )
      .returning();
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to save transactions"
    );
  }
}

export async function getTransactionsByProjectId({
  projectId,
}: {
  projectId: string;
}): Promise<Transaction[]> {
  try {
    return await db
      .select()
      .from(transaction)
      .where(eq(transaction.projectId, projectId))
      .orderBy(asc(transaction.transactionDate), asc(transaction.createdAt));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get transactions by project id"
    );
  }
}

export async function saveFinanceOverrides({
  projectId,
  actions,
}: {
  projectId: string;
  actions: FinanceAction[];
}) {
  try {
    if (actions.length === 0) {
      return [];
    }

    return await db
      .insert(financeOverride)
      .values(
        actions.map((action) => ({
          projectId,
          type: action.type,
          key: JSON.stringify(action),
          valueJson: action,
          createdAt: new Date(),
        }))
      )
      .returning();
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to save finance overrides"
    );
  }
}

export async function saveFinanceCategorizationDenials({
  projectId,
  denials,
}: {
  projectId: string;
  denials: Array<{
    kind: string;
    key: string;
    summary: string;
    valueJson: unknown;
  }>;
}) {
  try {
    if (denials.length === 0) {
      return [];
    }

    return await db
      .insert(financeCategorizationDenial)
      .values(
        denials.map((denial) => ({
          projectId,
          kind: denial.kind,
          key: denial.key,
          summary: denial.summary,
          valueJson: denial.valueJson,
          createdAt: new Date(),
        }))
      )
      .returning();
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to save finance categorization denials"
    );
  }
}

export async function getFinanceOverridesByProjectId({
  projectId,
}: {
  projectId: string;
}) {
  try {
    return await db
      .select()
      .from(financeOverride)
      .where(eq(financeOverride.projectId, projectId))
      .orderBy(asc(financeOverride.createdAt));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get finance overrides by project id"
    );
  }
}

export async function getFinanceCategorizationDenialsByProjectId({
  projectId,
}: {
  projectId: string;
}) {
  try {
    return await db
      .select()
      .from(financeCategorizationDenial)
      .where(eq(financeCategorizationDenial.projectId, projectId))
      .orderBy(asc(financeCategorizationDenial.createdAt));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get finance categorization denials by project id"
    );
  }
}

export async function replaceFinancePlan({
  projectId,
  snapshot,
}: {
  projectId: string;
  snapshot: FinanceSnapshot;
}) {
  try {
    await db.delete(financePlan).where(eq(financePlan.projectId, projectId));
    return await db
      .insert(financePlan)
      .values({
        projectId,
        planJson: snapshot,
        createdAt: new Date(),
      })
      .returning();
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to replace finance plan"
    );
  }
}

export async function getLatestFinancePlanByProjectId({
  projectId,
}: {
  projectId: string;
}) {
  try {
    const [plan] = await db
      .select()
      .from(financePlan)
      .where(eq(financePlan.projectId, projectId))
      .orderBy(desc(financePlan.createdAt))
      .limit(1);

    return plan ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get finance plan by project id"
    );
  }
}

export async function deleteFinanceDatasetByProjectId({
  projectId,
}: {
  projectId: string;
}) {
  try {
    await db.delete(financePlan).where(eq(financePlan.projectId, projectId));
    await db
      .delete(financeOverride)
      .where(eq(financeOverride.projectId, projectId));
    await db
      .delete(financeCategorizationDenial)
      .where(eq(financeCategorizationDenial.projectId, projectId));
    await db.delete(transaction).where(eq(transaction.projectId, projectId));
    await db.delete(uploadedFile).where(eq(uploadedFile.projectId, projectId));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete finance dataset"
    );
  }
}
