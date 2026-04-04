import { auth } from "@/app/(auth)/auth";
import { getProjectById } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { financeTransactionQueryInputSchema } from "@/lib/finance/query-transactions";
import { getFinanceSnapshot } from "@/lib/finance/snapshot";
import { getFinanceTransactionsViewData } from "@/lib/finance/transactions-view";

function parseBoolean(value: string | null) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

function parseNumber(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseFilters(searchParams: URLSearchParams) {
  const candidate = {
    search: searchParams.get("search") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    account: searchParams.get("account") ?? undefined,
    includeFlag: parseBoolean(searchParams.get("includeFlag")),
    startDate: searchParams.get("startDate") ?? undefined,
    endDate: searchParams.get("endDate") ?? undefined,
    page: parseNumber(searchParams.get("page")),
    sortBy: searchParams.get("sortBy") ?? undefined,
    sortDirection: searchParams.get("sortDirection") === "asc" ? "asc" : "desc",
  };

  const normalizedCandidate = Object.fromEntries(
    Object.entries(candidate).filter(([, value]) => value !== undefined)
  );

  return financeTransactionQueryInputSchema.safeParse(normalizedCandidate);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const project = await getProjectById({ id });

  if (!project) {
    return new ChatSDKError(
      "not_found:database",
      "Project not found"
    ).toResponse();
  }

  if (project.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const parsedFilters = parseFilters(new URL(request.url).searchParams);

  if (!parsedFilters.success) {
    return new ChatSDKError(
      "bad_request:api",
      "Invalid transaction filters"
    ).toResponse();
  }

  const snapshot = await getFinanceSnapshot({ projectId: project.id });
  const data = await getFinanceTransactionsViewData({
    projectId: project.id,
    projectTitle: project.title,
    snapshotStatus: snapshot.status,
    filters: parsedFilters.data,
  });

  return Response.json(data);
}
