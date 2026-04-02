ALTER TABLE "Project"
ADD COLUMN IF NOT EXISTS "totalMonthlyBudgetTarget" double precision;

ALTER TABLE "Project"
ADD COLUMN IF NOT EXISTS "totalMonthlyIncomeTarget" double precision;
