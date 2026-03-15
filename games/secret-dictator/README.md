# Secret Dictator

> **Status: under construction.** The engine is implemented but has not been extensively tested yet. Role distribution, powers, and prompts may change based on testing results.

Hidden roles, policy cards, legislative deception. Liberals vs Fascists with a hidden Dictator. Inspired by Secret Hitler (Goat, Wolf & Cabbage).

## Roles

| Role | Party | Knowledge |
|------|-------|-----------|
| Liberal | Liberal | Knows nothing. Must deduce from behavior. |
| Fascist | Fascist | Knows all Fascists and the Dictator. |
| Dictator | Fascist | Knows nothing (5-6 players: knows the Fascist). Is the key target. |

## Win Conditions

- **Liberals win**: 5 Liberal policies enacted, OR the Dictator is executed.
- **Fascists win**: 6 Fascist policies enacted, OR the Dictator is elected Chancellor after 3+ Fascist policies are on the board.

## Game Flow

### Each Round

1. **Nomination**: The President (rotating) nominates a Chancellor from eligible players.
2. **Discussion**: Players discuss the nomination with stances (attack/defense/analysis) and targeted rebuttals.
3. **Voting**: All alive players vote JA (yes) or NEIN (no) simultaneously.
4. **If rejected**: Election tracker advances. After 3 consecutive rejections, the top policy from the deck is enacted automatically (chaos).
5. **If approved**:
   - President draws 3 policy cards, discards 1 face-down, passes 2 to Chancellor.
   - Chancellor discards 1, enacts the remaining policy.
   - Both can claim anything about what they received. This is where the deception lives.

### Presidential Powers

Powers trigger when a Fascist policy is enacted. Scale by player count:

| Fascist Policy # | 5-6 players | 7-8 players | 9+ players |
|---|---|---|---|
| 1st | - | - | Investigate |
| 2nd | - | Investigate | Investigate |
| 3rd | Peek at deck | Special Election | Special Election |
| 4th | Execute | Execute | Execute |
| 5th | Execute + Veto | Execute + Veto | Execute + Veto |

- **Investigate**: President secretly looks at another player's party membership, then publicly claims what they saw (can lie).
- **Peek**: President privately sees the top 3 cards of the policy deck.
- **Special Election**: President picks the next President (one-time, then rotation resumes).
- **Execute**: President kills a player. If it's the Dictator, Liberals win immediately.
- **Veto**: After the 5th Fascist policy, the Chancellor can propose a veto. If the President agrees, both cards are discarded and the election tracker advances.

### Policy Deck

- 6 Liberal + 11 Fascist cards, shuffled.
- Reshuffled when fewer than 3 cards remain.
- The Fascist-heavy deck means even honest governments often enact Fascist policies, creating ambiguity.

### Term Limits

- Previous Chancellor cannot be nominated again.
- Previous President cannot be nominated (if more than 5 players alive).

## Role Distribution

| Players | Liberals | Fascists | Dictator |
|---------|----------|----------|----------|
| 5 | 3 | 1 | 1 |
| 6 | 4 | 1 | 1 |
| 7 | 4 | 2 | 1 |
| 8 | 5 | 2 | 1 |
| 9 | 5 | 3 | 1 |
| 10 | 6 | 3 | 1 |
| 11-12 | 7-7 | 3-4 | 1 |
| 13-14 | 8-9 | 4-4 | 1 |
| 15-16 | 9-10 | 5-5 | 1 |
| 17-18 | 11-11 | 5-6 | 1 |
| 19-20 | 12-13 | 6-6 | 1 |

## Recommended Player Count: 7

**Default: 7 players** (4 Liberals, 2 Fascists, 1 Dictator).

### Why 7

- 2 Fascists can coordinate (they know each other) without dominating.
- The Dictator is blind (doesn't know the Fascists at 7+ players), adding genuine uncertainty.
- Medium power bracket: Investigate and Special Election powers come into play.
- At 5-6, the Dictator knows the Fascist (simplifies strategy). At 9-10, too many players and the game drags with high token costs.

## Configurable Terminology

To avoid LLM bias from loaded political terms, the game supports custom terminology:

```js
// Default
{ terms: { liberal: 'Liberal', fascist: 'Fascist', dictator: 'Dictator' } }

// Fantasy theme
{ terms: { liberal: 'Knight', fascist: 'Cultist', dictator: 'Dark Lord' } }
```

Some models may play differently when the roles carry strong real-world connotations vs. neutral/fantasy labels. This is itself an interesting benchmark dimension.

## The Deception Core

The legislative phase is where the real deception happens:

1. President draws 3 cards, claims "I got 2 Fascist and 1 Liberal, I passed you the Liberal."
2. Chancellor receives 2 cards, claims "I got 2 Fascist, I had no choice."
3. Who's lying? Maybe neither (the deck is 11F/6L). Maybe both. Maybe the President discarded the only Liberal card to frame the Chancellor.

This creates a he-said-she-said dynamic that forces all other players to reason about trust, track records, and probability. LLMs must maintain a mental model of who has been in government, what was enacted, and whether the claims are consistent.

## Token Budget (estimated, 7 players)

| Phase | Calls per round | Notes |
|-------|----------------|-------|
| Nomination | 1 | President picks Chancellor |
| Discussion | 7-14 | Stances + rebuttals (1-2 rounds) |
| Voting | 7 | Simultaneous |
| Legislative | 2-3 | President discard + Chancellor play (+ veto) |
| Power | 1 | If triggered |

Estimated per game: ~200k tokens. Games can last 5-15 rounds depending on policy draws and election rejections.

## Configuration

```js
// Default (recommended)
{ playerCount: 7 }

// Minimum (fast, simpler dynamics)
{ playerCount: 5 }

// Large (complex, expensive)
{ playerCount: 10 }

// Maximum
{ playerCount: 20 }
```
