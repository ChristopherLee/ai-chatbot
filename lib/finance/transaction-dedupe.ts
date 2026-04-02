import type { Transaction } from "@/lib/db/schema";

type TransactionForDuplicateCheck = Pick<
  Transaction,
  | "transactionDate"
  | "account"
  | "description"
  | "normalizedMerchant"
  | "amountSigned"
>;

function normalizeAmount(value: number) {
  return Math.round(value * 100);
}

export function buildTransactionDuplicateKey(
  transaction: TransactionForDuplicateCheck
) {
  return [
    transaction.transactionDate,
    transaction.account.trim(),
    transaction.description.trim(),
    transaction.normalizedMerchant.trim(),
    normalizeAmount(transaction.amountSigned),
  ].join("|");
}

export function filterNewTransactions({
  existingTransactions,
  candidateTransactions,
}: {
  existingTransactions: TransactionForDuplicateCheck[];
  candidateTransactions: TransactionForDuplicateCheck[];
}) {
  const existingKeys = new Set(
    existingTransactions.map(buildTransactionDuplicateKey)
  );
  const seenCandidateKeys = new Set<string>();

  return candidateTransactions.filter((transaction) => {
    const key = buildTransactionDuplicateKey(transaction);

    if (existingKeys.has(key) || seenCandidateKeys.has(key)) {
      return false;
    }

    seenCandidateKeys.add(key);
    return true;
  });
}
