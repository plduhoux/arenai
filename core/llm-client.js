/**
 * Core LLM Client - Multi-provider
 * Supports Anthropic, OpenAI, Google, xAI, Moonshot.
 * Game plugins use askLLM() to get player decisions.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getSession, addUserMessage, addAssistantMessage, trackSessionTokens } from './session-manager.js';

// --- Fatal errors (no retry, stop game immediately) ---

export class FatalLLMError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FatalLLMError';
    this.fatal = true;
  }
}

const FATAL_STATUS_CODES = [401, 403];

function isFatalError(err) {
  if (err instanceof FatalLLMError) return true;
  if (err.fatal) return true;
  const msg = err.message || '';
  return FATAL_STATUS_CODES.some(code => msg.includes(`(${code})`)) ||
    /authentication_error|invalid.*api.key|no.*api.*key.*configured/i.test(msg);
}

// --- Provider detection ---

function getProviderForModel(model) {
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) return 'openai';
  if (model.startsWith('gemini')) return 'google';
  if (model.startsWith('grok')) return 'xai';
  if (model.startsWith('kimi')) return 'moonshot';
  return 'anthropic'; // fallback
}

// OpenAI-compatible base URLs
const PROVIDER_URLS = {
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  xai: 'https://api.x.ai/v1',
  moonshot: 'https://api.moonshot.cn/v1',
};

// --- Client cache ---
const clients = new Map();

function isAnthropicOAuthToken(key) {
  return typeof key === 'string' && key.includes('sk-ant-oat');
}

function getAnthropicClient(apiKey) {
  const key = `anthropic:${apiKey?.slice(-8) || 'default'}`;
  if (clients.has(key)) return clients.get(key);
  
  let client;
  if (isAnthropicOAuthToken(apiKey)) {
    // OAuth tokens (sk-ant-oat...) need authToken + Bearer auth, not x-api-key
    client = new Anthropic({
      apiKey: null,
      authToken: apiKey,
      dangerouslyAllowBrowser: true,
      defaultHeaders: {
        'anthropic-beta': 'oauth-2025-04-20',
      },
    });
  } else {
    client = new Anthropic({ apiKey });
  }
  
  clients.set(key, client);
  return client;
}

// --- DB key lookup (lazy import to avoid circular deps) ---
let _getProviderWithKey = null;

export function setKeyLookup(fn) {
  _getProviderWithKey = fn;
}

function getApiKey(providerId) {
  if (_getProviderWithKey) {
    const p = _getProviderWithKey(providerId);
    if (p?.api_key) return p.api_key;
  }
  // Env var fallback
  const envMap = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_API_KEY',
    xai: 'XAI_API_KEY',
    moonshot: 'MOONSHOT_API_KEY',
  };
  return process.env[envMap[providerId]] || null;
}

function getBaseUrl(providerId) {
  if (_getProviderWithKey) {
    const p = _getProviderWithKey(providerId);
    if (p?.base_url) return p.base_url;
  }
  return PROVIDER_URLS[providerId] || null;
}

// --- Token tracking per game ---
const gameTokens = new Map();

export function getTokenUsage(gameId) {
  return gameTokens.get(gameId) || { input: 0, output: 0, calls: 0 };
}

export function clearTokenUsage(gameId) {
  gameTokens.delete(gameId);
}

function trackTokens(gameId, usage) {
  const current = gameTokens.get(gameId) || { input: 0, output: 0, calls: 0, cacheRead: 0, cacheWrite: 0, totalSent: 0 };
  const inputTokens = usage.input_tokens || usage.prompt_tokens || 0;
  // Anthropic: cache_read_input_tokens / cache_creation_input_tokens
  // OpenAI: prompt_tokens_details.cached_tokens (no write cost)
  const cacheRead = usage.cache_read_input_tokens || usage.prompt_tokens_details?.cached_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  current.input += inputTokens;
  current.output += usage.output_tokens || usage.completion_tokens || 0;
  current.cacheRead += cacheRead;
  current.cacheWrite += cacheWrite;
  current.totalSent += inputTokens + cacheRead + cacheWrite;
  current.calls += 1;
  gameTokens.set(gameId, current);
}

// --- Anthropic call ---

async function callAnthropic({ model, systemPrompt, userPrompt, maxTokens, playerName }) {
  const apiKey = getApiKey('anthropic');
  if (!apiKey) throw new FatalLLMError('No Anthropic API key configured. Add one in Settings.');
  const client = getAnthropicClient(apiKey);

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userPrompt }],
  });

  return {
    text: response.content[0].text.trim(),
    usage: response.usage,
  };
}

// --- Anthropic session call (multi-turn) ---

async function callAnthropicSession({ model, systemPrompt, messages, maxTokens, playerName }) {
  const apiKey = getApiKey('anthropic');
  if (!apiKey) throw new FatalLLMError('No Anthropic API key configured. Add one in Settings.');
  const client = getAnthropicClient(apiKey);

  // Use top-level automatic caching (Anthropic's recommended approach for multi-turn).
  // The system auto-places a cache breakpoint on the last cacheable block.
  // On next call, everything before it is read from cache.
  // Min threshold: 1024 tokens (Sonnet/Opus), 2048 tokens (Haiku).
  // Top-level automatic caching: Anthropic places the cache breakpoint on the last cacheable block.
  // Cache activates once total content exceeds threshold (2048 tokens for Sonnet 4.6, 1024 for Opus).
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    cache_control: { type: 'ephemeral' },
    system: [{ type: 'text', text: systemPrompt }],
    messages,
  });

  return {
    text: response.content[0].text.trim(),
    usage: response.usage,
  };
}

// --- OpenAI-compatible session call (multi-turn) ---

async function callOpenAISession({ provider, model, systemPrompt, messages, maxTokens }) {
  const apiKey = getApiKey(provider);
  if (!apiKey) throw new FatalLLMError(`No ${provider} API key configured. Add one in Settings.`);
  const baseUrl = getBaseUrl(provider);
  const tokenParam = provider === 'openai' ? 'max_completion_tokens' : 'max_tokens';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      [tokenParam]: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${provider} API error (${response.status}): ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  return {
    text: data.choices[0].message.content.trim(),
    usage: data.usage || { prompt_tokens: 0, completion_tokens: 0 },
  };
}

// --- OpenAI-compatible call (OpenAI, Google, xAI, Moonshot) ---

async function callOpenAICompatible({ provider, model, systemPrompt, userPrompt, maxTokens }) {
  const apiKey = getApiKey(provider);
  if (!apiKey) throw new FatalLLMError(`No ${provider} API key configured. Add one in Settings.`);
  const baseUrl = getBaseUrl(provider);

  // OpenAI GPT-5+ uses max_completion_tokens, others use max_tokens
  const tokenParam = provider === 'openai' ? 'max_completion_tokens' : 'max_tokens';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      [tokenParam]: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${provider} API error (${response.status}): ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  return {
    text: data.choices[0].message.content.trim(),
    usage: data.usage || { prompt_tokens: 0, completion_tokens: 0 },
  };
}

// --- Session-based entry point ---

/**
 * Ask an LLM using a persistent per-player session.
 * The system prompt is sent once; subsequent calls append to the conversation.
 */
export async function askLLMSession({
  gameId,
  model,
  systemPrompt,
  userPrompt,
  playerName = 'Player',
  playerKey,
  parseResponse = (text) => text,
  retries = 2,
  maxTokens = 300,
}) {
  const provider = getProviderForModel(model);
  const session = getSession(gameId, playerKey || playerName, systemPrompt);

  // Append user message to session
  const messages = addUserMessage(session, userPrompt);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`[${playerName}] calling ${model} session (${messages.length} msgs, attempt ${attempt})...`);

      let result;
      if (provider === 'anthropic') {
        result = await callAnthropicSession({ model, systemPrompt: session.systemPrompt, messages, maxTokens, playerName });
      } else {
        result = await callOpenAISession({ provider, model, systemPrompt: session.systemPrompt, messages, maxTokens });
      }

      // Record assistant response and tokens in session
      addAssistantMessage(session, result.text);
      trackSessionTokens(session, result.usage);

      trackTokens(gameId, result.usage);
      const cached = result.usage.cache_read_input_tokens || result.usage.prompt_tokens_details?.cached_tokens || 0;
      const cacheCreated = result.usage.cache_creation_input_tokens || 0;
      const uncached = result.usage.input_tokens || result.usage.prompt_tokens || 0;
      console.log(`[${playerName}] OK (in:${uncached} out:${result.usage.output_tokens || result.usage.completion_tokens || '?'} cache_read:${cached} cache_write:${cacheCreated})`);
      if (process.env.DEBUG_LLM) console.log(`[${playerName}] RAW: ${result.text.slice(0, 200)}`);
      return parseResponse(result.text);
    } catch (err) {
      if (isFatalError(err)) {
        console.error(`FATAL LLM error for ${playerName}: ${err.message}`);
        throw new FatalLLMError(err.message);
      }
      if (attempt === retries) {
        // Remove the failed user message so session stays clean
        session.messages.pop();
        console.error(`LLM error for ${playerName}:`, err.message);
        throw err;
      }
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

// --- Legacy one-shot entry point ---

/**
 * Ask an LLM a question in the context of a game.
 */
export async function askLLM({
  gameId,
  model,
  systemPrompt,
  userPrompt,
  playerName = 'Player',
  parseResponse = (text) => text,
  retries = 2,
  maxTokens = 300,
}) {
  const provider = getProviderForModel(model);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`[${playerName}] calling ${model} (attempt ${attempt})...`);

      let result;
      if (provider === 'anthropic') {
        result = await callAnthropic({ model, systemPrompt, userPrompt, maxTokens, playerName });
      } else {
        result = await callOpenAICompatible({ provider, model, systemPrompt, userPrompt, maxTokens });
      }

      trackTokens(gameId, result.usage);
      console.log(`[${playerName}] OK (${result.usage.input_tokens || result.usage.prompt_tokens || '?'}in/${result.usage.output_tokens || result.usage.completion_tokens || '?'}out)`);
      if (process.env.DEBUG_LLM) console.log(`[${playerName}] RAW: ${result.text.slice(0, 200)}`);
      return parseResponse(result.text);
    } catch (err) {
      if (isFatalError(err)) {
        console.error(`FATAL LLM error for ${playerName}: ${err.message}`);
        const fatal = new FatalLLMError(err.message);
        throw fatal;
      }
      if (attempt === retries) {
        console.error(`LLM error for ${playerName}:`, err.message);
        throw err;
      }
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}
