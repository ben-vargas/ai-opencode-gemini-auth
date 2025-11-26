const GEMINI_PREVIEW_LINK = "https://goo.gle/enable-preview-features";

export interface GeminiApiError {
  code?: number;
  message?: string;
  status?: string;
  [key: string]: unknown;
}

/**
 * Minimal representation of Gemini API responses we touch.
 */
export interface GeminiApiBody {
  response?: unknown;
  error?: GeminiApiError;
  [key: string]: unknown;
}

/**
 * Usage metadata exposed by Gemini responses. Fields are optional to reflect partial payloads.
 */
export interface GeminiUsageMetadata {
  totalTokenCount?: number;
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
}

/**
 * Valid thinking levels for Gemini 3+ models.
 * - "low": Basic tasks (classification, Q&A, chat) - lower latency, lower cost
 * - "high": Complex reasoning tasks - more careful, thorough analysis (default)
 */
export type ThinkingLevel = "low" | "high";

/**
 * Normalized thinking configuration accepted by Gemini.
 *
 * For Gemini 2.5: Uses thinkingBudget (numeric token count)
 * For Gemini 3+: Uses thinkingLevel ("low" | "high")
 *
 * Note: thinkingBudget and thinkingLevel are mutually exclusive.
 * Using both in the same request will cause a 400 error from Gemini API.
 */
export interface ThinkingConfig {
  thinkingBudget?: number;
  thinkingLevel?: ThinkingLevel;
  includeThoughts?: boolean;
}

/**
 * Maps OpenAI reasoning_effort values to Gemini thinking_level.
 * - "low" → "low"
 * - "medium" → "high" (OpenAI medium maps to Gemini high per Google docs)
 * - "high" → "high"
 */
function mapReasoningEffortToThinkingLevel(effort: string): ThinkingLevel | undefined {
  const normalized = effort.toLowerCase();
  if (normalized === "low") {
    return "low";
  }
  if (normalized === "medium" || normalized === "high") {
    return "high";
  }
  return undefined;
}

/**
 * Validates and returns a ThinkingLevel value if valid.
 */
function parseThinkingLevel(value: unknown): ThinkingLevel | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (normalized === "low" || normalized === "high") {
    return normalized;
  }
  return undefined;
}

/**
 * Normalizes thinking configuration for Gemini API compatibility.
 *
 * Handles both Gemini 2.5 (thinkingBudget) and Gemini 3+ (thinkingLevel) configurations.
 * Also maps OpenAI's reasoning_effort to Gemini's thinking_level for compatibility.
 *
 * Key rules:
 * - thinkingBudget and thinkingLevel are mutually exclusive (API returns 400 if both set)
 * - thinkingLevel takes precedence if both are provided (for Gemini 3+ compatibility)
 * - includeThoughts only valid when thinking is enabled (budget > 0 or level set)
 * - reasoning_effort is mapped: "low" → "low", "medium"/"high" → "high"
 */
export function normalizeThinkingConfig(config: unknown): ThinkingConfig | undefined {
  if (!config || typeof config !== "object") {
    return undefined;
  }

  const record = config as Record<string, unknown>;

  // Extract thinkingLevel from various sources (Gemini native)
  const levelRaw = record.thinkingLevel ?? record.thinking_level;

  // Extract reasoning_effort (OpenAI compatibility)
  const effortRaw = record.reasoningEffort ?? record.reasoning_effort;

  // Extract thinkingBudget (Gemini 2.5 style)
  const budgetRaw = record.thinkingBudget ?? record.thinking_budget;

  // Extract includeThoughts
  const includeRaw = record.includeThoughts ?? record.include_thoughts;

  // Parse thinking level - try native level first, then mapped effort
  let thinkingLevel: ThinkingLevel | undefined = parseThinkingLevel(levelRaw);
  if (!thinkingLevel && typeof effortRaw === "string") {
    thinkingLevel = mapReasoningEffortToThinkingLevel(effortRaw);
  }

  // Parse thinking budget (only used if no level is set)
  const thinkingBudget =
    typeof budgetRaw === "number" && Number.isFinite(budgetRaw) ? budgetRaw : undefined;

  // Parse includeThoughts
  const includeThoughts = typeof includeRaw === "boolean" ? includeRaw : undefined;

  // Determine if thinking is enabled
  const enableThinkingByLevel = thinkingLevel !== undefined;
  const enableThinkingByBudget = thinkingBudget !== undefined && thinkingBudget > 0;
  const enableThinking = enableThinkingByLevel || enableThinkingByBudget;

  // includeThoughts only valid when thinking is enabled
  const finalInclude = enableThinking ? includeThoughts ?? false : false;

  // Return undefined if nothing meaningful to configure
  if (
    !enableThinking &&
    finalInclude === false &&
    thinkingLevel === undefined &&
    thinkingBudget === undefined &&
    includeThoughts === undefined
  ) {
    return undefined;
  }

  // Build normalized config - thinkingLevel takes precedence (mutually exclusive)
  const normalized: ThinkingConfig = {};

  if (thinkingLevel !== undefined) {
    // Gemini 3+ style: use thinkingLevel, omit thinkingBudget
    normalized.thinkingLevel = thinkingLevel;
  } else if (thinkingBudget !== undefined) {
    // Gemini 2.5 style: use thinkingBudget
    normalized.thinkingBudget = thinkingBudget;
  }

  if (finalInclude !== undefined) {
    normalized.includeThoughts = finalInclude;
  }

  return normalized;
}

/**
 * Parses a Gemini API body; handles array-wrapped responses the API sometimes returns.
 */
export function parseGeminiApiBody(rawText: string): GeminiApiBody | null {
  try {
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) {
      const firstObject = parsed.find((item: unknown) => typeof item === "object" && item !== null);
      if (firstObject && typeof firstObject === "object") {
        return firstObject as GeminiApiBody;
      }
      return null;
    }

    if (parsed && typeof parsed === "object") {
      return parsed as GeminiApiBody;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts usageMetadata from a response object, guarding types.
 */
export function extractUsageMetadata(body: GeminiApiBody): GeminiUsageMetadata | null {
  const usage = (body.response && typeof body.response === "object"
    ? (body.response as { usageMetadata?: unknown }).usageMetadata
    : undefined) as GeminiUsageMetadata | undefined;

  if (!usage || typeof usage !== "object") {
    return null;
  }

  const asRecord = usage as Record<string, unknown>;
  const toNumber = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;

  return {
    totalTokenCount: toNumber(asRecord.totalTokenCount),
    promptTokenCount: toNumber(asRecord.promptTokenCount),
    candidatesTokenCount: toNumber(asRecord.candidatesTokenCount),
    cachedContentTokenCount: toNumber(asRecord.cachedContentTokenCount),
  };
}

/**
 * Walks SSE lines to find a usage-bearing response chunk.
 */
export function extractUsageFromSsePayload(payload: string): GeminiUsageMetadata | null {
  const lines = payload.split("\n");
  for (const line of lines) {
    if (!line.startsWith("data:")) {
      continue;
    }
    const jsonText = line.slice(5).trim();
    if (!jsonText) {
      continue;
    }
    try {
      const parsed = JSON.parse(jsonText);
      if (parsed && typeof parsed === "object") {
        const usage = extractUsageMetadata({ response: (parsed as Record<string, unknown>).response });
        if (usage) {
          return usage;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Enhances 404 errors for Gemini 3 models with a direct preview-access message.
 */
export function rewriteGeminiPreviewAccessError(
  body: GeminiApiBody,
  status: number,
  requestedModel?: string,
): GeminiApiBody | null {
  if (!needsPreviewAccessOverride(status, body, requestedModel)) {
    return null;
  }

  const error: GeminiApiError = body.error ?? {};
  const trimmedMessage = typeof error.message === "string" ? error.message.trim() : "";
  const messagePrefix = trimmedMessage.length > 0
    ? trimmedMessage
    : "Gemini 3 preview features are not enabled for this account.";
  const enhancedMessage = `${messagePrefix} Request preview access at ${GEMINI_PREVIEW_LINK} before using Gemini 3 models.`;

  return {
    ...body,
    error: {
      ...error,
      message: enhancedMessage,
    },
  };
}

function needsPreviewAccessOverride(
  status: number,
  body: GeminiApiBody,
  requestedModel?: string,
): boolean {
  if (status !== 404) {
    return false;
  }

  if (isGeminiThreeModel(requestedModel)) {
    return true;
  }

  const errorMessage = typeof body.error?.message === "string" ? body.error.message : "";
  return isGeminiThreeModel(errorMessage);
}

function isGeminiThreeModel(target?: string): boolean {
  if (!target) {
    return false;
  }

  return /gemini[\s-]?3/i.test(target);
}
