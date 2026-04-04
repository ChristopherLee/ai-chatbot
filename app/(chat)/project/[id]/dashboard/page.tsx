import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { FinanceDashboard } from "@/components/finance/finance-dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProjectById } from "@/lib/db/queries";
import { getFinanceSnapshot } from "@/lib/finance/snapshot";

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

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Badge variant="secondary">Dashboard</Badge>

          <div>
            <div className="font-semibold text-3xl tracking-tight">
              Budget dashboard
            </div>
            <div className="mt-1 max-w-2xl text-muted-foreground text-sm leading-6">
              Review the current monthly budget performance, spot the biggest
              movers, and drill into category details for this project.
            </div>
          </div>
        </div>

        <Button asChild type="button" variant="outline">
          <Link href={`/?projectId=${project.id}`}>
            <ArrowLeft className="size-4" />
            Back to project
          </Link>
        </Button>
      </div>

      <div className="-mx-4 md:-mx-6">
        <FinanceDashboard initialSnapshot={snapshot} projectId={project.id} />
      </div>
    </div>
  );
}
