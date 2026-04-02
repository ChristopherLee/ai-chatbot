import { NON_INCOME_RAW_CATEGORIES } from "./config";
import type { FinanceCashFlowSummary, FinanceTransaction } from "./types";
import {
  getMonthKeysBetween,
  getTrailingStartMonth,
  roundCurrency,
  toMonthKey,
} from "./utils";

type FinanceTargetValues = {
  totalMonthlyBudgetTarget: number | null;
  totalMonthlyIncomeTarget: number | null;
};

function getObservedMonths(transactions: FinanceTransaction[]) {
  const maxDate = [...transactions]
    .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate))
    .at(-1)?.transactionDate;

  if (!maxDate) {
    return [];
  }

  return getMonthKeysBetween(
    getTrailingStartMonth(maxDate, 12),
    toMonthKey(maxDate)
  );
}

export function buildFinanceCashFlowSummary({
  categoryBudgetTotal,
  targets,
  transactions,
}: {
  categoryBudgetTotal: number;
  targets: FinanceTargetValues;
  transactions: FinanceTransaction[];
}): FinanceCashFlowSummary {
  const observedMonths = getObservedMonths(transactions);
  const spendByMonth = new Map<string, number>();
  const incomeByMonth = new Map<string, number>();

  for (const transaction of transactions) {
    const month = toMonthKey(transaction.transactionDate);

    if (transaction.includeFlag && transaction.outflowAmount > 0) {
      const currentSpend = spendByMonth.get(month) ?? 0;
      spendByMonth.set(
        month,
        roundCurrency(currentSpend + transaction.outflowAmount)
      );
    }

    if (
      transaction.amountSigned > 0 &&
      !NON_INCOME_RAW_CATEGORIES.has(transaction.rawCategory)
    ) {
      const currentIncome = incomeByMonth.get(month) ?? 0;
      incomeByMonth.set(
        month,
        roundCurrency(currentIncome + transaction.amountSigned)
      );
    }
  }

  const historicalAverageMonthlySpend =
    observedMonths.length > 0
      ? roundCurrency(
          observedMonths.reduce(
            (sum, month) => sum + (spendByMonth.get(month) ?? 0),
            0
          ) / observedMonths.length
        )
      : 0;
  const historicalAverageMonthlyIncome =
    observedMonths.length > 0
      ? roundCurrency(
          observedMonths.reduce(
            (sum, month) => sum + (incomeByMonth.get(month) ?? 0),
            0
          ) / observedMonths.length
        )
      : 0;
  const catchAllBudget =
    targets.totalMonthlyBudgetTarget === null
      ? null
      : roundCurrency(targets.totalMonthlyBudgetTarget - categoryBudgetTotal);

  return {
    totalMonthlyBudgetTarget: targets.totalMonthlyBudgetTarget,
    totalMonthlyIncomeTarget: targets.totalMonthlyIncomeTarget,
    categoryBudgetTotal,
    catchAllBudget,
    historicalAverageMonthlyIncome,
    historicalAverageMonthlySpend,
  };
}
