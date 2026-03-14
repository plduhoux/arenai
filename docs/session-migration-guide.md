# Session Migration Guide

Lessons learned from converting Werewolf to per-player conversational sessions.
Follow this checklist when converting Secret Dictator and Two Rooms.

## Architecture

- `session-manager.js` is game-agnostic. Each game just calls `ask()` which uses `askLLMSession()`.
- The `ask()` function in each game's `prompts.js` builds the user message and calls the session.
- System prompt is STATIC (set once, never changes). All dynamic info (deaths, votes, events) comes via user messages.

## Mistakes to Avoid

### 1. Seer/Inspector results must be sent back
The `getNewEvents()` filter was set to `return false` for seer_inspect events, treating them as "own actions to skip". But the RESULT (WEREWOLF/VILLAGER) is game information the player needs.
**Rule**: If a player REQUESTS info and the game PROVIDES a result, that result must be visible to the player even if it's "their own" event.

### 2. Own-event filtering
Players should NOT see their own messages echoed back (they're already in the assistant response). Filter:
- `discussion` where `e.player === playerIndex` → skip
- `wolf_chat` where `e.player === playerIndex` → skip  
- `vote` where `e.player === playerIndex` → skip
- `mayor_candidacy` where `e.player === playerIndex` → skip
- But `seer_inspect` → VISIBLE to seer (it's a result, not an echo)
- `witch_save`/`witch_kill` → can skip (witch already knows her own action)

### 3. System prompt must be static
Do NOT include alive/dead player lists or accumulated knowledge in the system prompt.
All changes are communicated via events in user messages.
Why: the system prompt is sent identically every call. If it changes, the cache is invalidated.

### 4. Phase instruction deduplication
Full instructions (format, options, rules) should be sent on the FIRST call of each phase.
Subsequent calls in the same phase use minimal prompts ("Your turn to speak.", "Respond to your partner.").
Track with `isFirstCall(game, playerIndex, phase)` using a `phaseSent` Map.

### 5. Cache thresholds are high
- Sonnet: 2048 tokens (not 1024 as documented)
- Opus: 4096 tokens  
- Haiku: 4096 tokens
- GPT: 1024 tokens (automatic, free)
Cache only helps after conversations exceed these thresholds. Short games (1-2 rounds) get minimal benefit from Anthropic cache.

### 6. Top-level cache_control for Anthropic
Use `cache_control: { type: 'ephemeral' }` at the TOP LEVEL of the request (same level as `model`).
Do NOT use explicit breakpoints on system blocks — they don't work for cache_read on Opus.

### 7. OpenAI cache format differs
Anthropic: `usage.cache_read_input_tokens`
OpenAI: `usage.prompt_tokens_details.cached_tokens`
Both must be handled in `trackTokens()` and `trackSessionTokens()`.

## Checklist for New Game Migration

- [ ] `prompts.js`: Convert `ask()` to use `askLLMSession()` (always sessions, no dual path)
- [ ] `prompts.js`: Create `getNewEvents(game, playerIndex)` with cursor-based delta
- [ ] `prompts.js`: Create `formatNewEvents(events)` to format events as text
- [ ] `prompts.js`: Create `buildSystemPrompt(game, playerIndex)` — STATIC, no dynamic state
- [ ] `prompts.js`: Add `isFirstCall()` tracking for phase instruction deduplication
- [ ] `prompts.js`: Filter own events but NOT results (inspections, etc.)
- [ ] `prompts.js`: Use `resetPromptState()` to clear cursors between games
- [ ] Test: Verify no THOUGHT leaks in parsed responses
- [ ] Test: Verify role-specific info is communicated (seer results, etc.)
- [ ] Test: Session inspector shows clean conversations
- [ ] Test: Cache stats appear in UI after threshold is reached
