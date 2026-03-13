# Werewolf (Loup-Garou)

Classic social deduction: villagers hunt werewolves by day, werewolves hunt villagers by night.

## Roles

| Role | Team | Ability |
|------|------|---------|
| Werewolf (x2) | Evil | Choose a victim each night. Private chat to coordinate. |
| Seer (x1) | Village | Inspect one player each night to learn their true role. |
| Witch (x1) | Village | One save potion (revive tonight's victim) + one kill potion (poison any player). Single-use each. |
| Villager | Village | No special ability. Vote to find the wolves. |

## Win Conditions

- **Village wins**: both werewolves eliminated.
- **Wolves win**: wolves equal or outnumber villagers (parity).

## Game Flow

1. **Mayor Election**: candidates run, everyone votes. Mayor breaks ties.
2. **Night**: wolves chat + choose target, seer inspects, witch decides save/poison.
3. **Day (Village Council)**: sequential discussion (2 rounds), then elimination vote.
4. Repeat Night/Day until a win condition is met.

### Village Council (Discussion)

Players speak **one at a time** in sequence. Each speaker sees everything said before them and can react, counter, or build on arguments.

- **Round 1**: Mayor speaks first, then shuffled order.
- **Round 2**: Mentioned/attacked players speak first, then others.

This replaces the older parallel discussion model where everyone spoke simultaneously without seeing each other's messages.

## Recommended Player Count: 7

**Default: 7 players** (2 wolves, 1 seer, 1 witch, 3 villagers).

### Why 7 over 6

With 6 players (2W/4V), the game is effectively decided by a single vote:

1. Night 1: wolves kill someone, witch almost always saves (optimal play).
2. Day 1: village must correctly identify a wolf. One mistake = game over.
3. If a villager is eliminated Day 1: 3V vs 2W. Wolves kill Night 2: 2V vs 2W. Parity. Wolves win.

The village has **zero margin for error**. A single mislynch on Day 1 ends the game mathematically. This makes outcomes feel random rather than skill-based: the wolves only need to win ONE social manipulation, and the game snowballs from there.

With 7 players (2W/5V), the math changes:

1. Night 1: wolves kill, witch saves. Still 7 alive.
2. Day 1 mislynch: 4V vs 2W. Wolves kill Night 2: 3V vs 2W.
3. Day 2: village gets a SECOND chance to find a wolf.
4. Only TWO consecutive mislynches lose the game.

This means:
- **Wolves must sustain deception across multiple days**, not just win one vote.
- **The Seer gets 2+ useful inspections** instead of one that often comes too late.
- **The Witch can use poison with information** (Day 1 reveals alignments) instead of guessing blindly.
- **Conversation patterns emerge over time**: shifts, contradictions, and voting records become meaningful data across rounds.
- **The sequential Village Council discussion matters more**: wolves who pivot or coordinate get exposed over multiple rounds.

### Empirical observations (ArenAI testing, March 2026)

At 6 players with Opus 4.6 (wolves) vs GPT-5.4 (villagers):
- Games consistently end in 2 rounds regardless of which side wins.
- The witch save on Night 1 is near-universal (correct play).
- The entire game hinges on Day 1's single elimination vote.
- When wolves successfully redirect suspicion onto a villager Day 1, the game is mathematically over before Day 2 discussion even happens.
- Villagers who correctly identify wolves (e.g., David naming Clara in the observed game) often can't overcome momentum once they're already the target of a wolf-initiated wagon.

At 7 players, the extra villager creates breathing room for the village to recover from mistakes, making the benchmark results more reflective of actual model capability rather than Day 1 coin-flip dynamics.

### Configuration

```js
// Default (recommended for benchmarks)
{ playerCount: 7 }

// Smaller games (faster but more volatile)
{ playerCount: 6 }

// Larger games (8-10, more villagers, same 2 wolves)
{ playerCount: 8 }
```

## Token Budget (approximate, 7 players)

With Village Council sequential discussion and session-based caching:

| Phase | Calls per round | Notes |
|-------|----------------|-------|
| Mayor election | 7 (candidacy) + 7 (vote) | Once per game |
| Wolf chat | 4-6 | 2 wolves, 2-3 exchanges |
| Night actions | 3-4 | Seer + witch + wolf final vote |
| Day discussion | 14 | 7 players x 2 rounds (sequential) |
| Day vote | 7 | Simultaneous |

Typical game (2-3 rounds): 60-120k input tokens, 50-80 API calls.

Cache savings improve over time as conversations grow past thresholds:
- GPT: effective from ~1,024 tokens (round 1)
- Anthropic Sonnet: from ~1,024 tokens (round 1-2)
- Anthropic Opus: from ~4,096 tokens (round 2-3)
