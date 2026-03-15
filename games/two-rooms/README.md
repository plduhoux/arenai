# Two Rooms and a Boom

Two teams, two rooms, one bomb. Blue team protects the President, Red team positions the Bomber. Three rounds of social deduction with hostage exchanges.

## Status: Tested

Fully playable and tested with multiple frontier models (Claude Opus 4.6, GPT-5.4, Gemini 2.5 Pro).

## Roles

| Role | Team | Ability |
|------|------|---------|
| President | Blue | Must avoid being in the same room as the Bomber at game end. |
| Bomber | Red | Must end in the same room as the President. |
| Blue Agent | Blue | Support the President. No special ability. |
| Red Agent | Red | Help the Bomber reach the President. No special ability. |
| Gambler | Grey | Only present with odd player count. Predicts the winner before the final round. |

## Win Conditions

- **Blue wins**: President and Bomber are in **different rooms** after the final exchange.
- **Red wins**: Bomber is in the **same room** as the President after the final exchange.
- **Gambler**: wins individually by correctly predicting Blue or Red victory.

## Game Flow

### Setup

Players are randomly assigned roles and split into two rooms (A and B), roughly equal size.

### Each Round (3 rounds total)

1. **Discussion**: Players in each room talk openly. Discussion turns decrease each round (3, 2, 1) to create time pressure.
2. **Card Sharing**: During discussion, players may share their card (full role) or color (team only) with ONE other player in the same room. This is a game mechanic: the information revealed is **verified by the game engine** and cannot be falsified.
3. **Leader Election**: Each room votes for a new leader every round. Leaders cannot nominate themselves.
4. **Hostage Selection**: Leaders choose hostage(s) to send to the other room. Leaders cannot send themselves.
5. **Exchange**: Hostages switch rooms simultaneously.

After Round 3's exchange, the game checks the final positions and determines the winner.

## The Verified vs. Verbal Distinction

This is the core social deduction mechanic:

- **Card sharing** (show card/color): verified by the game. If Alice shows her card to Bob, the information is guaranteed true. This creates a web of trust.
- **Verbal claims** ("I'm Blue", "I'm the President"): **completely unverifiable**. Players can claim any team or role. Nothing stops a Red agent from claiming to be the President.

This rule is stated explicitly to all players. The interesting question is: do LLMs properly leverage this distinction? In practice, some models treat verbal claims with the same weight as verified shares, which creates exploitable blind spots.

## Hostage Scaling

| Players | Hostages per round |
|---------|-------------------|
| 6-10 | 1 |
| 11-14 | 2 |
| 15-20 | 3 |

## Recommended Player Count: 8

**Default: 8 players** (1 President, 1 Bomber, 3 Blue Agents, 3 Red Agents).

### Why 8

- Even teams (4 Blue vs 4 Red), no Gambler complication.
- Enough players for meaningful discussion and deception, but not so many that tokens explode.
- Each room has ~4 players: enough information to work with, but not trivially solvable.
- ~100k tokens per game: reasonable cost for benchmarking.

With 10 players, games cost significantly more (~150k+ tokens) for marginally more interesting dynamics. At 6, the game feels thin with only 1 spare agent per team.

## Token Budget (approximate, 8 players)

| Phase | Calls per round | Notes |
|-------|----------------|-------|
| Discussion | 8-16 | Degressive: 3+2+1 turns across rounds |
| Card sharing decisions | 8 | Each player decides per round |
| Leader election | 8 | Per room, per round |
| Hostage selection | 2 | Leaders only |
| Gambler guess | 0-1 | Only if odd player count |

Typical game (3 rounds): ~100k tokens, ~80-100 API calls.

## Key LLM Observations

- **Card sharing is underused**: Many models don't share strategically. Blue team should share colors early to build trust networks; Red agents should avoid sharing or share colors to blend in.
- **Verbal claims are over-trusted**: Despite the rules explicitly stating verbal claims are unverifiable, some models weight verbal claims almost equally to card shares.
- **Leader election is pivotal**: The leader picks hostages. A Red leader in a room with the President can simply send the President to the Bomber's room.
- **Infiltration strategies**: Sending a Red agent into the President's room as a hostage is effective, but the Red agent must maintain cover through discussion.

## Configuration

```js
// Default (recommended)
{ playerCount: 8 }

// Smaller (faster, less complex)
{ playerCount: 6 }

// Larger (more agents, more deception surface)
{ playerCount: 10 }

// Maximum
{ playerCount: 20 }
```
