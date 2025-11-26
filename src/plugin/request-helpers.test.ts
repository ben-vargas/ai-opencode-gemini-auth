import { describe, expect, it } from "bun:test";

import { normalizeThinkingConfig, type ThinkingConfig } from "./request-helpers";

describe("normalizeThinkingConfig", () => {
  describe("returns undefined for invalid input", () => {
    it("returns undefined for null", () => {
      expect(normalizeThinkingConfig(null)).toBeUndefined();
    });

    it("returns undefined for undefined", () => {
      expect(normalizeThinkingConfig(undefined)).toBeUndefined();
    });

    it("returns undefined for non-object", () => {
      expect(normalizeThinkingConfig("string")).toBeUndefined();
      expect(normalizeThinkingConfig(123)).toBeUndefined();
      expect(normalizeThinkingConfig(true)).toBeUndefined();
    });

    it("returns undefined for empty object", () => {
      expect(normalizeThinkingConfig({})).toBeUndefined();
    });
  });

  describe("Gemini 2.5 style (thinkingBudget)", () => {
    it("normalizes camelCase thinkingBudget", () => {
      const result = normalizeThinkingConfig({ thinkingBudget: 1024 });
      expect(result).toEqual({ thinkingBudget: 1024, includeThoughts: false });
    });

    it("normalizes snake_case thinking_budget", () => {
      const result = normalizeThinkingConfig({ thinking_budget: 2048 });
      expect(result).toEqual({ thinkingBudget: 2048, includeThoughts: false });
    });

    it("preserves includeThoughts when budget > 0", () => {
      const result = normalizeThinkingConfig({ thinkingBudget: 1024, includeThoughts: true });
      expect(result).toEqual({ thinkingBudget: 1024, includeThoughts: true });
    });

    it("ignores includeThoughts when budget is 0", () => {
      const result = normalizeThinkingConfig({ thinkingBudget: 0, includeThoughts: true });
      expect(result).toEqual({ thinkingBudget: 0, includeThoughts: false });
    });

    it("ignores non-finite budget values", () => {
      expect(normalizeThinkingConfig({ thinkingBudget: Infinity })).toBeUndefined();
      expect(normalizeThinkingConfig({ thinkingBudget: NaN })).toBeUndefined();
      expect(normalizeThinkingConfig({ thinkingBudget: "1024" })).toBeUndefined();
    });
  });

  describe("Gemini 3+ style (thinkingLevel)", () => {
    it("normalizes camelCase thinkingLevel 'low'", () => {
      const result = normalizeThinkingConfig({ thinkingLevel: "low" });
      expect(result).toEqual({ thinkingLevel: "low", includeThoughts: false });
    });

    it("normalizes camelCase thinkingLevel 'high'", () => {
      const result = normalizeThinkingConfig({ thinkingLevel: "high" });
      expect(result).toEqual({ thinkingLevel: "high", includeThoughts: false });
    });

    it("normalizes snake_case thinking_level", () => {
      const result = normalizeThinkingConfig({ thinking_level: "high" });
      expect(result).toEqual({ thinkingLevel: "high", includeThoughts: false });
    });

    it("handles case-insensitive level values", () => {
      expect(normalizeThinkingConfig({ thinkingLevel: "LOW" })).toEqual({
        thinkingLevel: "low",
        includeThoughts: false,
      });
      expect(normalizeThinkingConfig({ thinkingLevel: "HIGH" })).toEqual({
        thinkingLevel: "high",
        includeThoughts: false,
      });
      expect(normalizeThinkingConfig({ thinkingLevel: "High" })).toEqual({
        thinkingLevel: "high",
        includeThoughts: false,
      });
    });

    it("preserves includeThoughts with thinkingLevel", () => {
      const result = normalizeThinkingConfig({ thinkingLevel: "high", includeThoughts: true });
      expect(result).toEqual({ thinkingLevel: "high", includeThoughts: true });
    });

    it("ignores invalid thinkingLevel values", () => {
      expect(normalizeThinkingConfig({ thinkingLevel: "medium" })).toBeUndefined();
      expect(normalizeThinkingConfig({ thinkingLevel: "invalid" })).toBeUndefined();
      expect(normalizeThinkingConfig({ thinkingLevel: 123 })).toBeUndefined();
    });
  });

  describe("OpenAI compatibility (reasoning_effort)", () => {
    it("maps reasoning_effort 'low' to thinkingLevel 'low'", () => {
      const result = normalizeThinkingConfig({ reasoning_effort: "low" });
      expect(result).toEqual({ thinkingLevel: "low", includeThoughts: false });
    });

    it("maps reasoning_effort 'medium' to thinkingLevel 'high'", () => {
      const result = normalizeThinkingConfig({ reasoning_effort: "medium" });
      expect(result).toEqual({ thinkingLevel: "high", includeThoughts: false });
    });

    it("maps reasoning_effort 'high' to thinkingLevel 'high'", () => {
      const result = normalizeThinkingConfig({ reasoning_effort: "high" });
      expect(result).toEqual({ thinkingLevel: "high", includeThoughts: false });
    });

    it("handles camelCase reasoningEffort", () => {
      const result = normalizeThinkingConfig({ reasoningEffort: "medium" });
      expect(result).toEqual({ thinkingLevel: "high", includeThoughts: false });
    });

    it("handles case-insensitive reasoning_effort values", () => {
      expect(normalizeThinkingConfig({ reasoning_effort: "LOW" })).toEqual({
        thinkingLevel: "low",
        includeThoughts: false,
      });
      expect(normalizeThinkingConfig({ reasoning_effort: "MEDIUM" })).toEqual({
        thinkingLevel: "high",
        includeThoughts: false,
      });
    });

    it("ignores invalid reasoning_effort values", () => {
      expect(normalizeThinkingConfig({ reasoning_effort: "invalid" })).toBeUndefined();
      expect(normalizeThinkingConfig({ reasoning_effort: 123 })).toBeUndefined();
    });
  });

  describe("mutual exclusivity (thinkingLevel takes precedence)", () => {
    it("prefers thinkingLevel over thinkingBudget when both provided", () => {
      const result = normalizeThinkingConfig({ thinkingLevel: "low", thinkingBudget: 1024 });
      expect(result).toEqual({ thinkingLevel: "low", includeThoughts: false });
      expect(result?.thinkingBudget).toBeUndefined();
    });

    it("prefers thinkingLevel over reasoning_effort", () => {
      const result = normalizeThinkingConfig({ thinkingLevel: "low", reasoning_effort: "high" });
      expect(result).toEqual({ thinkingLevel: "low", includeThoughts: false });
    });

    it("uses reasoning_effort when thinkingLevel is invalid", () => {
      const result = normalizeThinkingConfig({
        thinkingLevel: "invalid",
        reasoning_effort: "medium",
      });
      expect(result).toEqual({ thinkingLevel: "high", includeThoughts: false });
    });

    it("falls back to thinkingBudget when thinkingLevel and reasoning_effort are invalid", () => {
      const result = normalizeThinkingConfig({
        thinkingLevel: "invalid",
        reasoning_effort: "invalid",
        thinkingBudget: 512,
      });
      expect(result).toEqual({ thinkingBudget: 512, includeThoughts: false });
    });
  });

  describe("includeThoughts handling", () => {
    it("handles snake_case include_thoughts", () => {
      const result = normalizeThinkingConfig({ thinkingLevel: "high", include_thoughts: true });
      expect(result).toEqual({ thinkingLevel: "high", includeThoughts: true });
    });

    it("defaults includeThoughts to false when thinking enabled", () => {
      const result = normalizeThinkingConfig({ thinkingLevel: "high" });
      expect(result?.includeThoughts).toBe(false);
    });

    it("ignores non-boolean includeThoughts values", () => {
      const result = normalizeThinkingConfig({
        thinkingLevel: "high",
        includeThoughts: "true" as unknown as boolean,
      });
      expect(result?.includeThoughts).toBe(false);
    });
  });
});
