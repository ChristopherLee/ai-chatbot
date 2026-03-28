import { z } from "zod";

export type FinanceSnapshotStatus =
  | "needs-upload"
  | "needs-onboarding"
  | "ready";

export type BucketGroup = "fixed" | "flexible" | "annual" | "excluded";

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

export const mergeBucketsActionSchema = z.object({
  type: z.literal("merge_buckets"),
  from: z.array(z.string().min(1)).min(1).max(5),
  to: z.string().min(1),
});

export const remapRawCategoryActionSchema = z.object({
  type: z.literal("remap_raw_category"),
  from: z.string().min(1),
  to: z.string().min(1),
});

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

export const excludeTransactionsActionSchema = z.object({
  type: z.literal("exclude_transactions"),
  match: transactionMatchSchema,
});

export const includeTransactionsActionSchema = z.object({
  type: z.literal("include_transactions"),
  match: transactionMatchSchema,
});

export const renameBucketActionSchema = z.object({
  type: z.literal("rename_bucket"),
  from: z.string().min(1),
  to: z.string().min(1),
});

export const setBucketMonthlyTargetActionSchema = z.object({
  type: z.literal("set_bucket_monthly_target"),
  bucket: z.string().min(1),
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
  mergeBucketsActionSchema,
  remapRawCategoryActionSchema,
  categorizeTransactionsActionSchema,
  categorizeTransactionActionSchema,
  excludeTransactionsActionSchema,
  includeTransactionsActionSchema,
  renameBucketActionSchema,
  setBucketMonthlyTargetActionSchema,
  setPlanModeActionSchema,
]);

export const financeActionsSchema = z.array(financeActionSchema).max(6);

export type FinanceAction = z.infer<typeof financeActionSchema>;

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
  mappedBucket: string;
  bucketGroup: BucketGroup;
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

export type FinanceCategoryCard = {
  bucket: string;
  group: BucketGroup;
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
  totalsByGroup: Record<Exclude<BucketGroup, "excluded">, number>;
  bucketTargets: Array<{
    bucket: string;
    group: BucketGroup;
    monthlyTarget: number;
    trailingAverage: number;
    trailingTotal: number;
  }>;
};

export type FinanceAppliedOverride = {
  id: string;
  type: FinanceAction["type"];
  summary: string;
  createdAt: string;
};

export type FinanceSnapshot = {
  status: FinanceSnapshotStatus;
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
    bucket: string;
    group: BucketGroup;
  }>;
  appliedOverrides: FinanceAppliedOverride[];
};
