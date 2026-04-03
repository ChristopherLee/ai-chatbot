import { isDevelopmentEnvironment } from "@/lib/constants";

const DEV_STREAM_TIMEOUT_MS = 60_000;
const PROD_STREAM_TIMEOUT_MS = 45_000;

export const CHAT_STREAM_TIMEOUT_MS = isDevelopmentEnvironment
  ? DEV_STREAM_TIMEOUT_MS
  : PROD_STREAM_TIMEOUT_MS;

export function createStreamTimeout(timeoutMs = CHAT_STREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(
      new Error(`Chat response timed out after ${timeoutMs}ms`)
    );
  }, timeoutMs);

  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timeoutId);
    },
  };
}

export function isStreamTimeoutError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes("timed out") || error.name === "AbortError")
  );
}
