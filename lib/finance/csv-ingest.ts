import { parseISO } from "date-fns";
import Papa from "papaparse";
import type { Transaction } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import {
  EXPECTED_TRANSACTION_HEADERS,
  getDefaultMappedBucket,
  isExcludedRawCategory,
  resolveBucketGroupFromBucket,
} from "./config";
import {
  formatMonthForTitle,
  normalizeWhitespace,
  roundCurrency,
} from "./utils";

type RawTransactionRow = {
  Date: string;
  Account: string;
  Description: string;
  Category: string;
  Tags: string;
  Amount: string;
};

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

function validateHeaders(fields: string[] | undefined) {
  if (!fields) {
    throw new ChatSDKError("bad_request:api", "CSV headers are missing");
  }

  const normalizedFields = fields.map((field) => field.trim());

  if (
    normalizedFields.length !== EXPECTED_TRANSACTION_HEADERS.length ||
    normalizedFields.some(
      (field, index) => field !== EXPECTED_TRANSACTION_HEADERS[index]
    )
  ) {
    throw new ChatSDKError(
      "bad_request:api",
      `CSV must use the sample header: ${EXPECTED_TRANSACTION_HEADERS.join(", ")}`
    );
  }

  return normalizedFields;
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

export function parseTransactionsCsv({
  projectId,
  filename,
  csvText,
}: {
  projectId: string;
  filename: string;
  csvText: string;
}): ParsedTransactionsCsv {
  const result = Papa.parse<RawTransactionRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (result.errors.length > 0) {
    throw new ChatSDKError("bad_request:api", "Failed to parse CSV upload");
  }

  const headers = validateHeaders(result.meta.fields);

  if (!result.data.length) {
    throw new ChatSDKError("bad_request:api", "CSV is empty");
  }

  const transactions = result.data.map((row) => {
    const transactionDate = row.Date?.trim();
    const account = normalizeWhitespace(row.Account ?? "");
    const description = normalizeWhitespace(row.Description ?? "");
    const rawCategory = normalizeWhitespace(row.Category ?? "");
    const tags = normalizeWhitespace(row.Tags ?? "");

    if (!transactionDate || !account || !description || !rawCategory) {
      throw new ChatSDKError(
        "bad_request:api",
        "CSV contains a row with missing required values"
      );
    }

    parseISO(transactionDate);

    const amountSigned = roundCurrency(parseAmount(row.Amount ?? "0"));
    const outflowAmount =
      amountSigned < 0 ? roundCurrency(Math.abs(amountSigned)) : 0;
    const mappedBucket = getDefaultMappedBucket(rawCategory);
    const includeFlag = !isExcludedRawCategory(rawCategory);

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
        includeFlag,
      }),
      includeFlag,
      exclusionReason: includeFlag ? null : "Excluded by default category rule",
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
