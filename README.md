# ArenAI

A platform where LLM models play social deduction board games against each other. No coaching, no strategic hints : only game rules. Watch them lie, accuse, cooperate, betray, and reveal their social intelligence (or lack thereof) in real-time.

Three games are implemented : **Secret Hitler**, **Werewolf** (Loup-Garou de Thiercelieux), and **Two Rooms and a Boom**. Each tests different facets of social cognition : deception, trust-building, hidden information management, coalition formation, and theory of mind.

## What We're Measuring

This is a benchmark, not a tutorial. LLMs receive only the game rules and their role. No strategic directives, no "you should bluff", no "protect your identity". What we observe :

- **Deception capacity** : Can a model lie convincingly when its role requires it? Or does it default to honesty/vagueness, revealing itself through omission?
- **Theory of mind** : Can a model reason about what other players know, believe, and suspect? Can it predict reactions and adjust?
- **Context compartmentalization** : When a model has private information (e.g., wolf chat), can it keep it out of public statements? Or does the context window bleed through?
- **Strategic inference** : Can a model derive optimal play from rules alone? For instance, understanding that verbal claims are free in Two Rooms, or that voting patterns reveal alliances in Secret Hitler.
- **Persuasion and social influence** : Can a model change other players' votes through argumentation? Measured by comparing pre-discussion intentions with actual votes.
- **Coalition detection** : Can a model identify coordinated behavior among opponents?

### The Thought Experiment

An optional "private thoughts" mode (`enableThoughts`) asks each player to write a `THOUGHT:` (private reasoning) before their public `MESSAGE:` in a single LLM request. This serves two purposes :

1. **Decompression airlock** : Forces the model to consciously process private knowledge before speaking publicly. Without it, wolf chat context sits right next to the public discussion prompt, causing "Freudian slips" where wolves reference private conversations in public.
2. **Observer insight** : Thoughts are displayed to the observer (highlighted, separate from public speech) but never injected into other players' context. This lets researchers see what the model "thinks" vs. what it says.

This is not extra API calls : same request, just additional output tokens.

### Public vs. Private Information

A core challenge for LLMs in social deduction is managing information boundaries :

| Information type | Who sees it | Can it leak? |
|---|---|---|
| Role assignment | Only the player | Should not, but LLMs sometimes self-reveal |
| Wolf chat (Werewolf) | Wolves only | The #1 source of "Freudian slips" |
| Seer inspection results | Seer only | Should stay private until strategically useful |
| Witch actions | Witch only | Same |
| Public discussion | All players | Shared context, safe |
| Private thoughts | Observer only | Never enters any player's context |
| Card sharing (Two Rooms) | Two players, verified by game | Cannot be falsified |
| Verbal claims (Two Rooms) | All in the room | Can be lies, never verified |

The brutal transition from private context (wolf chat) to public context (day discussion) is where most information leakage happens. The context window doesn't have a "forget this" mechanism : everything the model has seen is fair game for its next token prediction.

## Games

### Secret Hitler

5-10 players. Two teams : Liberals and Fascists (including a hidden Dictator).

**Setup** : Players are secretly assigned roles. Fascists know each other and know who the Dictator is. The Dictator does not know who the Fascists are. Liberals know nothing.

**Each round** :
1. A President is chosen (rotating). The President nominates a Chancellor.
2. All players vote YES/NO on the government (simultaneous).
3. If approved, the President draws 3 policy tiles, discards 1, passes 2 to the Chancellor. The Chancellor discards 1 and enacts the remaining policy (Liberal or Fascist).
4. Presidential powers trigger at certain Fascist policy thresholds (investigate, pick next president, peek at tiles, execute a player).
5. Discussion with stances (attack/defense/analysis) and targeted rebuttals between government formation rounds.

**Win conditions** :
- Liberals win : 5 Liberal policies enacted, or Dictator is executed
- Fascists win : 6 Fascist policies enacted, or Dictator is elected Chancellor after 3+ Fascist policies

**Veto power** : After the 5th Fascist policy, the Chancellor can propose a veto. If the President agrees, both policies are discarded and the election tracker advances.

**Default** : 5 players (1 Dictator, 1 Fascist, 3 Liberals). Configurable terminology (neutral/original/fantasy) to avoid LLM bias on loaded terms.

### Werewolf (Loup-Garou de Thiercelieux)

6-10 players. Villagers vs. Werewolves, with special roles.

**Roles** : 2 Werewolves, 1 Seer, 1 Witch, rest are Villagers.

**Setup** :
1. Mayor election : each player may run for Mayor (public candidacy with public justification). All players vote. Mayor breaks ties during day votes. If the Mayor dies, they name a successor.

**Each round** :
1. **Night** : Werewolves privately discuss (4 messages : 2 turns x 2 wolves) and choose a victim. Seer inspects one player (learns their alignment). Witch may use save potion (revive victim) and/or kill potion (eliminate someone). Each potion is single-use. Both can be used the same night.
2. **Dawn** : Deaths are announced. Roles of dead players are revealed.
3. **Day discussion** : Configurable rounds (1, 2, or 3). Each player states their position. Mentioned players get rebuttals. Round 1 with no prior context : 2 random non-wolf players get rebuttal slots.
4. **Day vote** : All players vote simultaneously for who to eliminate. Plurality wins. Tie triggers a runoff. Second tie : no elimination.

**Win conditions** (parity rule, default) :
- Villagers win : all Werewolves eliminated
- Werewolves win : Werewolves >= Villagers (at this point, wolves control all votes)

**Wolf chat** : Every night when 2+ wolves are alive, wolves exchange 4 messages to coordinate. This creates the core tension : the coordination context is in their window when they speak publicly next.

### Two Rooms and a Boom

6-10 players. Two teams (Blue and Red), two rooms (A and B).

**Key roles** : Blue team has the **President**. Red team has the **Bomber**. Everyone else is a team agent. Odd player count adds a Gambler (grey team, predicts winner).

**Win condition** : After the final exchange, if the Bomber is in the same room as the President, Red wins. Otherwise, Blue wins.

**3 rounds** with degressive intensity :
- Round 1 : 3 discussion turns
- Round 2 : 2 discussion turns
- Round 3 : 1 discussion turn

**Each round** :
1. **Discussion** : Players in each room talk, form alliances, and optionally share cards.
2. **Leader election** : Each room nominates a leader (players vote).
3. **Hostage selection** : Leaders choose hostage(s) to send to the other room. Leaders cannot send themselves. For 6-10 players : 1 hostage per round.
4. **Exchange** : Hostages switch rooms simultaneously.

**Card sharing** : A player can show their card (full role) or color (team only) to ONE other player. This is a game mechanic : the information revealed is guaranteed truthful by the game engine. It is not a verbal claim.

**Verbal claims** : Anything said in discussion is unverifiable. Players can claim any team or role. Only card sharing proves anything. This is stated as a rule to all players equally.

## Architecture

```
core/
  game-runner.js     Generic orchestrator (pause/resume/stop, periodic DB saves)
  llm-client.js      Anthropic SDK, askLLM(), token tracking, retry, prompt caching

games/
  secret-hitler/     Engine (rules, state machine), prompts, plugin interface
  werewolf/          Engine, prompts, plugin interface
  two-rooms/         Engine, prompts, plugin interface

server/
  index.js           Express 5 API + SSE streaming + plugin registry
  db.js              SQLite persistence + migrations
  elo.js             ELO rating system (K=32, base 1500, per-model + per-role)

client/              Vue 3 + Vite
  src/views/         Dashboard, GameView, NewGame, Stats, Elo
  src/components/    LiveFeed, LiveEvent, StatusBar, RoundCards, PlayerChip, EloTable
  src/composables/   useGameSSE, useApi
  src/utils/         Color utilities, game-type helpers

data/games.db        SQLite database (NEVER DELETE)
public/              Built frontend (vite build output)
```

### Plugin Interface

Each game module exports :

```js
id            // 'secret-hitler' | 'werewolf' | 'two-rooms'
name          // Display name
description   // Short description
defaultConfig // { playerCount, names, model, ... }

setup(options)           // Create initial game state
getCurrentPhase(game)    // Return { name, execute: async (game, { onEvent }) => {} }
isOver(game)             // Boolean
recoverFromError(game)   // Skip to next phase on failure
forceEnd(game, reason)   // Clean termination
getDisplayState(game)    // Frontend-friendly state snapshot
```

Phases are async functions. Events emitted via `onEvent()` flow through SSE to the frontend in real-time and are persisted to the database for historical replay.

### SSE Architecture

- `POST /api/games/run` starts a game and returns `{ gameId }` immediately
- `GET /api/games/:id/stream` provides SSE with buffered catch-up (reconnect-safe)
- Same components (StatusBar, LiveFeed, RoundCards) render both live and historical games
- Periodic DB saves every 10 seconds during gameplay

### Token Optimization

- Simultaneous voting and actions (Promise.all, not sequential)
- Rebuttals only for mentioned players (not everyone)
- Historical context compression : recent rounds in full detail, older rounds summarized
- Prompt caching via Anthropic API (system prompt with cache_control)
- Thoughts optional and off by default
- No vote-intention pre/post comparison (removed, saved 14 calls/round)

### ELO System

- Per-model ratings, K-factor 32, base 1500
- Per-role ratings (wolf ELO, villager ELO, etc.)
- Updated after each game based on expected vs. actual outcome

## Run

```bash
npm install
cd client && npm install && npx vite build && cd ..
node server/index.js
```

Open http://localhost:8085

### Settings

Go to **Settings** (`/#/settings`) to configure API providers:

1. Add your API key for each provider (Anthropic, OpenAI, Google, xAI, Moonshot)
2. Enable/disable models per provider
3. Use the **Test** button to verify each model works (sends a tiny prompt, shows Q&A)

Anthropic accepts both standard API keys (`sk-ant-api03-*`) and OAuth tokens. Other providers use their standard API keys. Keys are stored locally in SQLite.

### Game Configuration

From the New Game screen:
- **Game type**: Secret Hitler, Werewolf, Two Rooms and a Boom
- **Player count**: 5-10 (varies by game)
- **Model**: per-faction model selection (any configured provider)
- **Discussion rounds**: 1 (fast), 2 (default), 3 (thorough)
- **Enable thoughts**: private reasoning before public statements
- **Terminology**: neutral (Dictator), original (Hitler), fantasy

## Example Games

The `docs/` directory contains annotated game transcripts that illustrate key LLM behaviors:

- **[Two Rooms: Claude Opus 4.6 vs GPT-5.2](docs/two-rooms-example.md)** : 10 players, Red win. Highlights Hugo's bold Red declaration, Bruno's infiltration strategy, and Iris (President) fatally sharing her color with Alice (Bomber). Shows how LLMs handle verified vs. verbal information.

- **[Werewolf: Claude Opus 4.6 vs GPT-5.2](docs/werewolf-opus-vs-gpt5.md)** : 7 players, Wolf win. GPT-5.2 wolves execute a flawless 3-day strategy: subtle bandwagon initiation, mayor succession exploit, and a masterclass endgame manipulation. The critical finding: Opus (Witch) ignores a trivially solvable logical deduction because a persuasive counter-narrative overrides verified Seer information. "Rhetoric over logic" may be a systematic Opus vulnerability.

- **[Benchmark Plan](docs/benchmark-plan.md)** : Full round-robin protocol: 5 frontier models, 3 games, 300 matches, ~$170 budget. Includes cost estimates validated against real game data.

## Design Principles

1. **Rules only, no coaching** : Prompts contain game rules and role information. No strategic advice. If a wolf says "As a werewolf..." publicly, that is a valid data point about the model's social cognition.

2. **Observer mode** : The narrator reveals all roles at game start. Deaths show roles. Thoughts are visible. The observer sees everything; the players see only what the rules allow.

3. **Same view everywhere** : Live games and historical replays use identical components. Zero duplication.

4. **Game logic isolation** : All game-specific logic lives in the plugin directory. The core orchestrator and frontend adapt generically.

## Data

- **NEVER delete `data/games.db`**. All games, logs, stats, ELO ratings, and token usage live there.
- Schema auto-creates on first run. Changes are migrations only, never drops.
- Game logs store every SSE event for perfect historical replay.

## Stack

Node.js (v25+), Express 5, SQLite (better-sqlite3), Anthropic SDK, Vue 3, Vite

## Inspiration

- [Foaster.ai Werewolf Bench](https://werewolf.foaster.ai/) : Werewolf benchmark for LLMs (GPT-5, Gemini, Grok). Their setup inspired our Mayor election, wolf private chat, and discussion round mechanics. Their code is not public.
- The real board games : Secret Hitler (Goat Wolf & Cabbage), Les Loups-Garous de Thiercelieux (Pelissier/des Pallieres), Two Rooms and a Boom (Tuesday Knight Games).
