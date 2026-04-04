import assert from "node:assert/strict";
import test from "node:test";
import { getFinanceUploadErrorMessage } from "@/lib/finance/upload-errors";

test("prefers explicit error fields from the upload API", () => {
  assert.equal(
    getFinanceUploadErrorMessage({
      error: "Only CSV uploads are supported.",
      message: "The request couldn't be processed.",
    }),
    "Only CSV uploads are supported."
  );
});

test("falls back to ChatSDKError causes before generic messages", () => {
  assert.equal(
    getFinanceUploadErrorMessage({
      cause: "CSV is empty",
      message:
        "The request couldn't be processed. Please check your input and try again.",
    }),
    "CSV is empty"
  );
});

test("uses a stable fallback when the response body is missing or invalid", () => {
  assert.equal(
    getFinanceUploadErrorMessage(null),
    "Failed to upload transactions"
  );
  assert.equal(
    getFinanceUploadErrorMessage({
      error: "   ",
      cause: false,
      message: undefined,
    }),
    "Failed to upload transactions"
  );
});
