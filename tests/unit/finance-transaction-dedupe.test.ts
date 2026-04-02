import assert from "node:assert/strict";
import test from "node:test";
import { filterNewTransactions } from "@/lib/finance/transaction-dedupe";

function makeTransaction({
  transactionDate = "2026-01-03",
  account = "Checking",
  description = "Coffee Shop",
  normalizedMerchant = "coffee shop",
  amountSigned = -8.99,
}: Partial<{
  transactionDate: string;
  account: string;
  description: string;
  normalizedMerchant: string;
  amountSigned: number;
}> = {}) {
  return {
    transactionDate,
    account,
    description,
    normalizedMerchant,
    amountSigned,
  };
}

test("filterNewTransactions excludes rows already present in project history", () => {
  const existingTransactions = [makeTransaction()];
  const candidateTransactions = [
    makeTransaction(),
    makeTransaction({
      description: "Groceries",
      normalizedMerchant: "local market",
      amountSigned: -54.21,
    }),
  ];

  const filtered = filterNewTransactions({
    existingTransactions,
    candidateTransactions,
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.description, "Groceries");
});

test("filterNewTransactions deduplicates duplicates within a single upload", () => {
  const duplicate = makeTransaction({
    description: "Gym",
    normalizedMerchant: "gym",
    amountSigned: -29.99,
  });
  const filtered = filterNewTransactions({
    existingTransactions: [],
    candidateTransactions: [duplicate, duplicate],
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.description, "Gym");
});

test("filterNewTransactions rounds amounts to cents for duplicate matching", () => {
  const existingTransactions = [
    makeTransaction({
      amountSigned: -19.9900000001,
    }),
  ];
  const candidateTransactions = [
    makeTransaction({
      amountSigned: -19.99,
    }),
  ];

  const filtered = filterNewTransactions({
    existingTransactions,
    candidateTransactions,
  });

  assert.equal(filtered.length, 0);
});
