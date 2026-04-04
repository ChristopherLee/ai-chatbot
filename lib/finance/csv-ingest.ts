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
  getDefaultMappedCategory,
  resolveCategoryGroupFromCategory,
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

function parseAmount({
  amount,
  rowNumber,
}: {
  amount: string;
  rowNumber?: number;
}) {
  const parsed = Number.parseFloat(amount.replace(/,/g, ""));

  if (!Number.isFinite(parsed)) {
    throw new ChatSDKError(
      "bad_request:api",
      rowNumber
        ? `CSV row ${rowNumber} contains an invalid Amount value`
        : "CSV contains an invalid amount"
    );
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

function formatRowList(rowNumbers: number[]) {
  const unique = [...new Set(rowNumbers)].slice(0, 3);

  if (unique.length === 0) {
    return "";
  }

  if (unique.length === 1) {
    return `row ${unique[0]}`;
  }

  if (unique.length === 2) {
    return `rows ${unique[0]} and ${unique[1]}`;
  }

  return `rows ${unique[0]}, ${unique[1]}, and ${unique[2]}`;
}

function formatCount(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function convertSlashDateToIso(dateValue: string) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateValue.trim());

  if (!match) {
    return null;
  }

  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function detectLikelySwappedColumns({
  rows,
  mappedHeaders,
}: {
  rows: Record<string, unknown>[];
  mappedHeaders: Record<(typeof EXPECTED_TRANSACTION_HEADERS)[number], string | null>;
}) {
  const accountHeader = mappedHeaders.Account;
  const descriptionHeader = mappedHeaders.Description;

  if (!accountHeader || !descriptionHeader || rows.length < 5) {
    return null;
  }

  const accountValues = rows
    .map((row) => normalizeWhitespace(getRowValue({ row, header: accountHeader })))
    .filter(Boolean);
  const descriptionValues = rows
    .map((row) =>
      normalizeWhitespace(getRowValue({ row, header: descriptionHeader }))
    )
    .filter(Boolean);

  if (accountValues.length < 5 || descriptionValues.length < 5) {
    return null;
  }

  const descriptionCounts = new Map<string, number>();
  for (const value of descriptionValues) {
    descriptionCounts.set(value, (descriptionCounts.get(value) ?? 0) + 1);
  }

  let topDescriptionValue: string | null = null;
  let topDescriptionCount = 0;

  for (const [value, count] of descriptionCounts.entries()) {
    if (count > topDescriptionCount) {
      topDescriptionValue = value;
      topDescriptionCount = count;
    }
  }

  if (!topDescriptionValue) {
    return null;
  }

  const repeatedDescriptionShare = topDescriptionCount / descriptionValues.length;
  const descriptionDistinctCount = descriptionCounts.size;
  const accountDistinctCount = new Set(accountValues).size;
  const sampleAccountValue =
    accountValues.find((value) => value !== topDescriptionValue) ?? accountValues[0];

  if (
    repeatedDescriptionShare < 0.85 ||
    descriptionDistinctCount > 3 ||
    accountDistinctCount < 10 ||
    !sampleAccountValue
  ) {
    return null;
  }

  return `The file may also have Account and Description swapped: Description is almost always "${topDescriptionValue}" while Account looks like merchant text, for example "${sampleAccountValue}".`;
}

function validateParsedRows({
  rows,
  mappedHeaders,
}: {
  rows: Record<string, unknown>[];
  mappedHeaders: Record<(typeof EXPECTED_TRANSACTION_HEADERS)[number], string | null>;
}) {
  const missingRequiredFieldRows = {
    Date: [] as number[],
    Account: [] as number[],
    Description: [] as number[],
    Category: [] as number[],
  };
  const invalidDateRows: Array<{ rowNumber: number; value: string }> = [];
  const invalidAmountRows: Array<{ rowNumber: number; value: string }> = [];
  let slashDateCount = 0;

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const transactionDate = normalizeWhitespace(
      getRowValue({ row, header: mappedHeaders.Date })
    );
    const account = normalizeWhitespace(
      getRowValue({ row, header: mappedHeaders.Account })
    );
    const description = normalizeWhitespace(
      getRowValue({ row, header: mappedHeaders.Description })
    );
    const category = normalizeWhitespace(
      getRowValue({ row, header: mappedHeaders.Category })
    );
    const amount = normalizeWhitespace(
      getRowValue({ row, header: mappedHeaders.Amount })
    );

    if (!transactionDate) {
      missingRequiredFieldRows.Date.push(rowNumber);
    } else {
      const parsedTransactionDate = parseISO(transactionDate);

      if (Number.isNaN(parsedTransactionDate.getTime())) {
        invalidDateRows.push({
          rowNumber,
          value: transactionDate,
        });

        if (convertSlashDateToIso(transactionDate)) {
          slashDateCount += 1;
        }
      }
    }

    if (!account) {
      missingRequiredFieldRows.Account.push(rowNumber);
    }

    if (!description) {
      missingRequiredFieldRows.Description.push(rowNumber);
    }

    if (!category) {
      missingRequiredFieldRows.Category.push(rowNumber);
    }

    if (amount.length === 0) {
      invalidAmountRows.push({
        rowNumber,
        value: amount,
      });
      continue;
    }

    const parsedAmount = Number.parseFloat(amount.replace(/,/g, ""));
    if (!Number.isFinite(parsedAmount)) {
      invalidAmountRows.push({
        rowNumber,
        value: amount,
      });
    }
  }

  const issues: string[] = [];

  if (invalidDateRows.length > 0) {
    if (slashDateCount === invalidDateRows.length) {
      const sampleSlashDate = invalidDateRows[0]?.value ?? "";
      const isoExample = convertSlashDateToIso(sampleSlashDate);

      issues.push(
        `Found ${formatCount(
          invalidDateRows.length,
          "Date value"
        )} in MM/DD/YYYY format, starting at ${formatRowList(
          invalidDateRows.map((entry) => entry.rowNumber)
        )}. Use YYYY-MM-DD instead${
          isoExample ? `, for example ${isoExample} instead of ${sampleSlashDate}` : ""
        }.`
      );
    } else {
      issues.push(
        `Found ${formatCount(
          invalidDateRows.length,
          "invalid Date value"
        )}, starting at ${formatRowList(
          invalidDateRows.map((entry) => entry.rowNumber)
        )}.`
      );
    }
  }

  for (const [fieldName, rowNumbers] of Object.entries(missingRequiredFieldRows)) {
    if (rowNumbers.length === 0) {
      continue;
    }

    issues.push(
      `Found ${rowNumbers.length} ${
        rowNumbers.length === 1 ? "row" : "rows"
      } with blank ${fieldName} values, starting at ${formatRowList(rowNumbers)}.`
    );
  }

  if (invalidAmountRows.length > 0) {
    issues.push(
      `Found ${formatCount(
        invalidAmountRows.length,
        "invalid Amount value"
      )}, starting at ${formatRowList(
        invalidAmountRows.map((entry) => entry.rowNumber)
      )}.`
    );
  }

  if (issues.length === 0) {
    return;
  }

  const swappedColumnsHint = detectLikelySwappedColumns({
    rows,
    mappedHeaders,
  });

  if (swappedColumnsHint) {
    issues.push(swappedColumnsHint);
  }

  throw new ChatSDKError("bad_request:api", `CSV validation failed. ${issues.join(" ")}`);
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
    const firstError = result.errors[0];
    const rowLabel =
      typeof firstError?.row === "number"
        ? ` around row ${firstError.row + 1}`
        : "";
    const detail =
      typeof firstError?.message === "string"
        ? firstError.message
        : "Unknown CSV parsing error";

    throw new ChatSDKError(
      "bad_request:api",
      `Failed to parse CSV upload${rowLabel}: ${detail}`
    );
  }

  const { headers, mappedHeaders } = await resolveHeaders(result.meta.fields);

  if (!result.data.length) {
    throw new ChatSDKError("bad_request:api", "CSV is empty");
  }

  validateParsedRows({
    rows: result.data,
    mappedHeaders,
  });

  const transactions = result.data.map((row, index) => {
    const rowNumber = index + 2;
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

    const missingFields = [
      transactionDate ? null : "Date",
      account ? null : "Account",
      description ? null : "Description",
      rawCategory ? null : "Category",
    ].filter((value): value is string => Boolean(value));

    if (missingFields.length > 0) {
      throw new ChatSDKError(
        "bad_request:api",
        `CSV row ${rowNumber} is missing required values: ${missingFields.join(", ")}`
      );
    }

    const parsedTransactionDate = parseISO(transactionDate);

    if (Number.isNaN(parsedTransactionDate.getTime())) {
      throw new ChatSDKError(
        "bad_request:api",
        `CSV row ${rowNumber} contains an invalid Date value: ${transactionDate}`
      );
    }

    const amountSigned = roundCurrency(
      parseAmount({
        amount: getRowValue({ row, header: mappedHeaders.Amount }),
        rowNumber,
      })
    );
    const outflowAmount =
      amountSigned < 0 ? roundCurrency(Math.abs(amountSigned)) : 0;
    const mappedCategory = getDefaultMappedCategory(rawCategory);

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
      mappedCategory,
      categoryGroup: resolveCategoryGroupFromCategory({
        category: mappedCategory,
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
