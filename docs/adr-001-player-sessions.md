# ADR-001: Per-Player Conversational Sessions

**Date**: 2026-03-13
**Status**: Implemented (2026-03-13)
**Authors**: Polo + Michel

## Context

ArenAI is a benchmark platform that pits LLMs against each other in social deduction games (Werewolf, Secret Hitler, Two Rooms). Each game involves ~100 LLM calls for 7 players over 3-5 rounds.

## Problem

The initial architecture uses **one-shot** calls: each LLM request rebuilds the full prompt (system prompt + rules + cumulative context from all rounds + question). The context is re-serialized in its entirety for every call.

Consequences:
1. **Excessive cost**: a 3-round Werewolf game = 164K input tokens. The same content is re-sent dozens of times.
2. **Artificial memory**: older rounds (>3) are summarized to limit tokens, so the player "forgets" details. This is not a faithful test of the model's intelligence.
3. **Dominant system prompt**: game rules are re-injected on every call (~100 times per game), which "hypnotizes" the model. We're testing its ability to follow repeated instructions, not its social intelligence.
4. **Secret Hitler unplayable**: long games (10-15 rounds, complex mechanics) are cost-prohibitive.

## Decision

Replace one-shot calls with **persistent conversational sessions**: a `messages[]` array maintained per player for the entire duration of the game.

### Architecture

```
Player Alice (session):
  system: "You are Alice, a villager. Game rules: ..."     <- sent once
  user: "Night 1: [events]. You may run for Mayor. Do you want to?"
  assistant: "THOUGHT: ... RUN/PASS: ... REASON: ..."
  user: "Election result: Eva elected Mayor. [night events]. Day 1: discuss."
  assistant: "THOUGHT: ... STANCE: analysis MESSAGE: ..."
  user: "Rebuttals: [other players' messages]. Respond."
  assistant: "..."
  ... (context grows, but everything is cached by prompt caching)
```

Each new message only adds the **delta**: current round events and the question. The full history (system + previous exchanges) is automatically cached by the provider's prompt caching mechanism.

### Prompt Caching: The Key Mechanism

LLM providers cache the stable prefix of a conversation server-side:
- **Anthropic**: 90% reduction on cached tokens, 5-min cache (extended on each request)
- **OpenAI**: 50% reduction, automatic caching
- **Google**: 75% reduction, configurable cache
- **DeepSeek**: 90% reduction, automatic caching

As long as the conversation prefix doesn't change (which is the case with append-only sessions), only new tokens are billed at full price.

## Consequences

### 1. Estimated Cost Reduction: ~80%

| Metric | Before (one-shot) | After (sessions) |
|--------|-------------------|-------------------|
| Input tokens / game (Werewolf 3 rounds) | ~165K | ~35K |
| Cached (90% reduction) | 0% | ~90% |
| Effective input cost | 165K x full price | 35K new + 130K x 10% |
| Games possible for the same budget | 1x | 4-5x |

### 2. Better Gameplay Quality

- **Exact memory**: the player remembers every word said, every vote, every private thought. No more approximate summaries.
- **Fewer contradictions**: a wolf with access to the exact history of what they said publicly will be more consistent.
- **Better tracking**: a villager can spot subtle inconsistencies in others' discourse.

### 3. More Faithful Benchmark

- **Diluted system prompt**: rules are at the beginning of the conversation, not repeated 100 times. The model is immersed in gameplay, not hypnotized by instructions.
- **Social intelligence test**: we measure the model's ability to reason in a complex social context, not to follow repeated directives.
- **Human-comparable**: a human player learns the rules at the start and then focuses on the game. Sessions reproduce this behavior.

### 4. Secret Hitler Becomes Viable

Long games (10-15 rounds, extended discussions, multiple votes, presidential powers, veto) become economically feasible thanks to the cost reduction.

### 5. Fight Mode (Batch) Becomes Viable

20 consecutive games for a statistical benchmark: ~3M tokens before, ~600K after.

## Implementation

- Maintain a `Map<playerName, Message[]>` in the game state
- System prompt contains rules + player role (sent once)
- Each call appends a `user` message (new context + question) and receives an `assistant` message (response)
- When a player dies, their session is closed
- Save each prompt/response pair for the "Prompt Inspector" (transparency feature)

## Risks

- **Context window**: on very long games, cumulative context could approach the limit. Mitigation: current windows (200K Anthropic, 128K OpenAI, 1M Google) are more than sufficient for game sessions.
- **Cross-provider consistency**: prompt caching works differently across providers. Savings will vary (90% Anthropic vs 50% OpenAI).
- **Debug**: prompts are no longer self-contained. The Prompt Inspector (separate backlog item) is required to inspect the full state of a player session.
