DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Transaction'
      AND column_name = 'mappedBucket'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Transaction'
      AND column_name = 'mappedCategory'
  ) THEN
    EXECUTE 'ALTER TABLE "Transaction" RENAME COLUMN "mappedBucket" TO "mappedCategory"';
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Transaction'
      AND column_name = 'bucketGroup'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Transaction'
      AND column_name = 'categoryGroup'
  ) THEN
    EXECUTE 'ALTER TABLE "Transaction" RENAME COLUMN "bucketGroup" TO "categoryGroup"';
  END IF;
END $$;
--> statement-breakpoint
DO $$
DECLARE
  rename_count integer;
  merge_count integer;
BEGIN
  SELECT count(*)
    INTO rename_count
  FROM "FinanceOverride"
  WHERE "type" = 'rename_bucket'
     OR ("valueJson"::jsonb ->> 'type') = 'rename_bucket';

  SELECT count(*)
    INTO merge_count
  FROM "FinanceOverride"
  WHERE "type" = 'merge_buckets'
     OR ("valueJson"::jsonb ->> 'type') = 'merge_buckets';

  IF rename_count > 0 OR merge_count > 0 THEN
    RAISE EXCEPTION
      'Finance category migration aborted because removed override rows still exist (rename_bucket=%, merge_buckets=%).',
      rename_count,
      merge_count;
  END IF;
END $$;
--> statement-breakpoint
UPDATE "FinanceOverride"
SET
  "type" = 'categorize_transactions',
  "valueJson" = jsonb_build_object(
    'type', 'categorize_transactions',
    'match', jsonb_build_object(
      'rawCategory',
      "valueJson"::jsonb ->> 'from'
    ),
    'to',
    "valueJson"::jsonb ->> 'to'
  )::json
WHERE "type" = 'remap_raw_category'
   OR ("valueJson"::jsonb ->> 'type') = 'remap_raw_category';
--> statement-breakpoint
UPDATE "FinanceOverride"
SET
  "type" = 'set_category_monthly_target',
  "valueJson" = jsonb_strip_nulls(
    jsonb_build_object(
      'type', 'set_category_monthly_target',
      'category', COALESCE(
        "valueJson"::jsonb ->> 'category',
        "valueJson"::jsonb ->> 'bucket'
      ),
      'amount', "valueJson"::jsonb -> 'amount',
      'effectiveMonth', "valueJson"::jsonb ->> 'effectiveMonth'
    )
  )::json
WHERE "type" = 'set_bucket_monthly_target'
   OR ("valueJson"::jsonb ->> 'type') = 'set_bucket_monthly_target';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION finance_rename_category_keys(value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE jsonb_typeof(value)
    WHEN 'object' THEN (
      SELECT COALESCE(
        jsonb_object_agg(
          CASE key
            WHEN 'bucket' THEN 'category'
            WHEN 'bucketTargets' THEN 'categoryTargets'
            WHEN 'bucketLimit' THEN 'categoryLimit'
            WHEN 'availableBucketCount' THEN 'availableCategoryCount'
            WHEN 'mappedBucket' THEN 'mappedCategory'
            WHEN 'bucketGroup' THEN 'categoryGroup'
            ELSE key
          END,
          finance_rename_category_keys(child_value)
        ),
        '{}'::jsonb
      )
      FROM jsonb_each(value) AS fields(key, child_value)
    )
    WHEN 'array' THEN (
      SELECT COALESCE(
        jsonb_agg(finance_rename_category_keys(child_value)),
        '[]'::jsonb
      )
      FROM jsonb_array_elements(value) AS items(child_value)
    )
    ELSE value
  END
$$;
--> statement-breakpoint
UPDATE "FinancePlan"
SET "planJson" = finance_rename_category_keys("planJson"::jsonb)::json;
--> statement-breakpoint
DROP FUNCTION finance_rename_category_keys(jsonb);
