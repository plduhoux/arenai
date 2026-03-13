/**
 * Session Manager - Per-player conversational sessions
 * 
 * Maintains a messages[] array per player per game.
 * The system prompt is sent once. Each subsequent call appends
 * a user message (delta context + question) and stores the
 * assistant response. Prompt caching handles the rest.
 * 
 * ADR: docs/adr-001-player-sessions.md
 */

// Active sessions: Map<gameId, Map<playerKey, Session>>
const gameSessions = new Map();

/**
 * @typedef {Object} Session
 * @property {string} systemPrompt
 * @property {Array<{role: string, content: string}>} messages
 * @property {boolean} closed
 */

/**
 * Get or create a session for a player in a game.
 * The system prompt is set once on first call.
 */
export function getSession(gameId, playerKey, systemPrompt) {
  if (!gameSessions.has(gameId)) {
    gameSessions.set(gameId, new Map());
  }
  const sessions = gameSessions.get(gameId);
  
  if (!sessions.has(playerKey)) {
    sessions.set(playerKey, {
      systemPrompt,
      messages: [],
      closed: false,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 },
    });
  }
  
  return sessions.get(playerKey);
}

/**
 * Append a user message to the session.
 * Returns the full messages array (for the LLM call).
 */
export function addUserMessage(session, content) {
  session.messages.push({ role: 'user', content });
  return session.messages;
}

/**
 * Record the assistant's response in the session.
 */
export function addAssistantMessage(session, content) {
  session.messages.push({ role: 'assistant', content });
}

/**
 * Track token usage for a session.
 */
export function trackSessionTokens(session, usage) {
  session.tokens.input += usage.input_tokens || usage.prompt_tokens || 0;
  session.tokens.output += usage.output_tokens || usage.completion_tokens || 0;
  // Anthropic: cache_read_input_tokens. OpenAI: prompt_tokens_details.cached_tokens
  session.tokens.cacheRead += usage.cache_read_input_tokens || usage.prompt_tokens_details?.cached_tokens || 0;
  session.tokens.cacheWrite += usage.cache_creation_input_tokens || 0;
  session.tokens.calls += 1;
}

/**
 * Close a player session (e.g., when they die).
 */
export function closeSession(gameId, playerKey) {
  const sessions = gameSessions.get(gameId);
  if (sessions?.has(playerKey)) {
    const session = sessions.get(playerKey);
    session.closed = true;
  }
}

/**
 * Clean up all sessions for a game.
 */
export function clearGameSessions(gameId) {
  gameSessions.delete(gameId);
}

/**
 * Get all sessions for a game (for debugging / prompt inspector).
 */
export function getGameSessions(gameId) {
  const sessions = gameSessions.get(gameId);
  if (!sessions) return {};
  const result = {};
  for (const [key, session] of sessions) {
    result[key] = {
      systemPrompt: session.systemPrompt,
      messages: session.messages,
      closed: session.closed,
      messageCount: session.messages.length,
      tokens: session.tokens,
    };
  }
  return result;
}
