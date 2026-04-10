import assert from "node:assert/strict";
import test from "node:test";
import type { FinanceOverride } from "@/lib/db/schema";
import { buildFinanceActionKey } from "@/lib/finance/action-keys";
import { buildTransactionCategoryRuleSuggestion } from "@/lib/finance/transaction-category-suggestions";
import type { FinanceTransaction } from "@/lib/finance/types";

function createTransaction(
  overrides: Partial<FinanceTransaction> & Pick<FinanceTransaction, "id">
): FinanceTransaction {
  const { id, ...rest } = overrides;

  return {
    id,
    projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    transactionDate: "2026-03-01",
    account: "Checking",
    description: "Netflix Membership",
    normalizedMerchant: "Netflix Membership",
    rawCategory: "Other Expenses",
    tags: null,
    amountSigned: -19.99,
    outflowAmount: 19.99,
    mappedCategory: "Other / Misc",
    categoryGroup: "flexible",
    includeFlag: true,
    exclusionReason: null,
    notes: null,
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    ...rest,
  };
}

function createCategorizationOverride({
  id,
  action,
}: {
  id: string;
  action: Extract<
    Parameters<typeof buildFinanceActionKey>[0],
    { type: "categorize_transactions" }
  >;
}): FinanceOverride {
  return {
    id,
    projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    type: action.type,
    key: buildFinanceActionKey(action),
    valueJson: action,
    createdAt: new Date("2026-03-10T00:00:00.000Z"),
  };
}

test("suggests a recurring rule when the same exact description repeats", () => {
  const baseTransactions = [
    createTransaction({
      id: "11111111-1111-4111-8111-111111111111",
    }),
    createTransaction({
      id: "22222222-2222-4222-8222-222222222222",
      transactionDate: "2026-02-01",
    }),
  ];

  const suggestion = buildTransactionCategoryRuleSuggestion({
    baseTransactions,
    finalTransactions: baseTransactions,
    nextCategory: "Subscriptions",
    overrides: [],
    transactionId: "11111111-1111-4111-8111-111111111111",
  });

  assert.ok(suggestion);
  assert.deepEqual(suggestion.action, {
    type: "categorize_transactions",
    match: {
      descriptionContains: "Netflix Membership",
    },
    to: "Subscriptions",
  });
  assert.equal(suggestion.matchedTransactions, 2);
  assert.equal(suggestion.replaceRuleId, null);
});

test("narrows the rule to the account when the same description appears across accounts", () => {
  const baseTransactions = [
    createTransaction({
      id: "11111111-1111-4111-8111-111111111111",
      account: "Checking",
    }),
    createTransaction({
      id: "22222222-2222-4222-8222-222222222222",
      account: "Checking",
      transactionDate: "2026-02-01",
    }),
    createTransaction({
      id: "33333333-3333-4333-8333-333333333333",
      account: "Credit Card",
      transactionDate: "2026-01-01",
    }),
  ];

  const suggestion = buildTransactionCategoryRuleSuggestion({
    baseTransactions,
    finalTransactions: baseTransactions,
    nextCategory: "Subscriptions",
    overrides: [],
    transactionId: "11111111-1111-4111-8111-111111111111",
  });

  assert.ok(suggestion);
  assert.deepEqual(suggestion.action.match, {
    account: "Checking",
    descriptionContains: "Netflix Membership",
  });
  assert.equal(suggestion.matchedTransactions, 2);
});

test("skips the suggestion when a description-based rule would overmatch other descriptions", () => {
  const baseTransactions = [
    createTransaction({
      id: "11111111-1111-4111-8111-111111111111",
      description: "Uber",
      normalizedMerchant: "Uber",
    }),
    createTransaction({
      id: "22222222-2222-4222-8222-222222222222",
      description: "Uber",
      normalizedMerchant: "Uber",
      transactionDate: "2026-02-01",
    }),
    createTransaction({
      id: "33333333-3333-4333-8333-333333333333",
      description: "Uber Eats",
      normalizedMerchant: "Uber Eats",
      transactionDate: "2026-01-01",
    }),
  ];

  const suggestion = buildTransactionCategoryRuleSuggestion({
    baseTransactions,
    finalTransactions: baseTransactions,
    nextCategory: "Transport + Travel",
    overrides: [],
    transactionId: "11111111-1111-4111-8111-111111111111",
  });

  assert.equal(suggestion, null);
});

test("marks a same-match rule for replacement when the destination category changes", () => {
  const baseTransactions = [
    createTransaction({
      id: "11111111-1111-4111-8111-111111111111",
    }),
    createTransaction({
      id: "22222222-2222-4222-8222-222222222222",
      transactionDate: "2026-02-01",
    }),
  ];
  const overrides = [
    createCategorizationOverride({
      id: "44444444-4444-4444-8444-444444444444",
      action: {
        type: "categorize_transactions",
        match: {
          descriptionContains: "Netflix Membership",
        },
        to: "Entertainment",
      },
    }),
  ];

  const suggestion = buildTransactionCategoryRuleSuggestion({
    baseTransactions,
    finalTransactions: baseTransactions,
    nextCategory: "Subscriptions",
    overrides,
    transactionId: "11111111-1111-4111-8111-111111111111",
  });

  assert.ok(suggestion);
  assert.equal(
    suggestion.replaceRuleId,
    "44444444-4444-4444-8444-444444444444"
  );
  assert.equal(
    suggestion.replaceRuleSummary,
    "Categorized matching transactions as Entertainment"
  );
});
