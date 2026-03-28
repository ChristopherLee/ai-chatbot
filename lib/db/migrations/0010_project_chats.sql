CREATE TABLE IF NOT EXISTS "Project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL,
	"title" text NOT NULL,
	"userId" uuid NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "projectId" uuid;
--> statement-breakpoint
INSERT INTO "Project" ("id", "createdAt", "updatedAt", "title", "userId")
SELECT "id", "createdAt", "createdAt", "title", "userId"
FROM "Chat"
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
UPDATE "Chat"
SET "projectId" = "id"
WHERE "projectId" IS NULL;
--> statement-breakpoint
ALTER TABLE "Chat" ALTER COLUMN "projectId" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Chat" ADD CONSTRAINT "Chat_projectId_Project_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "UploadedFile" ADD COLUMN IF NOT EXISTS "projectId" uuid;
--> statement-breakpoint
UPDATE "UploadedFile"
SET "projectId" = "chatId"
WHERE "projectId" IS NULL;
--> statement-breakpoint
ALTER TABLE "UploadedFile" ALTER COLUMN "projectId" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_projectId_Project_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "UploadedFile" DROP CONSTRAINT IF EXISTS "UploadedFile_chatId_Chat_id_fk";
--> statement-breakpoint
ALTER TABLE "UploadedFile" DROP COLUMN IF EXISTS "chatId";
--> statement-breakpoint
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "projectId" uuid;
--> statement-breakpoint
UPDATE "Transaction"
SET "projectId" = "chatId"
WHERE "projectId" IS NULL;
--> statement-breakpoint
ALTER TABLE "Transaction" ALTER COLUMN "projectId" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_projectId_Project_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "Transaction_chatId_Chat_id_fk";
--> statement-breakpoint
ALTER TABLE "Transaction" DROP COLUMN IF EXISTS "chatId";
--> statement-breakpoint
ALTER TABLE "FinanceOverride" ADD COLUMN IF NOT EXISTS "projectId" uuid;
--> statement-breakpoint
UPDATE "FinanceOverride"
SET "projectId" = "chatId"
WHERE "projectId" IS NULL;
--> statement-breakpoint
ALTER TABLE "FinanceOverride" ALTER COLUMN "projectId" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FinanceOverride" ADD CONSTRAINT "FinanceOverride_projectId_Project_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "FinanceOverride" DROP CONSTRAINT IF EXISTS "FinanceOverride_chatId_Chat_id_fk";
--> statement-breakpoint
ALTER TABLE "FinanceOverride" DROP COLUMN IF EXISTS "chatId";
--> statement-breakpoint
ALTER TABLE "FinancePlan" ADD COLUMN IF NOT EXISTS "projectId" uuid;
--> statement-breakpoint
UPDATE "FinancePlan"
SET "projectId" = "chatId"
WHERE "projectId" IS NULL;
--> statement-breakpoint
ALTER TABLE "FinancePlan" ALTER COLUMN "projectId" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FinancePlan" ADD CONSTRAINT "FinancePlan_projectId_Project_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "FinancePlan" DROP CONSTRAINT IF EXISTS "FinancePlan_chatId_Chat_id_fk";
--> statement-breakpoint
ALTER TABLE "FinancePlan" DROP COLUMN IF EXISTS "chatId";
