import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { ProjectTransactions } from "@/components/finance/project-transactions";
import { getProjectById } from "@/lib/db/queries";
import { getFinanceSnapshot } from "@/lib/finance/snapshot";
import { getFinanceTransactionsViewData } from "@/lib/finance/transactions-view";

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
  const initialData = await getFinanceTransactionsViewData({
    projectId: project.id,
    projectTitle: project.title,
    snapshotStatus: snapshot.status,
    filters: {
      page: 1,
      sortBy: "date",
      sortDirection: "desc",
    },
  });

  return <ProjectTransactions initialData={initialData} />;
}
