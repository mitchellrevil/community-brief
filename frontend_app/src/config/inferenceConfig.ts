export const PROVIDERS_CONFIG = {
  responses: {
    reasoning_effort: {
      type: "list",
      options: ["low", "medium", "high"],
      label: "Thinking Depth",
      description: "Controls how deeply the model analyses the request. 'High' enables thorough, step-by-step thinking for complex problems (slower). 'Low' provides faster, more direct answers.",
      default: "medium",
    },
    verbosity: {
      type: "list",
      options: ["low", "medium", "high"],
      label: "Response Detail",
      description: "Sets the level of detail in the output. 'High' produces exhaustive, detailed explanations. 'Low' yields concise, summary-style responses.",
      default: "medium", // assuming medium is a sensible default if 'auto' isn't an option in the list
    },
    temperature: {
      type: "float",
      min: 0.0,
      max: 2.0,
      label: "Creativity Level",
      description: "Controls randomness: 0.0 = completely deterministic/focused, 1.0 = balanced creativity, 2.0 = highly creative.",
      default: 1.0,
    },
  },
  chat_completions: {
    temperature: {
      type: "float",
      min: 0.0,
      max: 2.0,
      label: "Creativity Level",
      description: "Controls randomness: 0.0 = completely deterministic/focused, 1.0 = balanced creativity, 2.0 = highly creative.",
      default: 1.0,
    },
  },
} as const;

// Model-specific parameter overrides
export const MODEL_PARAMETER_OVERRIDES: Record<string, Record<string, any>> = {
  "gpt-5.5-sweden": {
    reasoning_effort: {
      type: "list",
      options: ["none", "low", "medium", "high", "xhigh"],
      label: "Thinking Depth",
      description: "Controls how deeply the model analyses the request. GPT-5.5 defaults to 'medium', while 'xhigh' uses the deepest reasoning.",
      default: "medium",
    },
    verbosity: {
      type: "list",
      options: ["low", "medium", "high"],
      label: "Response Detail",
      description: "GPT-5.5 verbosity defaults to 'medium' and controls how long and detailed the response is.",
      default: "medium",
    },
    temperature: {
      type: "float",
      min: 0.0,
      max: 2.0,
      label: "Creativity Level",
      description: "Controls randomness. For GPT-5.5 this is only available when Thinking Depth is set to 'none'.",
      default: 1.0,
      dependsOn: {
        parameter: "reasoning_effort",
        value: "none",
        message: "Creativity Level is only available for GPT-5.5 when Thinking Depth is set to 'none'"
      }
    },
  },
  "gpt-5.4": {
    reasoning_effort: {
      type: "list",
      options: ["none", "low", "medium", "high", "xhigh"],
      label: "Thinking Depth",
      description: "Controls how deeply the model analyses the request. 'None' is the GPT-5.4 default for lower latency, while 'xhigh' uses the deepest reasoning.",
      default: "none",
    },
    verbosity: {
      type: "list",
      options: ["low", "medium", "high"],
      label: "Response Detail",
      description: "GPT-5.4 verbosity defaults to 'medium' and controls how long and detailed the response is.",
      default: "medium",
    },
    temperature: {
      type: "float",
      min: 0.0,
      max: 2.0,
      label: "Creativity Level",
      description: "Controls randomness. For GPT-5.4 this is only supported when Thinking Depth is set to 'none'.",
      default: 1.0,
      dependsOn: {
        parameter: "reasoning_effort",
        value: "none",
        message: "Creativity Level is only available for GPT-5.4 when Thinking Depth is set to 'none'"
      }
    },
  },
  "gpt-5.1": {
    reasoning_effort: {
      type: "list",
      options: ["none", "low", "medium", "high"],
      label: "Thinking Depth",
      description: "Controls how deeply the model analyses the request. 'High' enables thorough, step-by-step thinking for complex problems (slower). 'Low' provides faster, more direct answers. 'None' disables reasoning.",
      default: "none",
    },
    temperature: {
      type: "float",
      min: 0.0,
      max: 2.0,
      label: "Creativity Level",
      description: "Controls randomness: 0.0 = completely deterministic/focused, 1.0 = balanced creativity, 2.0 = highly creative. Only available when Thinking Depth is set to 'none'.",
      default: 1.0,
      dependsOn: {
        parameter: "reasoning_effort",
        value: "none",
        message: "Creativity Level is only available when Thinking Depth is set to 'none'"
      }
    },
  },
};

export const MODELS_CONFIG: Record<string, Array<string>> = {
  "gpt-5.5-sweden": ["responses"],
  "gpt-5.4": ["responses"],
  "gpt-5-nano": ["responses"],
  "gpt-5-mini": ["responses"],
  "gpt-5.1": ["responses"],
  "gpt-4.1": ["chat_completions"],
  "gpt-4o": ["chat_completions"],
};

export const DEFAULT_MODEL = "gpt-5.1";
export const DEFAULT_PROVIDER = "responses";

export type ProviderKey = keyof typeof PROVIDERS_CONFIG;
export type ModelKey = keyof typeof MODELS_CONFIG;

export function getCompatibleProviders(model: string): Array<string> {
  return MODELS_CONFIG[model];
}

export function getProviderParameters(provider: string, model?: string) {
  const baseParams = PROVIDERS_CONFIG[provider as ProviderKey];
  
  // Apply model-specific overrides if model is provided
  if (model) {
    const overrides = MODEL_PARAMETER_OVERRIDES[model];
    return {
      ...baseParams,
      ...overrides,
    };
  }
  
  return baseParams;
}

export function isValidProviderForModel(model: string, provider: string): boolean {
  const providers = getCompatibleProviders(model);
  return providers.includes(provider);
}

export function getDefaultProviderForModel(model: string): string {
  const providers = getCompatibleProviders(model);
  return providers.length > 0 ? providers[0] : DEFAULT_PROVIDER;
}
