/**
 * Configuration settings and default model identifiers for AI services.
 */
export const DEFAULT_AI_MODEL =
  process.env.NEXT_PUBLIC_GEMINI_MODEL ||
  process.env.GEMINI_MODEL ||
  'gemini-3.8-flash';

export interface AIConfig {
  defaultModel: string;
}

export const aiConfig: AIConfig = {
  defaultModel: DEFAULT_AI_MODEL,
};
