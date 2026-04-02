import { generateObject } from "ai";
import { parseISO } from "date-fns";
import Papa from "papaparse";
import { z } from "zod";
import { getLanguageModel } from "@/lib/ai/providers";
import { isTestEnvironment } from "@/lib/constants";
import type { Transaction } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import {
  EXPECTED_TRANSACTION_HEADERS,
  getDefaultMappedBucket,
  resolveBucketGroupFromBucket,
} from "./config";
import {
  formatMonthForTitle,
  normalizeWhitespace,
  roundCurrency,
} from "./utils";

const REQUIRED_TRANSACTION_HEADERS = [
  "Date",
  "Account",
  "Description",
  "Category",
  "Amount",
] as const;

const CANONICAL_HEADER_ALIASES: Record<string, string[]> = {
  Date: [
    "date",
    "transaction date",
    "posted date",
    "posting date",
    "trans date",
  ],
  Account: ["account", "account name", "account type", "source account"],
  Description: [
    "description",
    "merchant",
    "payee",
    "memo",
    "transaction description",
    "name",
  ],
  Category: ["category", "type", "subcategory", "spend category"],
  Tags: ["tags", "tag", "labels", "notes", "label"],
  Amount: [
    "amount",
    "transaction amount",
    "value",
    "debit/credit",
    "net amount",
  ],
};

const LLM_HEADER_SCHEMA = z.object({
  Date: z.string().nullable(),
  Account: z.string().nullable(),
  Description: z.string().nullable(),
  Category: z.string().nullable(),
  Tags: z.string().nullable(),
  Amount: z.string().nullable(),
});

export type ParsedTransactionsCsv = {
  headers: string[];
  filename: string;
  rowCount: number;
  dateRange: {
    start: string;
    end: string;
  };
  transactions: Array<
    Omit<Transaction, "id" | "createdAt"> & { createdAt?: Date }
  >;
};

export function normalizeMerchant(description: string) {
  const core = description
    .split(" - ")[0]
    .replace(/[*]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b\d+\b/g, " ");

  const normalized = normalizeWhitespace(core);
  return normalized.length > 0 ? normalized : normalizeWhitespace(description);
}

function parseAmount(amount: string) {
  const parsed = Number.parseFloat(amount.replace(/,/g, ""));

  if (!Number.isFinite(parsed)) {
    throw new ChatSDKError("bad_request:api", "CSV contains an invalid amount");
  }

  return parsed;
}

function normalizeHeaderKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildHeaderLookup(headers: string[]) {
  return new Map(headers.map((header) => [normalizeHeaderKey(header), header]));
}

function applyAliasHeuristics(headers: string[]) {
  const headerLookup = buildHeaderLookup(headers);
  const usedHeaders = new Set<string>();
  const resolved: Record<string, string | null> = {};

  for (const headerName of EXPECTED_TRANSACTION_HEADERS) {
    const aliases = CANONICAL_HEADER_ALIASES[headerName] ?? [];
    const exactMatch = aliases
      .map((alias) => headerLookup.get(normalizeHeaderKey(alias)))
      .find((candidate): candidate is string => Boolean(candidate));

    if (exactMatch && !usedHeaders.has(exactMatch)) {
      resolved[headerName] = exactMatch;
      usedHeaders.add(exactMatch);
      continue;
    }

    const fallbackContainsMatch = headers.find((header) => {
      if (usedHeaders.has(header)) {
        return false;
      }

      const normalizedHeader = normalizeHeaderKey(header);
      return aliases.some((alias) =>
        normalizedHeader.includes(normalizeHeaderKey(alias))
      );
    });

    if (fallbackContainsMatch) {
      resolved[headerName] = fallbackContainsMatch;
      usedHeaders.add(fallbackContainsMatch);
      continue;
    }

    resolved[headerName] = null;
  }

  return resolved as Record<
    (typeof EXPECTED_TRANSACTION_HEADERS)[number],
    string | null
  >;
}

function canUseLlmHeaderDetection() {
  return !isTestEnvironment && Boolean(process.env.AI_GATEWAY_API_KEY);
}

async function inferHeadersWithLlm(headers: string[]) {
  if (!canUseLlmHeaderDetection()) {
    return null;
  }

  try {
    const { object } = await generateObject({
      model: getLanguageModel("openai/gpt-4.1-mini"),
      schema: LLM_HEADER_SCHEMA,
      prompt: `You map CSV headers for finance transactions.

Available CSV headers:\n${headers.map((header) => `- ${header}`).join("\n")}

Choose the best matching header for each required field:
- Date
- Account
- Description
- Category
- Tags
- Amount

Rules:
- Return one of the provided header names or null.
- Use null when uncertain.
- Do not invent names.
- Each mapped header should be used at most once.`,
    });

    return object;
  } catch (error) {
    console.warn("CSV header LLM mapping failed", error);
    return null;
  }
}

async function resolveHeaders(fields: string[] | undefined) {
  if (!fields) {
    throw new ChatSDKError("bad_request:api", "CSV headers are missing");
  }

  const headers = fields.map((field) => field.trim()).filter(Boolean);
  const heuristicMatches = applyAliasHeuristics(headers);
  const unresolved = EXPECTED_TRANSACTION_HEADERS.filter(
    (header) => !heuristicMatches[header]
  );

  const resolved = heuristicMatches;

  if (unresolved.length > 0) {
    const llmMatches = await inferHeadersWithLlm(headers);

    if (llmMatches) {
      const usedHeaders = new Set(
        Object.values(heuristicMatches).filter(
          (value): value is string => value !== null
        )
      );

      for (const headerName of EXPECTED_TRANSACTION_HEADERS) {
        if (resolved[headerName]) {
          continue;
        }

        const candidate = llmMatches[headerName];

        if (
          candidate &&
          headers.includes(candidate) &&
          !usedHeaders.has(candidate)
        ) {
          resolved[headerName] = candidate;
          usedHeaders.add(candidate);
        }
      }
    }
  }

  const missingRequiredHeaders = REQUIRED_TRANSACTION_HEADERS.filter(
    (header) => !resolved[header]
  );

  if (missingRequiredHeaders.length > 0) {
    throw new ChatSDKError(
      "bad_request:api",
      `CSV is missing required fields: ${missingRequiredHeaders.join(", ")}. Recognized headers: ${headers.join(", ")}`
    );
  }

  return {
    headers,
    mappedHeaders: {
      Date: resolved.Date,
      Account: resolved.Account,
      Description: resolved.Description,
      Category: resolved.Category,
      Tags: resolved.Tags,
      Amount: resolved.Amount,
    } as Record<(typeof EXPECTED_TRANSACTION_HEADERS)[number], string | null>,
  };
}

function getRowValue({
  row,
  header,
}: {
  row: Record<string, unknown>;
  header: string | null;
}) {
  if (!header) {
    return "";
  }

  const rawValue = row[header];
  return typeof rawValue === "string" ? rawValue : "";
}

export function buildFinanceChatTitle({
  filename,
  startDate,
  endDate,
}: {
  filename: string;
  startDate: string;
  endDate: string;
}) {
  const cleanFilename = filename.replace(/\.csv$/i, "");
  return `${cleanFilename} - ${formatMonthForTitle(startDate)} to ${formatMonthForTitle(endDate)}`;
}

export async function parseTransactionsCsv({
  projectId,
  filename,
  csvText,
}: {
  projectId: string;
  filename: string;
  csvText: string;
}): Promise<ParsedTransactionsCsv> {
  const result = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (result.errors.length > 0) {
    throw new ChatSDKError("bad_request:api", "Failed to parse CSV upload");
  }

  const { headers, mappedHeaders } = await resolveHeaders(result.meta.fields);

  if (!result.data.length) {
    throw new ChatSDKError("bad_request:api", "CSV is empty");
  }

  const transactions = result.data.map((row) => {
    const transactionDate = normalizeWhitespace(
      getRowValue({ row, header: mappedHeaders.Date })
    );
    const account = normalizeWhitespace(
      getRowValue({ row, header: mappedHeaders.Account })
    );
    const description = normalizeWhitespace(
      getRowValue({ row, header: mappedHeaders.Description })
    );
    const rawCategory = normalizeWhitespace(
      getRowValue({ row, header: mappedHeaders.Category })
    );
    const tags = normalizeWhitespace(
      getRowValue({ row, header: mappedHeaders.Tags })
    );

    if (!transactionDate || !account || !description || !rawCategory) {
      throw new ChatSDKError(
        "bad_request:api",
        "CSV contains a row with missing required values"
      );
    }

    parseISO(transactionDate);

    const amountSigned = roundCurrency(
      parseAmount(getRowValue({ row, header: mappedHeaders.Amount }))
    );
    const outflowAmount =
      amountSigned < 0 ? roundCurrency(Math.abs(amountSigned)) : 0;
    const mappedBucket = getDefaultMappedBucket(rawCategory);

    return {
      projectId,
      transactionDate,
      account,
      description,
      normalizedMerchant: normalizeMerchant(description),
      rawCategory,
      tags: tags.length > 0 ? tags : null,
      amountSigned,
      outflowAmount,
      mappedBucket,
      bucketGroup: resolveBucketGroupFromBucket({
        bucket: mappedBucket,
        includeFlag: true,
      }),
      includeFlag: true,
      exclusionReason: null,
      notes: null,
    } satisfies Omit<Transaction, "id" | "createdAt">;
  });

  const sortedDates = transactions
    .map((transaction) => transaction.transactionDate)
    .sort();
  const startDate = sortedDates[0];
  const endDate = sortedDates.at(-1);

  if (!startDate || !endDate) {
    throw new ChatSDKError(
      "bad_request:api",
      "CSV did not contain any valid transaction dates"
    );
  }

  return {
    headers,
    filename,
    rowCount: transactions.length,
    dateRange: {
      start: startDate,
      end: endDate,
    },
    transactions,
  };
}
