import assert from "node:assert/strict";
import test from "node:test";
import { financeActionsSchema } from "@/lib/finance/types";

test("finance action schema accepts category as a match alias", () => {
  const actions = financeActionsSchema.parse([
    {
      type: "exclude_transactions",
      match: {
        category: "Property Tax",
      },
    },
  ]);

  assert.deepEqual(actions, [
    {
      type: "exclude_transactions",
      match: {
        rawCategory: "Property Tax",
      },
    },
  ]);
});

test("finance action schema preserves merchant-only and description-only matches", () => {
  const actions = financeActionsSchema.parse([
    {
      type: "categorize_transactions",
      match: {
        merchant: "Sp Smartwings",
      },
      to: "Furniture",
    },
    {
      type: "exclude_transactions",
      match: {
        descriptionContains: "balance transfer",
      },
    },
  ]);

  assert.deepEqual(actions, [
    {
      type: "categorize_transactions",
      match: {
        merchant: "Sp Smartwings",
      },
      to: "Furniture",
    },
    {
      type: "exclude_transactions",
      match: {
        descriptionContains: "balance transfer",
      },
    },
  ]);
});
