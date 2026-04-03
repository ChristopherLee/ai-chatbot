// Backend-owned alias used by the chat UI. The actual model route is resolved
// server-side so we can swap providers without client changes.
export const DEFAULT_CHAT_MODEL = "auto";

// Legacy Vercel Gateway default retained for the fallback path.
export const LEGACY_GATEWAY_CHAT_MODEL = "google/gemini-2.5-flash-lite";

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  group: string;
  logoProvider?: string;
  description: string;
};

const CURRENT_SETUP_GROUP = "Current Setup";
const TOP_FREE_MODELS_GROUP = "Top OpenRouter Free Models";

export const chatModels: ChatModel[] = [
  {
    id: DEFAULT_CHAT_MODEL,
    name: "Project Default",
    provider: "openrouter",
    group: CURRENT_SETUP_GROUP,
    description: "Uses the server-configured default chat route",
  },
  {
    id: "openrouter/free",
    name: "OpenRouter Free Auto",
    provider: "openrouter",
    group: CURRENT_SETUP_GROUP,
    description:
      "Lets OpenRouter choose an available free model for each request",
  },
  {
    id: "stepfun/step-3.5-flash:free",
    name: "Step 3.5 Flash",
    provider: "stepfun",
    group: TOP_FREE_MODELS_GROUP,
    logoProvider: "openrouter",
    description:
      "The most-used free model on OpenRouter right now with 256K context",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    name: "Nemotron 3 Super 120B",
    provider: "nvidia",
    group: TOP_FREE_MODELS_GROUP,
    description:
      "Strong long-context reasoning and coding with a 262K context window",
  },
  {
    id: "qwen/qwen3.6-plus:free",
    name: "Qwen 3.6 Plus",
    provider: "qwen",
    group: TOP_FREE_MODELS_GROUP,
    logoProvider: "alibaba",
    description:
      "Popular 1M-context generalist with strong coding and reasoning",
  },
  {
    id: "arcee-ai/trinity-large-preview:free",
    name: "Trinity Large Preview",
    provider: "arcee-ai",
    group: TOP_FREE_MODELS_GROUP,
    logoProvider: "openrouter",
    description:
      "Large open model tuned for chat, creativity, and agent workflows",
  },
  {
    id: "z-ai/glm-4.5-air:free",
    name: "GLM 4.5 Air",
    provider: "z-ai",
    group: TOP_FREE_MODELS_GROUP,
    logoProvider: "zai",
    description: "Fast agent model with optional deeper reasoning modes",
  },
  {
    id: "nvidia/nemotron-3-nano-30b-a3b:free",
    name: "Nemotron 3 Nano 30B",
    provider: "nvidia",
    group: TOP_FREE_MODELS_GROUP,
    description: "Smaller, faster open model for everyday agent tasks",
  },
  {
    id: "arcee-ai/trinity-mini:free",
    name: "Trinity Mini",
    provider: "arcee-ai",
    group: TOP_FREE_MODELS_GROUP,
    logoProvider: "openrouter",
    description: "Compact agentic model with good function-calling behavior",
  },
  {
    id: "minimax/minimax-m2.5:free",
    name: "MiniMax M2.5",
    provider: "minimax",
    group: TOP_FREE_MODELS_GROUP,
    logoProvider: "openrouter",
    description:
      "Strong productivity and coding model with a 197K context window",
  },
  {
    id: "qwen/qwen3-coder:free",
    name: "Qwen3 Coder 480B",
    provider: "qwen",
    group: TOP_FREE_MODELS_GROUP,
    logoProvider: "alibaba",
    description: "Coding-focused free model for repo work and tool use",
  },
  {
    id: "openai/gpt-oss-120b:free",
    name: "gpt-oss-120b",
    provider: "openai",
    group: TOP_FREE_MODELS_GROUP,
    description: "OpenAI's large open-weight reasoning and agent model",
  },
  {
    id: "qwen/qwen3-next-80b-a3b-instruct:free",
    name: "Qwen3 Next 80B",
    provider: "qwen",
    group: TOP_FREE_MODELS_GROUP,
    logoProvider: "alibaba",
    description:
      "Stable long-context assistant tuned for consistent final answers",
  },
  {
    id: "openai/gpt-oss-20b:free",
    name: "gpt-oss-20b",
    provider: "openai",
    group: TOP_FREE_MODELS_GROUP,
    description: "Lower-latency open-weight OpenAI model for lighter tasks",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "Llama 3.3 70B Instruct",
    provider: "meta-llama",
    group: TOP_FREE_MODELS_GROUP,
    logoProvider: "llama",
    description: "Reliable multilingual general-purpose chat model",
  },
];

function decodeSavedChatModelId(modelId: string | null | undefined) {
  if (!modelId) {
    return null;
  }

  try {
    return decodeURIComponent(modelId);
  } catch {
    return modelId;
  }
}

export function getChatModelById(modelId: string | null | undefined) {
  if (!modelId) {
    return undefined;
  }

  return chatModels.find((model) => model.id === modelId);
}

export function getSavedChatModelId(modelId: string | null | undefined) {
  const normalizedModelId = decodeSavedChatModelId(modelId);

  return getChatModelById(normalizedModelId)
    ? normalizedModelId
    : DEFAULT_CHAT_MODEL;
}

// Group models by UI section for the model picker.
export const modelsByGroup = chatModels.reduce(
  (acc, model) => {
    if (!acc[model.group]) {
      acc[model.group] = [];
    }
    acc[model.group].push(model);
    return acc;
  },
  {} as Record<string, ChatModel[]>
);
