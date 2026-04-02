import assert from "node:assert/strict";
import test from "node:test";
import {
  createStreamTimeout,
  isStreamTimeoutError,
} from "@/lib/ai/stream-timeout";

test("createStreamTimeout aborts after the configured timeout", async () => {
  const streamTimeout = createStreamTimeout(10);

  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(streamTimeout.signal.aborted, true);
  assert.equal(
    isStreamTimeoutError(streamTimeout.signal.reason),
    true
  );

  streamTimeout.clear();
});

test("createStreamTimeout can be cleared before it aborts", async () => {
  const streamTimeout = createStreamTimeout(50);

  streamTimeout.clear();
  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.equal(streamTimeout.signal.aborted, false);
});
