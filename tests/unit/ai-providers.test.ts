import assert from "node:assert/strict";
import test from "node:test";
import {
  getLanguageModel,
  getLanguageModelProviderOptions,
  getLlmBackend,
  getResolvedLanguageModelId,
  isReasoningModelId,
} from "@/lib/ai/providers";

const originalEnv = { ...process.env };

test.afterEach(() => {
  process.env = { ...originalEnv };
});

test("openrouter backend resolves the automatic alias to the configured model", () => {
  process.env.LLM_BACKEND = "openrouter";
  process.env.OPENROUTER_CHAT_MODEL = "deepseek/deepseek-v3.2";

  assert.equal(getLlmBackend(), "openrouter");
  assert.equal(getResolvedLanguageModelId("auto"), "deepseek/deepseek-v3.2");
  assert.equal(getLanguageModel("auto").modelId, "deepseek/deepseek-v3.2");
});

test("openrouter backend translates legacy thinking ids to the OpenRouter suffix", () => {
  process.env.LLM_BACKEND = "openrouter";

  assert.equal(
    getResolvedLanguageModelId("anthropic/claude-3.7-sonnet-thinking"),
    "anthropic/claude-3.7-sonnet:thinking"
  );

  assert.deepEqual(
    getLanguageModelProviderOptions("anthropic/claude-3.7-sonnet-thinking"),
    {
      openrouter: {
        reasoning: {
          max_tokens: 10_000,
        },
      },
    }
  );
});

test("gateway backend keeps the legacy default route intact", () => {
  process.env.LLM_BACKEND = "gateway";

  assert.equal(getLlmBackend(), "gateway");
  assert.equal(
    getResolvedLanguageModelId("auto"),
    "google/gemini-2.5-flash-lite"
  );
  assert.deepEqual(
    getLanguageModelProviderOptions("anthropic/claude-3.7-sonnet-thinking"),
    {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 10_000,
        },
      },
    }
  );
});

test("only explicit thinking model ids are treated as reasoning models", () => {
  assert.equal(
    isReasoningModelId("anthropic/claude-3.7-sonnet-thinking"),
    true
  );
  assert.equal(
    isReasoningModelId("anthropic/claude-3.7-sonnet:thinking"),
    true
  );
  assert.equal(isReasoningModelId("xai/grok-4.1-fast-non-reasoning"), false);
  assert.equal(isReasoningModelId("openai/gpt-oss-120b:free"), false);

  assert.equal(
    getLanguageModelProviderOptions("xai/grok-4.1-fast-non-reasoning"),
    undefined
  );
});
