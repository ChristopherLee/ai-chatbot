import {
  getFinanceOverridesByProjectId,
  getTransactionsByProjectId,
} from "@/lib/db/finance-queries";
import { buildInitialFinanceTransactions } from "./categorize";
import {
  applyFinanceOverrides,
  buildFinanceRuleRecords,
  getFinanceActionsFromOverrides,
  previewFinanceRuleInSequence,
} from "./overrides";
import type {
  FinanceAction,
  FinanceRulesViewData,
  FinanceTransaction,
} from "./types";

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function buildBucketOptions(
  baseTransactions: FinanceTransaction[],
  finalTransactions: FinanceTransaction[],
  actions: FinanceAction[]
) {
  const buckets = new Set<string>();

  for (const transaction of baseTransactions) {
    buckets.add(transaction.mappedBucket);
  }

  for (const transaction of finalTransactions) {
    buckets.add(transaction.mappedBucket);
  }

  for (const action of actions) {
    switch (action.type) {
      case "categorize_transactions":
      case "categorize_transaction":
      case "remap_raw_category":
      case "merge_buckets":
      case "rename_bucket":
        buckets.add(action.to);
        break;
      case "set_bucket_monthly_target":
        buckets.add(action.bucket);
        break;
      default:
        break;
    }

    if (action.type === "merge_buckets") {
      for (const bucket of action.from) {
        buckets.add(bucket);
      }
    }

    if (action.type === "rename_bucket") {
      buckets.add(action.from);
    }
  }

  return uniqueSorted([...buckets]);
}

export async function getFinanceRulesViewData({
  projectId,
}: {
  projectId: string;
}): Promise<FinanceRulesViewData> {
  const [transactions, overrides] = await Promise.all([
    getTransactionsByProjectId({ projectId }),
    getFinanceOverridesByProjectId({ projectId }),
  ]);
  const baseTransactions = buildInitialFinanceTransactions(transactions);
  const actions = getFinanceActionsFromOverrides(overrides);
  const finalTransactions = applyFinanceOverrides(baseTransactions, actions);

  return {
    rules: buildFinanceRuleRecords(overrides, baseTransactions),
    options: {
      accounts: uniqueSorted(
        baseTransactions.map((transaction) => transaction.account)
      ),
      rawCategories: uniqueSorted(
        baseTransactions.map((transaction) => transaction.rawCategory)
      ),
      buckets: buildBucketOptions(baseTransactions, finalTransactions, actions),
    },
  };
}

export async function previewFinanceRule({
  projectId,
  action,
  replaceRuleId,
}: {
  projectId: string;
  action: FinanceAction;
  replaceRuleId?: string;
}) {
  const [transactions, overrides] = await Promise.all([
    getTransactionsByProjectId({ projectId }),
    getFinanceOverridesByProjectId({ projectId }),
  ]);

  return previewFinanceRuleInSequence({
    baseTransactions: buildInitialFinanceTransactions(transactions),
    overrides,
    draftAction: action,
    replaceRuleId,
  });
}
