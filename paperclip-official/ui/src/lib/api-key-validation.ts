/**
 * API Key format validation for adapter-specific keys.
 * Used to require correctly formatted keys before proceeding in onboarding and agent forms.
 */

/** Env key name per adapter type for remote (API) adapters only. */
export const API_KEY_ENV_BY_ADAPTER: Record<string, string> = {
  claude_remote: "ANTHROPIC_API_KEY",
  codex_remote: "OPENAI_API_KEY",
  gemini_remote: "GEMINI_API_KEY",
};

/** Optional second env key (e.g. Gemini can use GOOGLE_API_KEY) */
export const API_KEY_ENV_ALT_BY_ADAPTER: Record<string, string | undefined> = {
  gemini_remote: "GOOGLE_API_KEY",
};

/**
 * Validates API key format for the given adapter type.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateApiKeyFormat(
  adapterType: string,
  value: string
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null; // empty is handled separately (required check)

  switch (adapterType) {
    case "claude_remote": {
      // Anthropic: sk-ant- + 32–128 alphanumeric/underscore/hyphen
      if (!/^sk-ant-[A-Za-z0-9_\-]{32,128}$/.test(trimmed)) {
        return "ANTHROPIC_API_KEY should start with sk-ant- followed by 32–128 characters (letters, numbers, _ or -).";
      }
      return null;
    }
    case "codex_remote": {
      // OpenAI-style: sk- + alphanumeric, typically 20+ chars
      if (!/^sk-[A-Za-z0-9]{20,}$/.test(trimmed)) {
        return "OPENAI_API_KEY should start with sk- followed by at least 20 alphanumeric characters.";
      }
      return null;
    }
    case "gemini_remote": {
      // Google AI Studio: often AIzaSy... (≈39 chars) or similar
      if (trimmed.length < 20) {
        return "GEMINI_API_KEY should be at least 20 characters.";
      }
      if (!/^[A-Za-z0-9_\-]+$/.test(trimmed)) {
        return "GEMINI_API_KEY should contain only letters, numbers, hyphens and underscores.";
      }
      return null;
    }
    default:
      return null;
  }
}

/** Returns true if the adapter type is remote (API) and requires API Key input. */
export function adapterRequiresApiKeyInput(adapterType: string): boolean {
  return adapterType === "claude_remote" || adapterType === "codex_remote" || adapterType === "gemini_remote";
}
