/**
 * Model utility functions and display name mappings.
 * Isomorphic: safe to use in both server and client components.
 */

export const KNOWN_MODEL_NAMES: Record<string, string> = {
  'gemini-3.8-flash-high': 'Gemini 3.8 Flash High',
  'deepseek-v4-pro': 'DeepSeek V4 Pro',
  'deepseek-reasoner': 'DeepSeek R1 (Reasoner)',
  'deepseek-chat': 'DeepSeek V3 (Chat)',
  'gpt-5.5': 'GPT-5.5',
  'claude-opus-4.6': 'Claude Opus 4.6',
  'claude-sonnet-4.6': 'Claude Sonnet 4.6',
  'gpt-5.6-luna': 'GPT-5.6 Luna',
  'gpt-5.6-terra': 'GPT-5.6 Terra',
  'gpt-6-astra': 'GPT-6 Astra',
  'aidev-lite:free': 'Aidev Lite (Free)',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
  'claude-3-7-sonnet': 'Claude 3.7 Sonnet',
  'claude-3-opus': 'Claude 3 Opus',
  'claude-3-haiku': 'Claude 3 Haiku',
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
  'gemini-1.5-pro': 'Gemini 1.5 Pro',
  'gemini-1.5-flash': 'Gemini 1.5 Flash',
};

/**
 * Formats any model ID into a user-friendly, polished display name.
 * e.g. "deepseek-v4-pro" -> "DeepSeek V4 Pro"
 *      "gpt-5.5" -> "GPT-5.5"
 *      "claude-opus-4.6" -> "Claude Opus 4.6"
 */
export function formatModelDisplayName(id: string, customName?: string): string {
  if (customName && customName !== id && !customName.includes('-v') && customName !== customName.toLowerCase()) {
    return customName;
  }

  if (KNOWN_MODEL_NAMES[id]) {
    return KNOWN_MODEL_NAMES[id];
  }

  // Handle free tier or prefix
  let clean = id.includes('/') ? id.split('/').pop() || id : id;
  const isFree = clean.endsWith(':free');
  if (isFree) {
    clean = clean.replace(/:free$/, '');
  }

  const formatted = clean
    .split(/[-_]+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (/^v\d+/.test(lower)) return lower.toUpperCase(); // v4 -> V4
      if (lower === 'gpt') return 'GPT';
      if (lower === 'claude') return 'Claude';
      if (lower === 'gemini') return 'Gemini';
      if (lower === 'deepseek') return 'DeepSeek';
      if (lower === 'llama') return 'LLaMA';
      if (lower === 'qwen') return 'Qwen';
      if (lower === 'mistral') return 'Mistral';
      if (lower === 'pro') return 'Pro';
      if (lower === 'flash') return 'Flash';
      if (lower === 'high') return 'High';
      if (lower === 'lite') return 'Lite';
      if (lower === 'free') return 'Free';
      if (lower === 'plus') return 'Plus';
      if (lower === 'ultra') return 'Ultra';
      if (lower === 'reasoner') return 'Reasoner';
      if (/^\d+(\.\d+)*$/.test(word)) return word; // version numbers
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');

  return isFree ? `${formatted} (Free)` : formatted;
}

export interface BasicModelInfo {
  id: string;
  name?: string;
  eligible?: boolean;
  [key: string]: any;
}

/**
 * Resolves the best eligible model based on user preference and eligibility:
 * 1. If preferredModelId is explicitly eligible, keeps user preference.
 * 2. If preferredModelId is locked/ineligible (or not specified):
 *    a. Prefers eligible Gemini models.
 *    b. Prefers eligible Free/Lite models.
 *    c. Picks the first eligible model.
 *    d. Safe fallback if no eligible models are marked.
 */
export function resolveEligibleModel<T extends BasicModelInfo>(
  models: T[] = [],
  preferredModelId?: string,
  fallback = 'gemini-3.8-flash-high'
): string {
  if (!models || models.length === 0) {
    return preferredModelId || fallback;
  }

  // 1. If preferredModelId is present and eligible, keep it
  if (preferredModelId) {
    const preferred = models.find((m) => m.id === preferredModelId);
    if (preferred && preferred.eligible !== false) {
      return preferred.id;
    }
  }

  // Filter models that are eligible
  const eligibleModels = models.filter((m) => m.eligible !== false);
  if (eligibleModels.length === 0) {
    return preferredModelId || models[0]?.id || fallback;
  }

  // 2a. Priority: Eligible Gemini model
  const eligibleGemini = eligibleModels.find((m) => m.id.toLowerCase().includes('gemini'));
  if (eligibleGemini) {
    return eligibleGemini.id;
  }

  // 2b. Priority: Eligible Free / Lite model
  const eligibleFree = eligibleModels.find(
    (m) => m.id.toLowerCase().includes('free') || m.id.toLowerCase().includes('lite')
  );
  if (eligibleFree) {
    return eligibleFree.id;
  }

  // 2c. First eligible model in the list
  return eligibleModels[0].id;
}
