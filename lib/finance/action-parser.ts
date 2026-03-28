import { generateObject } from "ai";
import { getLanguageModel } from "@/lib/ai/providers";
import { isTestEnvironment } from "@/lib/constants";
import type { FinanceAction, FinanceSnapshot } from "./types";
import { financeActionsSchema } from "./types";
import { resolveEffectiveMonthFromName, safeLower } from "./utils";

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function findKnownName(term: string, candidates: string[]) {
  const normalizedTerm = safeLower(term).trim();

  return (
    candidates.find((candidate) => safeLower(candidate) === normalizedTerm) ??
    candidates.find((candidate) =>
      safeLower(candidate).includes(normalizedTerm)
    ) ??
    candidates.find((candidate) =>
      normalizedTerm.includes(safeLower(candidate))
    ) ??
    null
  );
}

function normalizeMatchPhrase(value: string) {
  return value.replace(/^(?:the|all)\s+/i, "").trim();
}

function stripWrappingQuotes(value: string) {
  return value
    .replace(/^(["'`\u201c\u201d]+)|(["'`\u201c\u201d]+)$/giu, "")
    .trim();
}

function resolveBucketName(term: string, buckets: string[]) {
  const normalized = stripWrappingQuotes(term).trim();
  return findKnownName(normalized, buckets) ?? titleCase(normalized);
}

function buildCategorizeTransactionsAction({
  source,
  destination,
  rawCategories,
  buckets,
}: {
  source: string;
  destination: string;
  rawCategories: string[];
  buckets: string[];
}): FinanceAction | null {
  const normalizedSource = stripWrappingQuotes(normalizeMatchPhrase(source))
    .replace(
      /^(?:merchant|payee|vendor|transaction|transactions|description|memo)\s+/i,
      ""
    )
    .trim();

  if (!normalizedSource) {
    return null;
  }

  const rawCategory = findKnownName(normalizedSource, rawCategories);

  return {
    type: "categorize_transactions",
    match: rawCategory
      ? {
          rawCategory,
        }
      : {
          merchant: normalizedSource,
        },
    to: resolveBucketName(destination, buckets),
  };
}

function isPlausibleDescriptionMatch(value: string) {
  const normalized = normalizeMatchPhrase(value);

  if (!normalized) {
    return false;
  }

  if (/^(?:it|them|those|these|this|that|or|and)\b/i.test(normalized)) {
    return false;
  }

  if (
    /\b(?:my budget|your budget|won't be recurring|will not be recurring|in the future|ask me|need help|whether to|help from me)\b/i.test(
      normalized
    )
  ) {
    return false;
  }

  return normalized.length <= 48;
}

export function buildHeuristicActions({
  latestUserMessage,
  snapshot,
}: {
  latestUserMessage: string;
  snapshot: FinanceSnapshot | null;
}): FinanceAction[] {
  const text = latestUserMessage.trim();
  const lower = safeLower(text);
  const rawCategories =
    snapshot?.datasetSummary?.rawCategories.map((category) => category.name) ??
    [];
  const buckets =
    snapshot?.planSummary?.bucketTargets.map((bucket) => bucket.bucket) ?? [];
  const referenceDate =
    snapshot?.datasetSummary?.dateRange.end ??
    new Date().toISOString().slice(0, 10);
  const knownUncategorizedCategory =
    findKnownName("uncategorized", rawCategories) ?? "Uncategorized";

  const actions: FinanceAction[] = [];

  if (lower.includes("conservative")) {
    actions.push({ type: "set_plan_mode", mode: "conservative" });
  }

  const mergeMatch = text.match(
    /(?:combine|merge)\s+(.+?)\s+(?:and|with)\s+(.+?)(?:\.|$)/i
  );

  if (mergeMatch) {
    const first = titleCase(mergeMatch[1].trim());
    const second = titleCase(mergeMatch[2].trim());
    const knownFirst =
      findKnownName(first, [...rawCategories, ...buckets]) ?? first;
    const knownSecond =
      findKnownName(second, [...rawCategories, ...buckets]) ?? second;
    const mergedName =
      findKnownName("transport + travel", buckets) ??
      `${knownFirst} + ${knownSecond}`;

    actions.push({
      type: "merge_buckets",
      from: [knownFirst, knownSecond],
      to: mergedName,
    });
  }

  const reassignMatch = text.match(/put\s+(.+?)\s+under\s+(.+?)(?:\.|$)/i);

  if (reassignMatch) {
    const from =
      findKnownName(reassignMatch[1].trim(), rawCategories) ??
      titleCase(reassignMatch[1].trim());
    const to = resolveBucketName(reassignMatch[2].trim(), buckets);

    actions.push({
      type: "remap_raw_category",
      from,
      to,
    });
  }

  const categorizeMatch = text.match(
    /(?:categorize|recategorize|map|assign)\s+(.+?)\s+transactions?\s+(?:always\s+)?(?:to|as|under|into)\s+(.+?)(?:\s+going\s+forward)?(?:[.!?]|$)/i
  );

  if (categorizeMatch) {
    const action = buildCategorizeTransactionsAction({
      source: categorizeMatch[1],
      destination: categorizeMatch[2],
      rawCategories,
      buckets,
    });

    if (action) {
      actions.push(action);
    }
  }

  const renameMatch = text.match(/rename\s+(.+?)\s+to\s+(.+?)(?:\.|$)/i);

  if (renameMatch) {
    const from =
      findKnownName(renameMatch[1].trim(), buckets) ??
      titleCase(renameMatch[1].trim());
    const to = titleCase(renameMatch[2].trim());
    actions.push({ type: "rename_bucket", from, to });
  }

  const mortgageMatch = text.match(
    /([\w\s&+/]+?)\s+changes?\s+in\s+([A-Za-z]+)\s+to\s+\$?([\d,]+(?:\.\d+)?)/i
  );

  if (mortgageMatch) {
    const bucket = resolveBucketName(mortgageMatch[1].trim(), buckets);
    const effectiveMonth = resolveEffectiveMonthFromName({
      monthName: mortgageMatch[2],
      referenceDate,
    });
    const amount = Number.parseFloat(mortgageMatch[3].replace(/,/g, ""));

    if (Number.isFinite(amount)) {
      actions.push({
        type: "set_bucket_monthly_target",
        bucket,
        amount,
        ...(effectiveMonth ? { effectiveMonth } : {}),
      });
    }
  }

  const setTargetMatch = text.match(
    /set\s+(.+?)\s+to\s+\$?([\d,]+(?:\.\d+)?)(?:\s+in\s+([A-Za-z]+))?/i
  );

  if (setTargetMatch) {
    const bucket = resolveBucketName(setTargetMatch[1].trim(), buckets);
    const amount = Number.parseFloat(setTargetMatch[2].replace(/,/g, ""));
    const effectiveMonth = setTargetMatch[3]
      ? resolveEffectiveMonthFromName({
          monthName: setTargetMatch[3],
          referenceDate,
        })
      : undefined;

    if (Number.isFinite(amount)) {
      actions.push({
        type: "set_bucket_monthly_target",
        bucket,
        amount,
        ...(effectiveMonth ? { effectiveMonth } : {}),
      });
    }
  }

  const categoryDirectiveMatch = text.match(
    /\b(exclude|include)\s+(?:the\s+)?(.+?)\s+(?:bucket|category)\b/i
  );

  if (categoryDirectiveMatch) {
    const rawCategory = findKnownName(
      categoryDirectiveMatch[2].trim(),
      rawCategories
    );

    if (rawCategory) {
      actions.push({
        type:
          safeLower(categoryDirectiveMatch[1]) === "exclude"
            ? "exclude_transactions"
            : "include_transactions",
        match: {
          rawCategory,
        },
      });
    }
  }

  if (
    lower.includes("uncategorized") &&
    (/\b(?:ignore|ignored|skip|skipped|remove|removed)\b/.test(lower) ||
      /not true expenses?/.test(lower) ||
      /not an? expense/.test(lower))
  ) {
    actions.push({
      type: "exclude_transactions",
      match: {
        rawCategory: knownUncategorizedCategory,
      },
    });
  }

  const excludeMatch = text.match(/exclude\s+(.+?)(?:\.|$)/i);

  if (excludeMatch) {
    const descriptionContains = normalizeMatchPhrase(excludeMatch[1]);

    if (isPlausibleDescriptionMatch(descriptionContains)) {
      actions.push({
        type: "exclude_transactions",
        match: {
          descriptionContains,
        },
      });
    }
  }

  const includeMatch = text.match(/include\s+(.+?)(?:\.|$)/i);

  if (includeMatch && !lower.startsWith("include the")) {
    const descriptionContains = normalizeMatchPhrase(includeMatch[1]);

    if (isPlausibleDescriptionMatch(descriptionContains)) {
      actions.push({
        type: "include_transactions",
        match: {
          descriptionContains,
        },
      });
    }
  }

  return actions.filter(
    (action, index, allActions) =>
      index ===
      allActions.findIndex(
        (candidate) => JSON.stringify(candidate) === JSON.stringify(action)
      )
  );
}

export async function extractFinanceActions({
  selectedChatModel,
  latestUserMessage,
  snapshot,
  conversationMessages,
}: {
  selectedChatModel: string;
  latestUserMessage: string;
  snapshot: FinanceSnapshot | null;
  conversationMessages: Array<{
    role: string;
    text: string;
  }>;
}) {
  const heuristicActions = buildHeuristicActions({
    latestUserMessage,
    snapshot,
  });

  if (isTestEnvironment) {
    return heuristicActions;
  }

  try {
    const { object } = await generateObject({
      model: getLanguageModel(selectedChatModel),
      schema: financeActionsSchema,
      system: `You extract structured finance planning actions from chat messages.

Only return actions when the user clearly asks for one of these supported operations:
- merge_buckets
- remap_raw_category
- categorize_transactions
- exclude_transactions
- include_transactions
- rename_bucket
- set_bucket_monthly_target
- set_plan_mode

If the message only provides goals or context, return an empty array.
Prefer exact existing raw categories and bucket names when available.
When the user names a merchant or transaction label, use categorize_transactions with a precise match instead of remap_raw_category.`,
      prompt: JSON.stringify({
        latestUserMessage,
        conversationMessages: conversationMessages.slice(-12),
        currentSnapshot: snapshot
          ? {
              status: snapshot.status,
              planSummary: snapshot.planSummary,
              datasetSummary: snapshot.datasetSummary
                ? {
                    rawCategories: snapshot.datasetSummary.rawCategories.map(
                      (category) => category.name
                    ),
                    buckets:
                      snapshot.planSummary?.bucketTargets.map(
                        (bucket) => bucket.bucket
                      ) ?? [],
                    endDate: snapshot.datasetSummary.dateRange.end,
                  }
                : null,
            }
          : null,
      }),
    });

    const combinedActions = [...object, ...heuristicActions];

    return combinedActions.filter(
      (action, index, allActions) =>
        index ===
        allActions.findIndex(
          (candidate) => JSON.stringify(candidate) === JSON.stringify(action)
        )
    );
  } catch (_error) {
    return heuristicActions;
  }
}
