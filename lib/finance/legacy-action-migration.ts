import type { FinanceAction } from "./types";

export type LegacyRemapRawCategoryAction = {
  type: "remap_raw_category";
  from: string;
  to: string;
};

export type LegacyRenameBucketAction = {
  type: "rename_bucket";
  from: string;
  to: string;
};

export type LegacyMergeBucketsAction = {
  type: "merge_buckets";
  from: string[];
  to: string;
};

export type LegacySetBucketMonthlyTargetAction = {
  type: "set_bucket_monthly_target";
  bucket: string;
  amount: number;
  effectiveMonth?: string;
};

export type LegacyFinanceAction =
  | FinanceAction
  | LegacyRemapRawCategoryAction
  | LegacyRenameBucketAction
  | LegacyMergeBucketsAction
  | LegacySetBucketMonthlyTargetAction;

export type FinanceCategoryMigrationCounts = {
  remapRawCategoryCount: number;
  renameBucketCount: number;
  mergeBucketsCount: number;
};

export function assertFinanceCategoryMigrationSafety(
  counts: FinanceCategoryMigrationCounts
) {
  if (counts.renameBucketCount > 0 || counts.mergeBucketsCount > 0) {
    throw new Error(
      `Finance category migration aborted: rename_bucket=${counts.renameBucketCount}, merge_buckets=${counts.mergeBucketsCount}`
    );
  }
}

export function migrateLegacyFinanceAction(
  action: LegacyFinanceAction
): FinanceAction {
  switch (action.type) {
    case "remap_raw_category":
      return {
        type: "categorize_transactions",
        match: {
          rawCategory: action.from,
        },
        to: action.to,
      };
    case "set_bucket_monthly_target":
      return {
        type: "set_category_monthly_target",
        category: action.bucket,
        amount: action.amount,
        ...(action.effectiveMonth
          ? { effectiveMonth: action.effectiveMonth }
          : {}),
      };
    case "rename_bucket":
    case "merge_buckets":
      throw new Error(
        `Legacy finance action "${action.type}" must be removed before migrating to categories.`
      );
    default:
      return action;
  }
}
