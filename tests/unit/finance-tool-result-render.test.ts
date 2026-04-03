import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FinanceToolResult } from "@/components/finance/finance-tool-result";

test("FinanceToolResult renders legacy snapshot payloads without crashing", () => {
  const html = renderToStaticMarkup(
    React.createElement(FinanceToolResult, {
      type: "snapshot",
      result: {
        current: {
          status: "ready",
          includedOutflow: 2400,
          totalMonthlyTarget: 2600,
          trailingAverageSpend: 2500,
          topBuckets: [
            {
              bucket: "Mortgage",
              group: "fixed",
              monthlyTarget: 1800,
            },
          ],
        },
      },
    })
  );

  assert.match(html, /Mortgage/);
  assert.doesNotMatch(html, /NaN/);
});
