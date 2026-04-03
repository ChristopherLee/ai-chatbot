import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAcceptedActionsFromReviewSelections,
  buildAcceptedSelectionPlan,
} from "@/lib/finance/categorization-review-shared";

test("accepted review selections skip transaction actions already covered by accepted rules", () => {
  const actions = buildAcceptedActionsFromReviewSelections({
    acceptedRules: [
      {
        id: "rule-1",
        key: "rule-key-1",
        summary: "Categorized matching transactions as Mortgage",
        rationale: "This merchant consistently looks like a mortgage payment.",
        action: {
          type: "categorize_transactions",
          match: {
            merchant: "Direct Debit Crosscountry",
          },
          to: "Mortgage",
        },
        matchedTransactionIds: ["11111111-1111-4111-8111-111111111111"],
        matchedTransactionCount: 1,
        affectedOutflow: 12_364.71,
      },
    ],
    acceptedTransactions: [
      {
        id: "transaction-1",
        key: "tx-key-1",
        summary:
          "Categorize Direct Debit Crosscountry on 2026-03-26 as Mortgage",
        rationale: "This individual payment looks like a mortgage payment.",
        transactionId: "11111111-1111-4111-8111-111111111111",
        transactionDate: "2026-03-26",
        description: "Direct Debit Crosscountry 1sweb Pymnt",
        merchant: "Direct Debit Crosscountry",
        account: "Checking",
        amount: 12_364.71,
        currentCategory: "Other / Misc",
        rawCategory: "Other Expenses",
        suggestedCategory: "Mortgage",
        matchingRuleIds: ["rule-1"],
        action: {
          type: "categorize_transaction",
          transactionId: "11111111-1111-4111-8111-111111111111",
          to: "Mortgage",
        },
      },
      {
        id: "transaction-2",
        key: "tx-key-2",
        summary: "Categorize Eversource on 2026-03-26 as Utilities",
        rationale: "This one-off payment should be utilities.",
        transactionId: "22222222-2222-4222-8222-222222222222",
        transactionDate: "2026-03-26",
        description: "Eversource Bill Pay",
        merchant: "Eversource",
        account: "Checking",
        amount: 245.5,
        currentCategory: "Other / Misc",
        rawCategory: "Other Expenses",
        suggestedCategory: "Utilities",
        matchingRuleIds: [],
        action: {
          type: "categorize_transaction",
          transactionId: "22222222-2222-4222-8222-222222222222",
          to: "Utilities",
        },
      },
    ],
  });

  assert.deepEqual(actions, [
    {
      type: "categorize_transactions",
      match: {
        merchant: "Direct Debit Crosscountry",
      },
      to: "Mortgage",
    },
    {
      type: "categorize_transaction",
      transactionId: "22222222-2222-4222-8222-222222222222",
      to: "Utilities",
    },
  ]);
});

test("accepted review selections keep rule updates separate from new actions", () => {
  const selectionPlan = buildAcceptedSelectionPlan({
    acceptedRules: [
      {
        id: "rule-1",
        key: "rule-key-1",
        summary: "Categorized matching transactions as Mortgage",
        rationale: "This merchant consistently looks like a mortgage payment.",
        action: {
          type: "categorize_transactions",
          match: {
            merchant: "Direct Debit Crosscountry",
          },
          to: "Mortgage",
        },
        matchedTransactionIds: ["11111111-1111-4111-8111-111111111111"],
        matchedTransactionCount: 1,
        affectedOutflow: 12_364.71,
        replaceRuleId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        replaceRuleSummary: "Categorized matching transactions as Housing",
      },
    ],
    acceptedTransactions: [
      {
        id: "transaction-1",
        key: "tx-key-1",
        summary:
          "Categorize Direct Debit Crosscountry on 2026-03-26 as Mortgage",
        rationale: "This individual payment looks like a mortgage payment.",
        transactionId: "11111111-1111-4111-8111-111111111111",
        transactionDate: "2026-03-26",
        description: "Direct Debit Crosscountry 1sweb Pymnt",
        merchant: "Direct Debit Crosscountry",
        account: "Checking",
        amount: 12_364.71,
        currentCategory: "Other / Misc",
        rawCategory: "Other Expenses",
        suggestedCategory: "Mortgage",
        matchingRuleIds: ["rule-1"],
        action: {
          type: "categorize_transaction",
          transactionId: "11111111-1111-4111-8111-111111111111",
          to: "Mortgage",
        },
      },
    ],
  });

  assert.deepEqual(selectionPlan, {
    ruleUpdates: [
      {
        ruleId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        action: {
          type: "categorize_transactions",
          match: {
            merchant: "Direct Debit Crosscountry",
          },
          to: "Mortgage",
        },
      },
    ],
    createActions: [],
  });
});

