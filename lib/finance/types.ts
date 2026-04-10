import { z } from "zod";

export type FinanceSnapshotStatus =
  | "needs-upload"
  | "needs-onboarding"
  | "ready";

export type CategoryGroup = "fixed" | "flexible" | "annual" | "excluded";

export type PlanMode = "balanced" | "conservative";

export const transactionMatchSchema = z
  .object({
    rawCategory: z.string().min(1).optional(),
    descriptionContains: z.string().min(1).optional(),
    merchant: z.string().min(1).optional(),
    account: z.string().min(1).optional(),
  })
  .refine(
    (value) =>
      Boolean(
        value.rawCategory ||
          value.descriptionContains ||
          value.merchant ||
          value.account
      ),
    {
      message: "At least one match condition is required.",
    }
  );

export type FinanceTransactionMatch = z.infer<typeof transactionMatchSchema>;

export const categorizeTransactionsActionSchema = z.object({
  type: z.literal("categorize_transactions"),
  match: transactionMatchSchema,
  to: z.string().min(1),
});

export const categorizeTransactionActionSchema = z.object({
  type: z.literal("categorize_transaction"),
  transactionId: z.string().uuid(),
  to: z.string().min(1),
});

export const excludeTransactionActionSchema = z.object({
  type: z.literal("exclude_transaction"),
  transactionId: z.string().uuid(),
});

export const excludeTransactionsActionSchema = z.object({
  type: z.literal("exclude_transactions"),
  match: transactionMatchSchema,
});

export const setCategoryMonthlyTargetActionSchema = z.object({
  type: z.literal("set_category_monthly_target"),
  category: z.string().min(1),
  amount: z.number().finite().nonnegative(),
  effectiveMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

export const setPlanModeActionSchema = z.object({
  type: z.literal("set_plan_mode"),
  mode: z.enum(["balanced", "conservative"]),
});

export const financeActionSchema = z.discriminatedUnion("type", [
  categorizeTransactionsActionSchema,
  categorizeTransactionActionSchema,
  excludeTransactionActionSchema,
  excludeTransactionsActionSchema,
  setCategoryMonthlyTargetActionSchema,
  setPlanModeActionSchema,
]);

export const financeActionsSchema = z.array(financeActionSchema).max(6);

export type FinanceAction = z.infer<typeof financeActionSchema>;

export const categorizationRuleTypes = [
  "categorize_transactions",
] as const satisfies FinanceAction["type"][];

export const budgetExclusionRuleTypes = [
  "exclude_transactions",
] as const satisfies FinanceAction["type"][];

export const legacyFinanceRuleTypes =
  [] as const satisfies FinanceAction["type"][];

export type FinanceTransaction = {
  id: string;
  projectId: string;
  transactionDate: string;
  account: string;
  description: string;
  normalizedMerchant: string;
  rawCategory: string;
  tags: string | null;
  amountSigned: number;
  outflowAmount: number;
  mappedCategory: string;
  categoryGroup: CategoryGroup;
  includeFlag: boolean;
  exclusionReason: string | null;
  notes: string | null;
  createdAt: Date;
};

export type FinanceDatasetSummary = {
  filename: string;
  totalTransactions: number;
  includedTransactions: number;
  excludedTransactions: number;
  totalOutflow: number;
  includedOutflow: number;
  dateRange: {
    start: string;
    end: string;
  };
  sampleHeader: string[];
  rawCategories: Array<{
    name: string;
    count: number;
    totalOutflow: number;
  }>;
  accounts: Array<{
    name: string;
    count: number;
  }>;
};

export type FinanceMonthlyChartPoint = {
  month: string;
  label: string;
  actual: number;
  target: number;
};

export type FinanceCumulativeChartPoint = {
  month: string;
  label: string;
  actualCumulative: number;
  paceCumulative: number;
};

export type FinanceChartType =
  | "monthly-spend"
  | "cumulative-spend"
  | "cash-flow-trend"
  | "month-over-month"
  | "spending-breakdown"
  | "income-to-expenses";

export type FinanceMonthOverMonthChartPoint = {
  category: string;
  group: CategoryGroup;
  currentMonth: number;
  previousMonth: number;
  delta: number;
};

export type FinanceSpendingBreakdownPoint = {
  category: string;
  group: CategoryGroup;
  amount: number;
  sharePercentage: number;
};

export type FinanceIncomeExpenseFlowKind =
  | "income"
  | "supplemental"
  | "category"
  | "leftover";

export type FinanceIncomeExpenseFlowNode = {
  name: string;
  amount: number;
  kind: FinanceIncomeExpenseFlowKind;
  group?: CategoryGroup;
};

export type FinanceIncomeExpenseFlowLink = {
  source: number;
  target: number;
  value: number;
};

export type FinanceMonthlySpendChartResult = {
  chartType: "monthly-spend";
  title: string;
  description: string;
  latestMonth: string;
  latestMonthLabel: string;
  summary: {
    actual: number;
    target: number;
    delta: number;
  };
  data: FinanceMonthlyChartPoint[];
};

export type FinanceCumulativeSpendChartResult = {
  chartType: "cumulative-spend";
  title: string;
  description: string;
  latestMonth: string;
  latestMonthLabel: string;
  summary: {
    actualCumulative: number;
    paceCumulative: number;
    variance: number;
  };
  data: FinanceCumulativeChartPoint[];
};

export type FinanceCashFlowTrendChartPoint = {
  month: string;
  label: string;
  isProjected: boolean;
  actualIncome: number;
  actualExpenses: number;
  actualNet: number;
  projectedIncome: number;
  projectedExpenses: number;
  projectedNet: number;
  actualCashBalance: number;
  projectedCashBalance: number;
};

export type FinanceCashFlowTrendChartResult = {
  chartType: "cash-flow-trend";
  title: string;
  description: string;
  latestMonth: string;
  latestMonthLabel: string;
  projectionMonths: number;
  assumptions: {
    projectedIncomeBasis: "income-target" | "historical-average";
    projectedExpenseBasis: "budget-target" | "historical-average";
  };
  summary: {
    actualNet: number;
    projectedNet: number;
    actualCashBalance: number;
    projectedCashBalance: number;
  };
  monthlyBreakdown: Array<{
    month: string;
    label: string;
    categories: Array<{
      category: string;
      group: CategoryGroup;
      actual: number;
      projected: number;
    }>;
  }>;
  data: FinanceCashFlowTrendChartPoint[];
};

export type FinanceMonthOverMonthChartResult = {
  chartType: "month-over-month";
  title: string;
  description: string;
  currentMonth: string;
  currentMonthLabel: string;
  previousMonth: string;
  previousMonthLabel: string;
  categoryLimit: number;
  availableCategoryCount: number;
  truncated: boolean;
  totals: {
    currentMonth: number;
    previousMonth: number;
    delta: number;
  };
  data: FinanceMonthOverMonthChartPoint[];
};

export type FinanceSpendingBreakdownChartResult = {
  chartType: "spending-breakdown";
  title: string;
  description: string;
  month: string;
  monthLabel: string;
  categoryLimit: number;
  availableCategoryCount: number;
  truncated: boolean;
  total: number;
  data: FinanceSpendingBreakdownPoint[];
};

export type FinanceIncomeToExpensesChartResult = {
  chartType: "income-to-expenses";
  title: string;
  description: string;
  month: string;
  monthLabel: string;
  incomeBasis: "historical-average" | "income-target" | "observed";
  sourceLimit: number;
  availableSourceCount: number;
  truncatedSources: boolean;
  categoryLimit: number;
  availableCategoryCount: number;
  truncatedCategories: boolean;
  totals: {
    income: number;
    expenses: number;
    leftover: number;
    supplemental: number;
  };
  sources: FinanceIncomeExpenseFlowNode[];
  destinations: FinanceIncomeExpenseFlowNode[];
  nodes: FinanceIncomeExpenseFlowNode[];
  links: FinanceIncomeExpenseFlowLink[];
};

export type FinanceChartResult =
  | FinanceMonthlySpendChartResult
  | FinanceCumulativeSpendChartResult
  | FinanceCashFlowTrendChartResult
  | FinanceMonthOverMonthChartResult
  | FinanceSpendingBreakdownChartResult
  | FinanceIncomeToExpensesChartResult;

export type FinanceChartToolResult =
  | {
      status: "available";
      snapshotStatus: FinanceSnapshotStatus;
      chart: FinanceChartResult;
    }
  | {
      status: "unavailable";
      snapshotStatus: FinanceSnapshotStatus;
      chartType: FinanceChartType;
      message: string;
    };

export type FinanceCategoryCard = {
  category: string;
  group: CategoryGroup;
  monthlyTarget: number;
  trailingAverage: number;
  totalOutflow: number;
  monthly: Array<{
    month: string;
    label: string;
    actual: number;
    target: number;
  }>;
  topMerchants: Array<{
    merchant: string;
    amount: number;
  }>;
  transactions: Array<{
    id: string;
    transactionDate: string;
    description: string;
    merchant: string;
    amount: number;
    rawCategory: string;
    account: string;
  }>;
};

export type FinancePlanSummary = {
  mode: PlanMode;
  totalMonthlyTarget: number;
  trailingAverageSpend: number;
  totalsByGroup: Record<Exclude<CategoryGroup, "excluded">, number>;
  categoryTargets: Array<{
    category: string;
    group: CategoryGroup;
    monthlyTarget: number;
    trailingAverage: number;
    trailingTotal: number;
  }>;
};

export type FinanceCashFlowSummary = {
  totalMonthlyBudgetTarget: number | null;
  totalMonthlyIncomeTarget: number | null;
  categoryBudgetTotal: number;
  catchAllBudget: number | null;
  historicalAverageMonthlyIncome: number;
  historicalAverageMonthlySpend: number;
};

export type FinanceTargetsCategoryBudget = {
  category: string;
  group: CategoryGroup;
  amount: number;
  overrideId: string | null;
  lastMonthActual: number;
};

export type FinanceCategoryBudgetSuggestionCadence =
  | "steady"
  | "variable"
  | "recent"
  | "occasional";

export type FinanceCategoryBudgetSuggestionRecency =
  | "active"
  | "cooling"
  | "inactive";

export type FinanceTargetsCategoryBudgetSuggestion = {
  category: string;
  group: CategoryGroup;
  suggestedAmount: number;
  lastMonthActual: number;
  cadence: FinanceCategoryBudgetSuggestionCadence;
  recency: FinanceCategoryBudgetSuggestionRecency;
  reasoning: string;
};

export type FinanceTargetsResponse = {
  projectId: string;
  projectTitle: string;
  snapshotStatus: FinanceSnapshotStatus;
  planMode?: PlanMode | null;
  latestTransactionDate?: string | null;
  cashFlowSummary: FinanceCashFlowSummary;
  suggestedCategoryBudgetTotal: number | null;
  categoryBudgets: FinanceTargetsCategoryBudget[];
  suggestedCategoryBudgets: FinanceTargetsCategoryBudgetSuggestion[];
};

export type FinanceAppliedOverrideDetail = {
  label: string;
  value: string;
};

export type FinanceAppliedOverride = {
  id: string;
  type: FinanceAction["type"];
  summary: string;
  createdAt: string;
  details: FinanceAppliedOverrideDetail[];
  matchedTransactions: number | null;
  affectedOutflow: number | null;
};

export type FinanceRuleAffectedTransaction = {
  id: string;
  transactionDate: string;
  description: string;
  merchant: string;
  account: string;
  rawCategory: string;
  amount: number;
  category: string;
  includeFlag: boolean;
};

export type FinanceRuleRecord = FinanceAppliedOverride & {
  action: FinanceAction;
  orderIndex: number;
  affectedTransactions: FinanceRuleAffectedTransaction[];
  affectedTransactionsTruncated: boolean;
  totalAffectedTransactions: number;
};

export type FinanceRulesViewData = {
  summary?: {
    totalRules: number;
    categorizationRuleCount: number;
    exclusionRuleCount: number;
    budgetOverrideCount: number;
    planModeChangeCount: number;
  };
  rules: FinanceRuleRecord[];
  options: {
    accounts: string[];
    rawCategories: string[];
    categories: string[];
  };
};

export type FinanceRulePreview = {
  summary: string;
  details: FinanceAppliedOverrideDetail[];
  matchedTransactions: number | null;
  affectedOutflow: number | null;
  affectedTransactions: FinanceRuleAffectedTransaction[];
  affectedTransactionsTruncated: boolean;
  totalAffectedTransactions: number;
};

export type FinanceSnapshot = {
  status: FinanceSnapshotStatus;
  cashFlowSummary: FinanceCashFlowSummary;
  datasetSummary: FinanceDatasetSummary | null;
  planSummary: FinancePlanSummary | null;
  monthlyChart: FinanceMonthlyChartPoint[];
  cumulativeChart: FinanceCumulativeChartPoint[];
  categoryCards: FinanceCategoryCard[];
  transactionHighlights: Array<{
    id: string;
    transactionDate: string;
    description: string;
    merchant: string;
    amount: number;
    category: string;
    group: CategoryGroup;
  }>;
  appliedOverrides: FinanceAppliedOverride[];
};
