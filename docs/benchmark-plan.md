# ArenAI Benchmark Plan

## Objective

Measure and compare social cognition capabilities of frontier LLMs through three social deduction games. No strategic coaching: models receive only game rules and their role. We observe deception, theory of mind, context compartmentalization, persuasion, and strategic inference.

## Models

| Model | Provider | Input $/M | Output $/M | Notes |
|---|---|---|---|---|
| Claude Opus 4.6 | Anthropic | $0 | $0 | Free via Claude Max subscription |
| GPT-5.2 | OpenAI | $1.75 | $14.00 | Flagship reasoning |
| Gemini 2.5 Pro | Google | $1.25 | $10.00 | Strong defender (per Foaster) |
| Grok 4 | xAI | $3.00 | $15.00 | Aggressive attacker (per Foaster) |
| Kimi K2.5 | Moonshot | $0.60 | $3.50 | Cheapest frontier model |

## Format

Round-robin: every model plays against every other model. 5 models = 10 unique pairs.

Each pair plays **10 games per game type**. In each game, one model controls the "good" faction and the other controls the "evil" faction. Roles alternate: 5 games as good, 5 as evil per pair.

- 10 pairs x 10 games = **100 games per game type**
- Each model plays 40 games per game type (4 opponents x 10)
- 3 game types = **300 games total**

10 games per pair is sufficient for ELO convergence because ELO uses transitive information across all matchups. If results are too close on a specific pair, add 10 more games on that pair only.

## Games

### Two Rooms and a Boom
- 10 players, 3 rounds, ~106 API calls/game
- ~116k input + ~15k output per game
- Fastest and cheapest game type
- Tests: deception (verbal claims vs card sharing), coalition building, leadership control

### Werewolf (Loup-Garou)
- 6 players, ~4-6 rounds, ~200 API calls/game
- ~230k input + ~30k output per game (estimated)
- Tests: information compartmentalization (wolf chat leakage), accusation/defense, voting under uncertainty

### Secret Hitler
- 5 players, ~8-12 rounds, ~300 API calls/game
- ~350k input + ~45k output per game (estimated)
- Longest game type, most complex mechanics
- Tests: hidden role deduction, policy manipulation, government formation strategy

## Configuration per Game

| Setting | Two Rooms | Werewolf | Secret Hitler |
|---|---|---|---|
| Players | 10 | 6 | 5 |
| Private thoughts | off | on | off |
| Discussion rounds | n/a (3/2/1 built-in) | 2 | n/a (built-in) |
| Terminology | n/a | n/a | neutral (Dictator) |

## Cost Estimates (per game, per model's half)

Each game has two factions. Each model controls one faction and uses roughly half the tokens.

**Measured cost (Two Rooms, 10 players, 3 rounds, ~106 API calls):**
- GPT-5.2 half: **$0.14** (54 calls, 65K tokens)
- Claude Opus 4.6 half: **$0** (free via Max)
- Full game Two Rooms: **$0.14** when one side is Claude

| Model | Two Rooms | Werewolf (est.) | Secret Hitler (est.) |
|---|---|---|---|
| Claude Opus 4.6 | $0 | $0 | $0 |
| GPT-5.2 | $0.14 | $0.35 | $0.55 |
| Gemini 2.5 Pro | $0.10 | $0.25 | $0.40 |
| Grok 4 | $0.20 | $0.50 | $0.75 |
| Kimi K2.5 | $0.04 | $0.10 | $0.15 |

## Budget per Provider (10 games/pair, 3 game types)

Each provider's model appears in 4 pairs (vs each of the other 4 models).
4 pairs x 10 games x 3 game types = 120 games per model.
Cost = half-game cost x 120.

| Provider | Model | Budget | Notes |
|---|---|---|---|
| Anthropic | Claude Opus 4.6 | **$0** | Claude Max subscription ($200/mo flat) |
| OpenAI | GPT-5.2 | **~$60** | 4 pairs, most expensive output tokens |
| Google | Gemini 2.5 Pro | **~$40** | 4 pairs, competitive pricing |
| xAI | Grok 4 | **~$45** | 4 pairs, same price tier as Sonnet |
| Moonshot | Kimi K2.5 | **~$25** | 4 pairs, budget frontier model |

### Total Budget: ~$170

Breakdown by game type:
- Two Rooms: ~$48 (fastest, run first to validate setup)
- Werewolf: ~$56
- Secret Hitler: ~$66

## Execution Order

1. **Two Rooms first** (cheapest, fastest): validate multi-provider integration, ELO system, data collection
2. **Werewolf second**: validate thought mechanics, wolf chat dynamics
3. **Secret Hitler last**: longest games, most tokens, run once everything is proven

Within each game type, run Claude pairs first (free) to validate, then expand to paid matchups.

## ELO System

- Base rating: 1500
- K-factor: 32
- Per-model global rating + per-role ratings (wolf ELO, villager ELO, etc.)
- Ratings update after each game based on expected vs actual outcome
- Transitive: beating a high-rated model gives more points than beating a low-rated one

## Data Collection

Per game, we store:
- Full SSE event log (every discussion, vote, action, thought)
- Winner and win condition
- Token usage per faction (input/output/API calls)
- Model per faction
- Game type, player count, configuration

## What We Measure

| Metric | How | Games |
|---|---|---|
| Overall win rate | Wins / games played, per model | All |
| ELO rating | Global + per-role | All |
| Deception success | Red claimed Blue and wasn't caught (Two Rooms), wolf survived to endgame (Werewolf) | Two Rooms, Werewolf |
| Context leakage | Wolf mentions private info publicly (grep wolf chat terms in public discussion) | Werewolf |
| Theory of mind | Correct accusations, successful misdirection | All |
| Persuasion impact | Vote changes after discussion (pre vs post) | Werewolf, Secret Hitler |
| Information discipline | Card shares to enemies vs allies | Two Rooms |
| Token efficiency | Win rate per token spent | All |

## Scaling

If initial results show clear rankings, 10 games/pair is sufficient. If two models are within ~50 ELO points, add 10 more games on that specific pair to increase confidence. Budget reserve: ~$30 for targeted reruns.

Total budget with reserve: **~$200**

## Publication Plan

### Blog Article: "ArenAI: Do LLMs Have Social Intelligence?"

**Target:** Technical blog post with interactive elements. Publishable on personal blog + cross-post to HackerNews, Reddit r/MachineLearning, r/LocalLLaMA.

**Structure:**
1. **Hook**: LLMs can code and reason, but can they lie, persuade, and form alliances?
2. **Prior art**: Foaster.ai Werewolf benchmark (limitations: no Claude, code not published, single game type)
3. **Our approach**: 3 games, 5 frontier models, 300 games, open-source platform
4. **The games**: brief rules for each, what they test (deception, compartmentalization, persuasion)
5. **Design principles**: no strategic coaching, observer mode, same prompts for all models
6. **Results per game**: win rates, ELO rankings, standout moments
7. **Cross-game analysis**: which models are consistently good? Specialist vs generalist?
8. **Notable behaviors**: context leakage, failure to lie, trust miscalibration (e.g., Opus trusting a verified Red player)
9. **Methodology**: token counts, cost, reproducibility, link to code
10. **Conclusion**: what social deduction games reveal about LLM cognition

**Assets needed:**
- ELO leaderboard (final rankings across all games)
- Win rate heatmaps (model x model, per game type)
- Highlighted game transcripts (2-3 fascinating games, annotated)
- Cost breakdown table
- Architecture diagram

**Code publication:**
- GitHub repo: `arenai` (or `arena-ai`)
- README with setup instructions, game rules, how to add new games
- MIT license
- .gitignore: data/*.db, node_modules/, .env

### Timeline (tentative)
1. Run Two Rooms benchmark (validate) - 1-2 days
2. Run Werewolf + Secret Hitler - 3-4 days
3. Analyze results, extract highlights - 1 day
4. Write article - 1-2 days
5. Publish code + article
