import OpenAI from 'openai';
import fs from 'fs';
import { loadSettings, getStoragePaths, ensureStorageInitialized } from './storage';
import { formatModelDisplayName } from './model-utils';

export interface GatewayModel {
  id: string;
  name?: string;
  owned_by?: string;
  created?: number;
  releaseDate?: string;
  isNew?: boolean;
  context_length?: number;
  max_completion_tokens?: number;
  eligible?: boolean;
  minTier?: string;
  minTierName?: string;
  minTierBadgeColor?: string;
  reason?: string;
  capabilities?: {
    contextWindow?: number;
    maxOutput?: number;
    reasoning?: boolean;
    thinkingCanDisable?: boolean;
    thinkingFormat?: string;
    tools?: boolean;
    vision?: boolean;
    search?: boolean;
    [key: string]: any;
  };
}

export interface ModelCacheEntry {
  timestamp: number;
  models: GatewayModel[];
  userTier?: any;
  user?: any;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache (instant local reloads)

export function getOpenAIClient(): OpenAI {
  const settings = loadSettings();
  return new OpenAI({
    baseURL: settings.gatewayUrl,
    apiKey: settings.apiKey || process.env.AIDEV_GATEWAY_KEY || 'sk-int-testbench999900001111222233334444',
  });
}

/**
 * Fetches user subscription tier & model eligibility from /v1/eligibility.
 */
export async function getUserEligibility(): Promise<{
  user?: any;
  tier?: any;
  models: GatewayModel[];
} | null> {
  const settings = loadSettings();
  const rawKey = settings.apiKey || process.env.AIDEV_GATEWAY_KEY || 'sk-int-testbench999900001111222233334444';
  try {
    const baseUrl = settings.gatewayUrl.replace(/\/+$/, '');
    const res = await fetch(`${baseUrl}/eligibility`, {
      headers: {
        Authorization: `Bearer ${rawKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err: any) {
    const isConnRefused = err?.cause?.code === 'ECONNREFUSED' || err?.code === 'ECONNREFUSED';
    if (isConnRefused) {
      console.warn(`[Gateway] Gateway at ${settings.gatewayUrl} is offline/unreachable (ECONNREFUSED). Using local model fallback.`);
    } else {
      console.warn(`[Gateway] Failed fetching user eligibility: ${err?.message || err}`);
    }
  }
  return null;
}

export interface UserUsageData {
  mode?: 'gateway' | 'byok';
  tier: {
    id: string;
    name: string;
    badgeColor: string;
    expiresAt?: string | null;
  };
  credits: {
    balance: number;
    allocated: number;
    remaining: number;
    used: number;
    purchased: number;
    percentageUsed: number;
  };
  requestsToday: number;
  user: {
    id: string;
    name?: string;
    email?: string;
    image?: string | null;
    role: string;
  };
  byokInfo?: {
    host: string;
    providerName: string;
    dashboardUrl?: string;
  };
}

/**
 * Parses upstream provider info when connected directly to a third-party or BYOK endpoint.
 */
function parseByokInfo(gatewayUrlStr: string): { host: string; providerName: string; dashboardUrl?: string } {
  try {
    const url = new URL(gatewayUrlStr);
    const host = url.hostname.toLowerCase();
    let providerName = 'Custom Direct API';
    let dashboardUrl: string | undefined = undefined;

    if (host.includes('deepseek.com')) {
      providerName = 'DeepSeek Direct';
      dashboardUrl = 'https://platform.deepseek.com';
    } else if (host.includes('openai.com')) {
      providerName = 'OpenAI Direct';
      dashboardUrl = 'https://platform.openai.com/usage';
    } else if (host.includes('anthropic.com')) {
      providerName = 'Anthropic Direct';
      dashboardUrl = 'https://console.anthropic.com/settings/billing';
    } else if (host.includes('openrouter.ai')) {
      providerName = 'OpenRouter Direct';
      dashboardUrl = 'https://openrouter.ai/credits';
    } else if (host.includes('groq.com')) {
      providerName = 'Groq Cloud';
      dashboardUrl = 'https://console.groq.com';
    } else if (host.includes('ollama')) {
      providerName = 'Ollama Cloud / Direct';
      dashboardUrl = 'https://ollama.com';
    } else if (host === 'localhost' || host === '127.0.0.1') {
      providerName = `Local Endpoint (${url.port || '80'})`;
    } else {
      providerName = host;
    }

    return {
      host: url.origin,
      providerName,
      dashboardUrl,
    };
  } catch {
    return {
      host: gatewayUrlStr,
      providerName: 'Custom Endpoint',
    };
  }
}

export async function getUserUsage(): Promise<UserUsageData | null> {
  const settings = loadSettings();
  const rawKey = settings.apiKey || process.env.AIDEV_GATEWAY_KEY || '';
  const gatewayUrl = settings.gatewayUrl || 'https://aidev.weebinhub.biz.id/v1';

  // 1. Attempt to fetch live usage from Aidev Gateway
  try {
    const baseUrl = gatewayUrl.replace(/\/+$/, '');
    const res = await fetch(`${baseUrl}/usage`, {
      headers: {
        Authorization: `Bearer ${rawKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return {
        ...data,
        mode: 'gateway',
      };
    }
  } catch (err) {
    // Gateway endpoint may be offline or non-existent
  }

  // 2. Check if user is pointing to a direct upstream / BYOK provider
  const isAidev =
    gatewayUrl.includes('localhost:3000') ||
    gatewayUrl.includes('127.0.0.1:3000') ||
    gatewayUrl.includes('aidev');

  // If pointing to a direct third-party or custom proxy without /usage endpoint
  if (!isAidev) {
    const byok = parseByokInfo(gatewayUrl);
    return {
      mode: 'byok',
      tier: {
        id: 'BYOK',
        name: 'Direct API',
        badgeColor: 'gray',
      },
      credits: {
        balance: 0,
        allocated: 0,
        remaining: 0,
        used: 0,
        purchased: 0,
        percentageUsed: 0,
      },
      requestsToday: 0,
      user: {
        id: 'byok',
        name: byok.providerName,
        email: byok.host,
        role: 'DIRECT_API',
      },
      byokInfo: byok,
    };
  }

  return null;
}

/**
 * Universal exclusion filter for non-chat / non-generative models.
 * Excludes embeddings, audio to text, text to speech, image generation, and moderations.
 * Works universally across OpenAI, DeepSeek, Groq, Ollama, OpenRouter, vLLM, etc.
 */
export function isGenerativeChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  const nonChatKeywords = [
    'embedding',
    'whisper',
    'transcribe',
    'tts',
    'moderation',
    'dall-e',
    'image',
    'babbage',
    'davinci',
    'curie',
    'canary',
    'realtime',
    'audio',
  ];
  return !nonChatKeywords.some((keyword) => lower.includes(keyword));
}

/**
 * Sorts models prioritizing newest releases first when timestamps are present,
 * while keeping canonical models clean over dated snapshot versions.
 */
export function sortModelsByRelevance(models: GatewayModel[]): GatewayModel[] {
  const hasTimestamps = models.some((m) => m.created && m.created > 0);

  if (hasTimestamps) {
    return models.sort((a, b) => {
      const timeA = a.created || 0;
      const timeB = b.created || 0;
      const isSnapshotA = /\d{4}-\d{2}-\d{2}/.test(a.id);
      const isSnapshotB = /\d{4}-\d{2}-\d{2}/.test(b.id);

      // If one is canonical and one is snapshot of same family within 3 days, prefer canonical
      if (!isSnapshotA && isSnapshotB && Math.abs(timeA - timeB) < 86400 * 3) return -1;
      if (isSnapshotA && !isSnapshotB && Math.abs(timeA - timeB) < 86400 * 3) return 1;

      // Newest released models first
      if (timeA !== timeB) return timeB - timeA;

      return a.id.localeCompare(b.id);
    });
  }

  const priorityPatterns = [
    'gpt-4o',
    'gpt-4o-mini',
    'o1',
    'o3-mini',
    'deepseek-reasoner',
    'deepseek-chat',
    'claude-3-7-sonnet',
    'claude-3-5-sonnet',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'qwen2.5-coder',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
  ];

  return models.sort((a, b) => {
    const idxA = priorityPatterns.findIndex((p) => a.id === p || a.id.startsWith(p));
    const idxB = priorityPatterns.findIndex((p) => b.id === p || b.id.startsWith(p));
    if (idxA !== -1 && idxB !== -1) {
      if (idxA !== idxB) return idxA - idxB;
    } else if (idxA !== -1) {
      return -1;
    } else if (idxB !== -1) {
      return 1;
    }

    // Prefer non-snapshot models (e.g. "gpt-4o" over "gpt-4o-2024-05-13")
    const isSnapshotA = /\d{4}-\d{2}-\d{2}/.test(a.id);
    const isSnapshotB = /\d{4}-\d{2}-\d{2}/.test(b.id);
    if (!isSnapshotA && isSnapshotB) return -1;
    if (isSnapshotA && !isSnapshotB) return 1;

    return a.id.localeCompare(b.id);
  });
}

/**
 * Dynamically fetches the list of available models from the Aidev AI Gateway (/v1/eligibility or /v1/models).
 * Caches the results to $USERPROFILE/.aidev/cache/models.json with a 10-minute TTL.
 */
export async function getAvailableModels(forceRefresh = false): Promise<GatewayModel[]> {
  ensureStorageInitialized();
  const { modelsCache } = getStoragePaths();

  if (!forceRefresh && fs.existsSync(modelsCache)) {
    try {
      const raw = fs.readFileSync(modelsCache, 'utf-8');
      const cache: ModelCacheEntry = JSON.parse(raw);
      if (Date.now() - cache.timestamp < CACHE_TTL_MS && cache.models.length > 0) {
        return cache.models;
      }
    } catch {
      // Fall through to live fetch
    }
  }

  const settings = loadSettings();
  const isAidevGateway =
    !settings.gatewayUrl ||
    settings.gatewayUrl.includes('localhost:3000') ||
    settings.gatewayUrl.includes('127.0.0.1:3000') ||
    settings.gatewayUrl.includes('aidev');

  // 1. First try /v1/eligibility only when connecting to the Aidev AI Gateway
  if (isAidevGateway) {
    try {
      const eligData = await getUserEligibility();
      if (eligData && Array.isArray(eligData.models) && eligData.models.length > 0) {
        const models: GatewayModel[] = eligData.models.map((m: any) => ({
          id: m.id,
          name: formatModelDisplayName(m.id, m.name),
          owned_by: m.owned_by,
          eligible: m.eligible !== false,
          minTier: m.minTier || 'FREE',
          minTierName: m.minTierName || 'Free',
          minTierBadgeColor: m.minTierBadgeColor || 'gray',
          reason: m.reason,
          context_length: getModelContextWindow(m.id),
        }));

        const cacheEntry: ModelCacheEntry = {
          timestamp: Date.now(),
          models,
          userTier: eligData.tier,
          user: eligData.user,
        };
        try {
          fs.writeFileSync(modelsCache, JSON.stringify(cacheEntry, null, 2), 'utf-8');
        } catch {}

        return models;
      }
    } catch (eligErr: any) {
      const isConnRefused = eligErr?.cause?.code === 'ECONNREFUSED' || eligErr?.code === 'ECONNREFUSED';
      if (!isConnRefused) {
        console.warn('Could not query /v1/eligibility, falling back to /v1/models:', eligErr?.message || eligErr);
      }
    }
  }

  // 2. Fallback to standard OpenAI models.list()
  const client = getOpenAIClient();
  try {
    const list = await client.models.list();
    const models: GatewayModel[] = [];

    for await (const model of list) {
      if (!isGenerativeChatModel(model.id)) {
        continue;
      }
      const anyModel = model as any;
      const createdTime = model.created;
      let releaseDate: string | undefined = undefined;
      let isNew = false;

      if (createdTime && createdTime > 0) {
        const d = new Date(createdTime * 1000);
        releaseDate = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const ageDays = (Date.now() - createdTime * 1000) / (1000 * 60 * 60 * 24);
        if (ageDays <= 180 || d.getFullYear() >= 2026) {
          isNew = true;
        }
      }

      models.push({
        id: model.id,
        name: formatModelDisplayName(model.id, anyModel.name),
        owned_by: model.owned_by,
        created: model.created,
        releaseDate,
        isNew,
        context_length: anyModel.context_length || anyModel.capabilities?.contextWindow || getModelContextWindow(model.id),
        max_completion_tokens: anyModel.max_completion_tokens || anyModel.capabilities?.maxOutput,
        capabilities: anyModel.capabilities,
        eligible: true,
        minTier: 'FREE',
        minTierName: 'Free',
      });
    }

    const sortedModels = sortModelsByRelevance(models);

    if (sortedModels.length === 0) {
      sortedModels.push(
        { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', context_length: 64000, eligible: true, minTier: 'FREE', minTierName: 'Free' },
        { id: 'gpt-4o', name: 'GPT-4o', context_length: 128000, eligible: true, minTier: 'PRO', minTierName: 'Pro' },
        { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', context_length: 200000, eligible: true, minTier: 'PRO', minTierName: 'Pro' }
      );
    }

    // Save to cache
    const cacheEntry: ModelCacheEntry = {
      timestamp: Date.now(),
      models: sortedModels,
    };
    try {
      fs.writeFileSync(modelsCache, JSON.stringify(cacheEntry, null, 2), 'utf-8');
    } catch {}

    return sortedModels;
  } catch (error: any) {
    // If gateway is unreachable, check if we have expired cache
    if (fs.existsSync(modelsCache)) {
      try {
        const raw = fs.readFileSync(modelsCache, 'utf-8');
        const cache: ModelCacheEntry = JSON.parse(raw);
        if (cache.models.length > 0) return cache.models;
      } catch {
        // ignore
      }
    }

    // Default fallback models from gateway kita (public combos only)
    return [
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', context_length: 1000000, eligible: true, minTier: 'FREE', minTierName: 'Free', minTierBadgeColor: 'gray' },
      { id: 'gpt-5.5', name: 'GPT-5.5', context_length: 400000, eligible: false, minTier: 'PLUS', minTierName: 'Plus', minTierBadgeColor: 'blue' },
      { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash High', context_length: 1000000, eligible: false, minTier: 'PRO', minTierName: 'Pro', minTierBadgeColor: 'purple' },
      { id: 'claude-opus-4.6', name: 'Claude Opus 4.6', context_length: 200000, eligible: false, minTier: 'ULTRA', minTierName: 'Ultra', minTierBadgeColor: 'amber' },
      { id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', context_length: 200000, eligible: false, minTier: 'ULTRA', minTierName: 'Ultra', minTierBadgeColor: 'amber' },
      { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', context_length: 400000, eligible: false, minTier: 'ULTRA', minTierName: 'Ultra', minTierBadgeColor: 'amber' },
      { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', context_length: 400000, eligible: false, minTier: 'ULTRA', minTierName: 'Ultra', minTierBadgeColor: 'amber' },
      { id: 'aidev-lite:free', name: 'Aidev Lite (Free)', context_length: 128000, eligible: true, minTier: 'FREE', minTierName: 'Free', minTierBadgeColor: 'gray' },
    ];
  }
}

/**
 * Resolves the context window length for a given model ID.
 * Reads from cache, known models catalog, or fallback default (128,000).
 */
export function getModelContextWindow(modelId: string): number {
  if (!modelId) return 128000;

  try {
    const { modelsCache } = getStoragePaths();
    if (fs.existsSync(modelsCache)) {
      const raw = fs.readFileSync(modelsCache, 'utf-8');
      const cache: ModelCacheEntry = JSON.parse(raw);
      const found = cache.models?.find((m) => m.id === modelId);
      if (found) {
        if (found.context_length && found.context_length > 0) return found.context_length;
        if (found.capabilities?.contextWindow && found.capabilities.contextWindow > 0) return found.capabilities.contextWindow;
      }
    }
  } catch {}

  const knownWindows: Record<string, number> = {
    'gemini-3.8-flash-high': 1000000,
    'deepseek-v4-pro': 1000000,
    'claude-opus-4.6': 200000,
    'claude-sonnet-4.6': 200000,
    'gpt-6-astra': 1000000,
    'gpt-5.5': 400000,
    'gpt-5.6-luna': 400000,
    'gpt-5.6-terra': 400000,
    'aidev-lite:free': 128000,
    'gpt-4o': 128000,
    'claude-3-7-sonnet': 200000,
    'deepseek-reasoner': 64000,
  };

  if (knownWindows[modelId]) {
    return knownWindows[modelId];
  }

  if (modelId.includes('claude')) {
    return 200000;
  }
  if (modelId.includes('gemini') || modelId.includes('deepseek')) {
    return 1000000;
  }
  if (modelId.includes('gpt-5')) {
    return 400000;
  }

  return 128000;
}
