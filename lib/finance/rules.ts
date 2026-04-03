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

function buildCategoryOptions(
  baseTransactions: FinanceTransaction[],
  finalTransactions: FinanceTransaction[],
  actions: FinanceAction[]
) {
  const categories = new Set<string>();

  for (const transaction of baseTransactions) {
    categories.add(transaction.mappedCategory);
  }

  for (const transaction of finalTransactions) {
    categories.add(transaction.mappedCategory);
  }

  for (const action of actions) {
    switch (action.type) {
      case "categorize_transactions":
      case "categorize_transaction":
        categories.add(action.to);
        break;
      case "set_category_monthly_target":
        categories.add(action.category);
        break;
      default:
        break;
    }
  }

  return uniqueSorted([...categories]);
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
      categories: buildCategoryOptions(
        baseTransactions,
        finalTransactions,
        actions
      ),
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
