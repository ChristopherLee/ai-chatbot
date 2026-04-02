import assert from "node:assert/strict";
import test from "node:test";
import {
  describeFinanceRuleAction,
  describeFinanceRuleBehavior,
} from "@/lib/finance/rule-display";

test("describeFinanceRuleAction formats transaction match rules as source to destination", () => {
  assert.equal(
    describeFinanceRuleAction({
      type: "categorize_transactions",
      match: {
        merchant: "Amazon",
        account: "Checking",
      },
      to: "Shopping",
    }),
    'Merchant "Amazon" + Account "Checking" -> "Shopping"'
  );

  assert.equal(
    describeFinanceRuleAction({
      type: "remap_raw_category",
      from: "Restaurants",
      to: "Dining",
    }),
    'Raw category "Restaurants" -> "Dining"'
  );
});

test("describeFinanceRuleAction formats category merge and rename rules cleanly", () => {
  assert.equal(
    describeFinanceRuleAction({
      type: "merge_buckets",
      from: ["Dining", "Restaurants"],
      to: "Dining",
    }),
    'Categories "Dining" + "Restaurants" -> "Dining"'
  );

  assert.equal(
    describeFinanceRuleAction({
      type: "rename_bucket",
      from: "Other / Misc",
      to: "Household",
    }),
    'Category "Other / Misc" -> "Household"'
  );
});

test("describeFinanceRuleAction uses transaction detail text for one-off overrides", () => {
  assert.equal(
    describeFinanceRuleAction(
      {
        type: "categorize_transaction",
        transactionId: "11111111-1111-4111-8111-111111111111",
        to: "Mortgage",
      },
      [
        {
          label: "Transaction",
          value: "2026-03-01 - Direct Debit Crosscountry 1sweb Pymnt",
        },
      ]
    ),
    'Transaction "2026-03-01 - Direct Debit Crosscountry 1sweb Pymnt" -> "Mortgage"'
  );
});

test("describeFinanceRuleBehavior explains how merge rules behave", () => {
  assert.equal(
    describeFinanceRuleBehavior({
      type: "merge_buckets",
      from: ["Dining", "Restaurants"],
      to: "Dining",
    }),
    "Moves spend from the source categories into the destination category."
  );
});
