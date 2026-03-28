CREATE TABLE IF NOT EXISTS "FinanceCategorizationDenial" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"summary" text NOT NULL,
	"valueJson" json NOT NULL,
	"createdAt" timestamp NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FinanceCategorizationDenial" ADD CONSTRAINT "FinanceCategorizationDenial_projectId_Project_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
