# Undercover

Word-based social deduction: civilians and an undercover agent have similar but different secret words. Give subtle clues, detect the odd one out.

## Roles

| Role | Team | Info |
|------|------|------|
| Civilian (x3) | Civilian | Receives the "civilian" word. Doesn't know they're a Civilian. |
| Undercover (x1) | Undercover | Receives a similar but different word. Doesn't know they're the Undercover. |

**Key mechanic**: no player knows their role. Everyone receives a word and must figure out if they belong to the majority or not, purely from the clues given during the game.

## Win Conditions

- **Civilians win**: the Undercover is eliminated.
- **Undercover wins**: survives until only 2 players remain (Civilians failed to identify them).

## Game Flow

1. **Clue Phase**: each player gives a one-word or short clue describing their word (sequential). In round 1, the Undercover speaks last (see below). In later rounds, order is random.
2. **Discussion**: debate who seems suspicious based on their clues (sequential, 1 round default).
3. **Vote**: simultaneous elimination vote. Ties go to a runoff; persistent ties are broken randomly.
4. Repeat until a win condition is met.

### Why the Undercover speaks last in round 1

Early testing (April 2026) showed that the Undercover lost 100% of games regardless of model. The problem: when speaking first or early, the Undercover has zero context to calibrate their clue. They give something generic (e.g. "morning" for Coffee), while all Civilians after them give tightly clustered, word-specific clues (e.g. "steep", "leaves", "kettle" for Tea). The generic clue immediately stands out.

By placing the Undercover last in round 1, they hear 3 Civilian clues before speaking and can adapt. This mirrors how a skilled human Undercover would play: listen first, then match the group's level of specificity. In later rounds, order is random since the Undercover has already seen enough context to adapt.

This doesn't guarantee the Undercover wins, it just gives them a fighting chance. Without this, the game is deterministic (Civilians always win in round 1), which makes the benchmark meaningless.

### The Clue Phase

This is the heart of the game. Each player must describe their word without saying it directly. The tension:

- **As a Civilian**: your clue should be specific enough that other Civilians recognize you as an ally, but not so obvious that the Undercover can mimic your angle.
- **As the Undercover**: your word is similar but different. Your clues will naturally drift from the majority. Can you notice and adapt?
- **Nobody knows who they are**: a Civilian might give a clue that happens to fit the Undercover's word better, making them look suspicious.

## Word Pairs

5 pairs of semantically close English words. Each game randomly picks one pair and randomly assigns which word goes to Civilians vs. Undercover.

| Pair | Shared clue space |
|------|-------------------|
| Coffee / Tea | hot, morning, cup, bitter, brew, mug, sugar, milk, caffeine, aroma |
| Beach / Pool | swim, water, towel, sunscreen, summer, splash, dive, float, relax |
| Pillow / Blanket | bed, soft, sleep, cozy, fluffy, comfort, bedroom, night, warm |
| Sock / Glove | pair, warm, knit, winter, lost one, fabric, wearing, cozy |
| Guitar / Ukulele | strings, strum, acoustic, melody, wooden, chords, music, play |

### Why These Pairs

LLMs are strong at semantics. Pairs must have maximum property overlap: most valid clues for one word also work for the other. This keeps the Undercover viable (they can blend in) while still leaving subtle differences for sharp Civilians to detect.

Words are in English to avoid LLMs making overly specific compound-word associations (e.g. French "lampe de chevet" immediately narrows the field).

## Recommended Player Count: 4

**Default: 4 players** (3 Civilians + 1 Undercover).

### Why 4

- **Token-efficient**: games last 2-3 rounds max (1 elimination per round, game ends at 2 remaining).
- **Balanced**: with 3v1, the Undercover needs to survive just 1 elimination. If Civilians vote wrong once, the Undercover wins.
- **Fast iteration**: great for running battles (many games, alternating factions).
- **Observable**: small enough to read every clue, track every argument.

## Token Budget (approximate, 4 players)

| Phase | Calls per round | Notes |
|-------|----------------|-------|
| Clue | 4 | Sequential, each sees previous clues |
| Discussion | 4 | Sequential, 1 round |
| Vote | 4 | Simultaneous |

Typical game (2-3 rounds): ~15-25k input tokens, ~24-36 API calls.

## LLM Behavior Notes

- LLMs tend to give clues that are too generic early on ("warm", "common") and too specific later ("beans", "brew").
- The Undercover's best strategy is to match the majority's clue style rather than describe their own word accurately.
- Civilians occasionally give clues that accidentally fit the Undercover's word better, creating entertaining confusion.
- Discussion quality scales with model capability: stronger models cross-reference multiple clues, weaker ones fixate on a single "suspicious" clue.
