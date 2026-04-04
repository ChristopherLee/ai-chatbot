import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { ProjectBudgetSettings } from "@/components/finance/project-budget-settings";
import { getFinanceOverridesByProjectId } from "@/lib/db/finance-queries";
import { getLatestChatByProjectId, getProjectById } from "@/lib/db/queries";
import {
  buildCategoryBudgetSuggestions,
  getCurrentCategoryBudgetOverrides,
  resolveCategoryBudgetGroup,
} from "@/lib/finance/category-budgets";
import { getFinanceSnapshot } from "@/lib/finance/snapshot";
import type { FinanceTargetsResponse } from "@/lib/finance/types";
import { roundCurrency, safeLower, toMonthKey } from "@/lib/finance/utils";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect("/api/auth/guest");
  }

  const project = await getProjectById({ id });

  if (!project || project.userId !== session.user.id) {
    notFound();
  }

  const snapshot = await getFinanceSnapshot({ projectId: project.id });
  const overrides = await getFinanceOverridesByProjectId({
    projectId: project.id,
  });
  const latestChat = await getLatestChatByProjectId({
    projectId: project.id,
  });
  const currentCategoryBudgets = getCurrentCategoryBudgetOverrides(overrides);
  const latestTransactionDate = snapshot.datasetSummary?.dateRange.end ?? null;
  const currentMonth = latestTransactionDate
    ? toMonthKey(latestTransactionDate)
    : null;
  const initialData: FinanceTargetsResponse = {
    projectId: project.id,
    projectTitle: project.title,
    snapshotStatus: snapshot.status,
    planMode: snapshot.planSummary?.mode ?? null,
    latestTransactionDate,
    cashFlowSummary: snapshot.cashFlowSummary,
    suggestedCategoryBudgetTotal:
      snapshot.planSummary?.totalMonthlyTarget ?? null,
    categoryBudgets: currentCategoryBudgets
      .map((budget) => {
        const categoryCard = snapshot.categoryCards.find(
          (card) => safeLower(card.category) === safeLower(budget.category)
        );
        const currentMonthEntry = currentMonth
          ? categoryCard?.monthly.find((entry) => entry.month === currentMonth)
          : null;

        return {
          category: budget.category,
          group: resolveCategoryBudgetGroup({
            category: budget.category,
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
          right.amount - left.amount ||
          left.category.localeCompare(right.category)
      ),
    suggestedCategoryBudgets: buildCategoryBudgetSuggestions({
      categoryCards: snapshot.categoryCards,
      currentBudgets: currentCategoryBudgets,
      latestTransactionDate,
    }),
  };

  return (
    <ProjectBudgetSettings
      analysisChatId={latestChat?.id ?? null}
      initialData={initialData}
    />
  );
}
