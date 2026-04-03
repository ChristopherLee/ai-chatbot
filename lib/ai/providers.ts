import { gateway } from "@ai-sdk/gateway";
import type { SharedV3ProviderOptions } from "@ai-sdk/provider";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { isTestEnvironment } from "../constants";
import { DEFAULT_CHAT_MODEL, LEGACY_GATEWAY_CHAT_MODEL } from "./models";

const THINKING_SUFFIX_REGEX = /-thinking$/;
const OPENROUTER_THINKING_SUFFIX = ":thinking";
const GATEWAY_REASONING_MODEL = "anthropic/claude-3.7-sonnet-thinking";
const GATEWAY_TITLE_MODEL = "google/gemini-2.5-flash-lite";
const GATEWAY_ARTIFACT_MODEL = "anthropic/claude-haiku-4.5";
const OPENROUTER_REASONING_MODEL = "anthropic/claude-3.7-sonnet:thinking";
const DEFAULT_REASONING_BUDGET_TOKENS = 10_000;

export const myProvider = isTestEnvironment
  ? (() => {
      const {
        artifactModel,
        chatModel,
        reasoningModel,
        titleModel,
      } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "chat-model-reasoning": reasoningModel,
          "title-model": titleModel,
          "artifact-model": artifactModel,
        },
      });
    })()
  : null;

export type LlmBackend = "gateway" | "openrouter";

function parseBooleanEnv(name: string) {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return undefined;
  }

  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }

  return undefined;
}

function parseNumberEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    return undefined;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

function parseCsvEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseKeyValueEnv(name: string) {
  const entries = parseCsvEnv(name)
    .map((item) => {
      const [rawKey, ...rawValueParts] = item.split("=");
      const key = rawKey?.trim();
      const value = rawValueParts.join("=").trim();

      if (!key || !value) {
        return null;
      }

      return [key, value] as const;
    })
    .filter((entry): entry is readonly [string, string] => Boolean(entry));

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function getLlmBackend(): LlmBackend {
  const configuredBackend = process.env.LLM_BACKEND?.trim().toLowerCase();

  if (configuredBackend === "openrouter" || configuredBackend === "router") {
    return "openrouter";
  }

  if (
    configuredBackend === "gateway" ||
    configuredBackend === "vercel" ||
    configuredBackend === "vercel-gateway"
  ) {
    return "gateway";
  }

  return process.env.OPENROUTER_API_KEY ? "openrouter" : "gateway";
}

function getReasoningBudgetTokens() {
  return (
    parseNumberEnv("OPENROUTER_REASONING_MAX_TOKENS") ??
    parseNumberEnv("LLM_REASONING_MAX_TOKENS") ??
    DEFAULT_REASONING_BUDGET_TOKENS
  );
}

export function isReasoningModelId(modelId: string) {
  const normalizedModelId = modelId.trim().toLowerCase();

  return (
    normalizedModelId === "chat-model-reasoning" ||
    normalizedModelId.endsWith("-thinking") ||
    normalizedModelId.endsWith(":thinking")
  );
}

function getOpenRouterHeaders() {
  const referer =
    process.env.OPENROUTER_HTTP_REFERER ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL;
  const title =
    process.env.OPENROUTER_APP_TITLE ?? process.env.NEXT_PUBLIC_APP_NAME;

  const headers: Record<string, string> = {};

  if (referer) {
    headers["HTTP-Referer"] = referer;
  }

  if (title) {
    headers["X-Title"] = title;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

function getOpenRouterExtraBody() {
  const providerOrder = parseCsvEnv("OPENROUTER_PROVIDER_ORDER");
  const providerOnly = parseCsvEnv("OPENROUTER_PROVIDER_ONLY");
  const providerIgnore = parseCsvEnv("OPENROUTER_PROVIDER_IGNORE");
  const allowFallbacks = parseBooleanEnv("OPENROUTER_PROVIDER_ALLOW_FALLBACKS");
  const requireParameters = parseBooleanEnv(
    "OPENROUTER_PROVIDER_REQUIRE_PARAMETERS"
  );
  const dataCollection =
    process.env.OPENROUTER_PROVIDER_DATA_COLLECTION?.trim();
  const sort = process.env.OPENROUTER_PROVIDER_SORT?.trim();

  const provider: Record<string, unknown> = {};

  if (providerOrder.length > 0) {
    provider.order = providerOrder;
  }

  if (providerOnly.length > 0) {
    provider.only = providerOnly;
  }

  if (providerIgnore.length > 0) {
    provider.ignore = providerIgnore;
  }

  if (allowFallbacks !== undefined) {
    provider.allow_fallbacks = allowFallbacks;
  }

  if (requireParameters !== undefined) {
    provider.require_parameters = requireParameters;
  }

  if (dataCollection) {
    provider.data_collection = dataCollection;
  }

  if (sort) {
    provider.sort = sort;
  }

  return Object.keys(provider).length > 0 ? { provider } : undefined;
}

function getOpenRouterProviderApiKeys() {
  return parseKeyValueEnv("OPENROUTER_PROVIDER_API_KEYS");
}

function getOpenRouterProvider() {
  const headers = getOpenRouterHeaders();
  const extraBody = getOpenRouterExtraBody();
  const apiKeys = getOpenRouterProviderApiKeys();

  return createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
    compatibility: "strict",
    ...(headers ? { headers } : {}),
    ...(extraBody ? { extraBody } : {}),
    ...(apiKeys ? { api_keys: apiKeys } : {}),
  });
}

function getConfiguredOpenRouterModel(
  kind: "chat" | "reasoning" | "title" | "artifact"
) {
  switch (kind) {
    case "reasoning":
      return (
        process.env.OPENROUTER_REASONING_MODEL ??
        process.env.OPENROUTER_CHAT_REASONING_MODEL ??
        OPENROUTER_REASONING_MODEL
      );
    case "title":
      return (
        process.env.OPENROUTER_TITLE_MODEL ??
        process.env.OPENROUTER_CHAT_MODEL ??
        process.env.OPENROUTER_DEFAULT_MODEL ??
        LEGACY_GATEWAY_CHAT_MODEL
      );
    case "artifact":
      return (
        process.env.OPENROUTER_ARTIFACT_MODEL ??
        process.env.OPENROUTER_CHAT_MODEL ??
        process.env.OPENROUTER_DEFAULT_MODEL ??
        GATEWAY_ARTIFACT_MODEL
      );
    default:
      return (
        process.env.OPENROUTER_CHAT_MODEL ??
        process.env.OPENROUTER_DEFAULT_MODEL ??
        LEGACY_GATEWAY_CHAT_MODEL
      );
  }
}

export function getResolvedLanguageModelId(modelId: string) {
  const normalizedModelId = modelId.trim();
  const backend = getLlmBackend();

  switch (normalizedModelId) {
    case "":
    case DEFAULT_CHAT_MODEL:
    case "chat-model":
      return backend === "openrouter"
        ? getConfiguredOpenRouterModel("chat")
        : LEGACY_GATEWAY_CHAT_MODEL;
    case "chat-model-reasoning":
      return backend === "openrouter"
        ? getConfiguredOpenRouterModel("reasoning")
        : GATEWAY_REASONING_MODEL;
    case "title-model":
      return backend === "openrouter"
        ? getConfiguredOpenRouterModel("title")
        : GATEWAY_TITLE_MODEL;
    case "artifact-model":
      return backend === "openrouter"
        ? getConfiguredOpenRouterModel("artifact")
        : GATEWAY_ARTIFACT_MODEL;
    default:
      if (backend === "openrouter" && normalizedModelId.endsWith("-thinking")) {
        return normalizedModelId.replace(
          THINKING_SUFFIX_REGEX,
          OPENROUTER_THINKING_SUFFIX
        );
      }

      return normalizedModelId;
  }
}

function getTestModelAlias(modelId: string) {
  switch (modelId.trim()) {
    case "title-model":
      return "title-model";
    case "artifact-model":
      return "artifact-model";
    default:
      return isReasoningModelId(modelId)
        ? "chat-model-reasoning"
        : "chat-model";
  }
}

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(getTestModelAlias(modelId));
  }

  const resolvedModelId = getResolvedLanguageModelId(modelId);

  if (getLlmBackend() === "openrouter") {
    return getOpenRouterProvider().languageModel(resolvedModelId);
  }

  if (isReasoningModelId(resolvedModelId)) {
    const gatewayModelId = resolvedModelId.replace(THINKING_SUFFIX_REGEX, "");

    return wrapLanguageModel({
      model: gateway.languageModel(gatewayModelId),
      middleware: extractReasoningMiddleware({ tagName: "thinking" }),
    });
  }

  return gateway.languageModel(resolvedModelId);
}

export function getLanguageModelProviderOptions(
  modelId: string
): SharedV3ProviderOptions | undefined {
  if (isTestEnvironment || !isReasoningModelId(modelId)) {
    return undefined;
  }

  const reasoningBudgetTokens = getReasoningBudgetTokens();

  if (getLlmBackend() === "openrouter") {
    return {
      openrouter: {
        reasoning: {
          max_tokens: reasoningBudgetTokens,
        },
      },
    } satisfies SharedV3ProviderOptions;
  }

  return {
    anthropic: {
      thinking: { type: "enabled", budgetTokens: reasoningBudgetTokens },
    },
  } satisfies SharedV3ProviderOptions;
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }

  if (getLlmBackend() === "openrouter") {
    return getOpenRouterProvider().languageModel(
      getResolvedLanguageModelId("title-model")
    );
  }

  return gateway.languageModel(GATEWAY_TITLE_MODEL);
}

export function getArtifactModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("artifact-model");
  }

  if (getLlmBackend() === "openrouter") {
    return getOpenRouterProvider().languageModel(
      getResolvedLanguageModelId("artifact-model")
    );
  }

  return gateway.languageModel(GATEWAY_ARTIFACT_MODEL);
}
