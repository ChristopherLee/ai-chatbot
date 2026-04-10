import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFinanceStreamErrorMessage,
  buildStreamErrorMessage,
} from "@/lib/ai/stream-error-messages";

test("finance timeout errors stay actionable and omit deterministic summary details", () => {
  const message = buildFinanceStreamErrorMessage(
    new Error("The model stream timed out after 30 seconds")
  );

  assert.equal(
    message,
    "The finance reply timed out before the written explanation finished. Retry this message to generate the explanation again, or keep chatting from the current plan."
  );
  assert.equal(message.includes("deterministic summary"), false);
  assert.equal(message.includes("Total monthly budget"), false);
});

test("finance gateway activation errors explain the fix", () => {
  const message = buildFinanceStreamErrorMessage(
    new Error(
      "AI Gateway requires a valid credit card on file to service requests"
    )
  );

  assert.equal(
    message,
    "The finance reply could not finish because AI Gateway is not activated for this project. Activate AI Gateway, then retry this message."
  );
});

test("finance generic errors explain what failed and next steps", () => {
  const message = buildFinanceStreamErrorMessage(
    new Error("Unexpected provider failure")
  );

  assert.equal(
    message,
    "The finance reply could not finish because the model hit an internal error. Retry this message to generate the explanation again, or keep chatting from the current plan."
  );
});

test("general chat timeout errors keep the existing generic wording", () => {
  const message = buildStreamErrorMessage(
    new Error("The model stream timed out after 30 seconds")
  );

  assert.equal(
    message,
    "That reply took too long to finish, so I stopped the request. Please try again."
  );
});
