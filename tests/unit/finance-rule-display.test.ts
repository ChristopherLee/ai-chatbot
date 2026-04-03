import assert from "node:assert/strict";
import test from "node:test";
import {
  describeFinanceRuleAction,
  describeFinanceRuleBehavior,
  financeRuleTypeMetadata,
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
      type: "categorize_transactions",
      match: {
        rawCategory: "Restaurants",
      },
      to: "Dining",
    }),
    'Raw category "Restaurants" -> "Dining"'
  );
});

test("describeFinanceRuleAction formats category budgets cleanly", () => {
  assert.equal(
    describeFinanceRuleAction({
      type: "set_category_monthly_target",
      category: "Groceries",
      amount: 600,
    }),
    'Category budget "Groceries" -> 600'
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
      type: "categorize_transactions",
      match: {
        rawCategory: "Restaurants",
      },
      to: "Dining",
    }),
    "Applies to every transaction that matches these saved conditions."
  );
});

test("financeRuleTypeMetadata defines the remaining rule formats", () => {
  for (const type of [
    "categorize_transactions",
    "categorize_transaction",
    "exclude_transactions",
    "set_category_monthly_target",
    "set_plan_mode",
  ] as const) {
    assert.ok(financeRuleTypeMetadata[type].definition.length > 0);
    assert.ok(financeRuleTypeMetadata[type].why.length > 0);
  }
});
