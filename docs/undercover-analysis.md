# Undercover: Early Testing Analysis

April 2026. Analysis of ~8 games played during initial development and tuning.

**Result: 100% civilian win rate.** No LLM has won a game as the Undercover, regardless of model (Claude Opus 4.6, GPT-5.4, Claude Sonnet 4.5).

## The Game

4 players, 3 Civilians sharing the same word, 1 Undercover with a similar but different word. Nobody knows their role. Each round: give a clue, discuss, vote to eliminate. Civilians win by eliminating the Undercover. Undercover wins by surviving to the final 2.

Word pairs are chosen for maximum semantic overlap: Coffee/Tea, Beach/Pool, Pillow/Blanket, Sock/Glove, Guitar/Ukulele.

## Evolution of the Game

### Phase 1: French word pairs, naive prompt

First games used French word pairs (Parapluie/Parasol, Lampe/Bougie). LLMs immediately made compound-word associations ("lampe de chevet", "abat-jour", "ampoule") that narrowed the field in one clue. The Undercover was identified unanimously at round 1 every time.

**Fix:** switched to English word pairs with broader semantic overlap.

### Phase 2: English pairs, still too specific

With English pairs (Coffee/Tea), Civilians gave hyper-specific clues at round 1 ("steep", "leaves", "kettle"). The Undercover, lacking context, gave a generic clue ("morning") that immediately stood out as the only non-specific one.

**Fix:** Undercover speaks last in round 1 (hears 3 clues before giving theirs).

### Phase 3: Speaking last helps, but not enough

The Undercover could now match the group's style at round 1. In the Guitar/Ukulele game, Bruno (GPT-5.4, Undercover with Ukulele) heard "Strings", "Pick", "Strum" and gave "Chords": a perfect blending clue. A Civilian was eliminated instead. First time the Undercover survived round 1.

But at round 2, Bruno gave "Small": a trait of Ukulele but not Guitar. Instantly caught.

**Fix:** modified the prompt to encourage broad clues in round 1 and explicit advice to match the group's style if you suspect you're the Undercover.

### Phase 4: Better prompt, structural limit reached

The Coffee/Tea game (Clara, Opus, Undercover with Tea) was the best Undercover performance observed:

- **Round 1:** "Sip" (perfect, neutral, nobody suspects)
- **A Civilian is eliminated** (David, voted out for giving the broadest clue "Morning")
- **Round 2:** Clara correctly deduces from "Bean" that the Civilian word is Coffee
- **Gives "Caffeine"** instead of a Coffee-specific clue like "Espresso" or "Latte"
- **Identified and eliminated** because her clues were consistently "safe" while Civilians gave Coffee-specific clues ("Bean", "Roast")

## The Fundamental Problem

The Undercover faces a structural disadvantage that no prompt engineering fully solves:

### 1. The specificity trap

As the game progresses, Civilians naturally give more specific clues. The Undercover can only give clues that fit BOTH words (since they started with their own word). This creates a detectable pattern: one player's clues are always "safe" while everyone else's cluster around the real word.

Even when the Undercover identifies the Civilian word (Clara deduced "Coffee" from the clues), the LLM still defaults to giving a clue that's safe for both words rather than committing to the Civilian word. The model has the right analysis but can't convert it into the right action.

### 2. The discussion dogpile

Once one Civilian names a suspect, the others pile on. Sequential discussion creates a consensus cascade: Alice says "Bruno is suspicious", Bruno defends himself, Clara and David agree with Alice. The Undercover is outnumbered 3-to-1 in social pressure.

### 3. Theory of mind gap

LLMs can analyze ("I'm probably the Undercover, their word is probably Coffee") but fail to act on it ("I should give a Coffee-specific clue"). They optimize for accuracy to their own word rather than deception. This is the core finding: LLMs are excellent detectives but poor liars.

## What Worked

- English word pairs with high semantic overlap (Coffee/Tea is the best pair)
- Undercover speaking last at round 1
- Prompt encouraging broad clues and group-matching behavior
- The combination got the Undercover past round 1 for the first time

## What Didn't Work

- French word pairs (too easy to distinguish via compound words)
- Random speaking order (Undercover speaking first is a death sentence)
- Generic strategy advice ("be subtle") without explicit guidance

## Notable Games

### Guitar/Ukulele (GPT-5.4 as Undercover)

Round 1 clues: Strings, Pick, Strum, **Chords** (Undercover). Perfect blend. Civilian eliminated.
Round 2: Undercover gives "Small". Immediately caught. The model couldn't sustain the bluff for two consecutive rounds.

### Coffee/Tea (Opus as Undercover)

Round 1 clues: Morning, Warm, Cup, **Sip** (Undercover). Perfect blend. Civilian eliminated.
Round 2: Undercover correctly identifies "Coffee" as the Civilian word. Gives "Caffeine" instead of "Espresso" or "Latte". Caught because the clue pattern (always safe, never specific) becomes visible against "Bean" and "Roast".

**Key insight:** the model had the information to win (knew the word was Coffee) but couldn't execute the deception (give a Coffee-specific clue instead of a dual-purpose one).

### Pillow/Blanket (GPT-5.4 as Undercover)

Undercover spoke last, heard "Bedtime", "Fluffy", "Case". Gave "Warmth": a Blanket trait that doesn't describe Pillow. The model matched the "sleep/bedroom" theme but picked a property of its own word that doesn't apply to the Civilian word. Caught unanimously.

## Open Questions

- Would 5 players (4 Civilians + 1 Undercover) dilute the signal enough?
- Would 2 Undercovers change the dynamic fundamentally (two clusters instead of one outlier)?
- Can a model be prompted to "commit to the lie" without it being explicit coaching?
- Is there a word pair where the overlap is so high that the Undercover has a structural advantage?
- Would simultaneous discussion (instead of sequential) reduce the dogpile effect?

## Model Comparison: Opus vs GPT-5.4 as Undercover

Early testing used GPT-5.4 as the Undercover. Switching to Opus revealed a significant difference in play quality.

### GPT-5.4 as Undercover

- Analyzes correctly (identifies its role, deduces the civilian word)
- Stays passive: gives "safe" clues that work for both words (Caffeine, Brew, Chords)
- Never commits to the civilian word even after identifying it
- Deflection attempts are weak and transparent (accuses the wrong player)
- Gets caught via the "always generic" pattern

### Opus 4.6 as Undercover

- Also analyzes correctly
- Gives confident, word-specific clues ("Fluff" for Pillow) instead of playing safe
- When it realizes it's the Undercover, switches to attack mode immediately
- Constructs credible accusations ("layer doesn't fit our word")
- Attempts to split the vote rather than passively accepting elimination

### Best game observed: Pillow/Blanket (Opus as Undercover)

Round 1: Alice (Opus, Pillow) gives "Soft". Perfect blend. Clara (Civilian) eliminated instead.

Round 2: Alice gives "Fluff" (Pillow-specific, risky but assertive). Then reads "cover" and "layer" from the Civilians and deduces: "I'm probably the Undercover and their word is Blanket."

Instead of panicking or playing safe, Alice pivots to attack David: "layer feels off to me, pillows don't have layers." The vote goes 2-1 against Alice. She loses, but only because Bruno and David converge. If Bruno had voted David, Alice wins.

**This is the first game where the outcome depends on the vote, not on trivial detection.** The Undercover played well enough that the result was uncertain until the last vote.

### Key insight

The difference isn't analytical (both models identify their role correctly). It's behavioral:
- GPT optimizes for "not getting caught" (safe clues, low profile) -> paradoxically gets caught via the safety pattern
- Opus optimizes for "winning" (assertive clues, active accusation, vote manipulation) -> creates genuine uncertainty

This suggests that deception ability in LLMs may correlate more with assertiveness and willingness to commit to a false narrative than with raw reasoning capability.

## Conclusion

Undercover is the hardest game in ArenAI for the "evil" side. The asymmetry (1 vs 3, unknown role, similar but different word) creates a challenge that current LLMs cannot overcome. They can analyze correctly but cannot execute deception under social pressure. This makes it a uniquely interesting benchmark for measuring the gap between strategic reasoning and strategic action in language models.
