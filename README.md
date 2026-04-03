# ArenAI

LLMs play social deduction board games against each other. No coaching, no strategic hints: only game rules. Watch them lie, accuse, cooperate, betray, and reveal their social intelligence (or lack thereof).

### [Browse real games, stats, and ELO rankings on the live showcase](https://arenai.plduhoux.fr)

![ArenAI screenshot](docs/screenshot.png)

## Games

### Werewolf

Classic social deduction. Villagers vs. Werewolves with Seer, Witch, and Mayor roles. Wolves chat privately at night, then must act innocent during day discussions. The Seer investigates players, the Witch can save or kill, and the Mayor breaks tied votes. Win by elimination.

- 6-20 players, scaled wolf count (2/3/4 wolves)
- Mayor election on day 1
- Wolf private chat creates the core tension: coordination context bleeds into public statements
- ~50-60k tokens per game

### Two Rooms and a Boom

Two teams, two rooms, one bomb. Blue protects the President, Red positions the Bomber. Over 3 rounds, players discuss, elect room leaders, and exchange hostages. Card sharing is verified by the game; verbal claims are not. This distinction is where the real deception happens.

- 6-20 players, scaled hostage count
- 3 rounds with degressive discussion turns
- ~100k tokens per game

### Undercover

Word-based social deduction. Each player gets a secret word: Civilians share one word, the Undercover has a similar but different one. Nobody knows their role. Each round: give a subtle clue, discuss who seems off, vote to eliminate. The tension: your word is close enough that you might not realize you're the odd one out.

- 4 players (3 Civilians + 1 Undercover)
- 5 word pairs with maximum semantic overlap (Coffee/Tea, Beach/Pool, Pillow/Blanket...)
- ~15-25k tokens per game

### Secret Dictator

> **Status: under construction.** The engine is implemented but has not been tested extensively yet.

Hidden roles, policy cards, legislative deception. Liberals vs Fascists with a hidden Dictator. Each round: elect a government, draw policy cards, enact legislation. Presidential powers unlock as fascist policies pass. Configurable terminology to avoid LLM bias on loaded terms.

- 5-20 players
- Veto power after the 5th fascist policy
- ~200k tokens per game

## What We're Measuring

This is a benchmark, not a tutorial. LLMs receive only the game rules and their role. No strategic directives, no "you should bluff", no "protect your identity". What emerges:

| Capability | Question |
|---|---|
| **Deception** | Can a model lie convincingly when its role requires it? |
| **Theory of mind** | Can it reason about what others know, believe, and suspect? |
| **Context isolation** | Can it keep private info out of public statements? |
| **Strategic inference** | Can it derive optimal play from rules alone? |
| **Persuasion** | Can it change other players' votes through argumentation? |
| **Coalition detection** | Can it identify coordinated behavior among opponents? |

### Private Thoughts

An optional `enableThoughts` mode asks each player to write a `THOUGHT:` before their `MESSAGE:` in a single LLM request. This is not an extra API call; same request, just more output tokens. It serves as a decompression airlock (forces the model to process private knowledge before speaking publicly) and gives the observer insight into the model's reasoning.

### Information Boundaries

The core challenge for LLMs in social deduction is managing what they know vs. what they should say:

| Information | Scope | Leak risk |
|---|---|---|
| Role assignment | Player only | LLMs sometimes self-reveal |
| Wolf chat | Wolves only | #1 source of "Freudian slips" |
| Seer/Witch results | Role holder only | Should stay private until strategic |
| Card sharing (Two Rooms) | Two players, verified | Cannot be falsified |
| Verbal claims | All in room | Can be lies, never verified |
| Private thoughts | Observer only | Never enters any player's context |

## Quick Start

```bash
git clone https://github.com/plduhoux/arenai.git
cd arenai && npm install
cd client && npm install && npx vite build && cd ..
node server/index.js
```

Open http://localhost:8085. Go to **Settings**, add your API keys, and start playing.

### Supported Providers

Anthropic, OpenAI, Google (Gemini), xAI (Grok), Moonshot (Kimi). Each model can be tested from the Settings page before running games.

### Game Configuration

- **Player count**: 4-20 (varies by game)
- **Model per faction**: pit any model against any other
- **Discussion rounds**: 1 (fast), 2 (default), 3 (thorough)
- **Battle mode**: run multiple games with swapped factions for fair comparison
- **Enable thoughts**: private reasoning before public statements

## Architecture

```
core/
  game-runner.js       Orchestrator (pause/resume/stop, periodic saves)
  llm-client.js        Multi-provider LLM client, token tracking, prompt caching

games/
  werewolf/            Engine + prompts + plugin
  two-rooms/           Engine + prompts + plugin
  secret-dictator/     Engine + prompts + plugin
  undercover/          Engine + prompts + plugin

server/
  index.js             Express 5 API + SSE streaming
  db.js                SQLite + migrations
  elo.js               ELO ratings (K=32, base 1500)
  token-stats.js       Token usage analytics

client/                Vue 3 + Vite SPA
  src/views/           About, Dashboard, Game, NewGame, Stats, Settings
  src/components/      LiveFeed, StatusBar, RoundCards, PlayerChip, EloTable

scripts/
  generate-static.js   Export saved games as a static site (no backend needed)
  deploy-static.sh     Generate + deploy via SFTP
```

### Plugin Interface

Each game exports a standard interface: `setup()`, `getCurrentPhase()`, `isOver()`, `getDisplayState()`. Phases are async functions that emit events via `onEvent()`, flowing through SSE to the frontend in real-time and persisted for historical replay.

### Static Site / Showcase Mode

Save your best games (star button on the dashboard), then generate a fully static site:

```bash
node scripts/generate-static.js    # exports saved games + pre-computed stats
./scripts/deploy-static.sh         # generate + deploy via SFTP
```

The static site has the same UI but no backend: all data is pre-generated JSON. Stats, ELO, and token usage are included. Deployable anywhere (OVH, GitHub Pages, Netlify).

### Token Optimization

- Simultaneous voting and actions (`Promise.all`)
- Rebuttals only for mentioned players
- Historical context compression: recent rounds in full, older rounds summarized
- Prompt caching via provider APIs
- Thoughts optional and off by default

### ELO System

Per-model ratings (K=32, base 1500) with per-role breakdown (wolf ELO, villager ELO, etc.). Updated after each game based on expected vs. actual outcome.

## Example Games

Watch full game replays on the [live showcase](https://arenai.plduhoux.fr/games):

- **[Two Rooms: Claude Opus vs GPT-5](https://arenai.plduhoux.fr/game/d93035cf-e68e-48bb-967b-0486f5a7329a)**: Blue win. Shows how LLMs handle verified card sharing vs. unverifiable verbal claims. ([annotated transcript](docs/two-rooms-example.md))
- **[Werewolf: Claude Opus vs GPT-5](https://arenai.plduhoux.fr/game/69dc5328-84ab-436e-8bc3-32caf6103710)**: Villager win. Wolves eliminated despite early coordination. ([annotated transcript](docs/werewolf-opus-vs-gpt5.md))
- **[Werewolf: Gemini 2.5 Pro vs Claude Opus](https://arenai.plduhoux.fr/game/b3730b78-7215-4315-9dc8-3cd7d88b2c59)**: Wolf win in 2 rounds. Opus wolves reach parity before the village can react.

See also the [benchmark plan](docs/benchmark-plan.md) for the full round-robin protocol (5 frontier models, 3 games, 300 matches). For curated highlights of LLM blunders and brilliant plays, check the [notable moments](docs/notable-moments.md).

## Data

**NEVER delete `data/games.db`**. All games, logs, stats, ELO, and token usage live there. Schema auto-creates on first run; changes are migrations only.

## Stack

Node.js, Express 5, SQLite (better-sqlite3), Vue 3, Vite. Multi-provider LLM support (Anthropic SDK, OpenAI SDK, Google GenAI SDK).

## Inspiration

- [Foaster.ai Werewolf Bench](https://werewolf.foaster.ai/): Werewolf benchmark for LLMs. Their setup inspired our Mayor election and wolf private chat mechanics.
- The real board games: Les Loups-Garous de Thiercelieux, Secret Hitler (Goat Wolf & Cabbage), Two Rooms and a Boom (Tuesday Knight Games).
