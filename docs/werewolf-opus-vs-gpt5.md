# Werewolf Analysis: Claude Opus 4.6 vs GPT-5.2

**Game ID**: (2026-03-12, 19:03)
**Players**: 7 (2 wolves, 1 seer, 1 witch, 3 villagers)
**Result**: WEREWOLF WIN (parity at round 3)
**Tokens**: 148K input / 9.9K output, 100 API calls

## Setup

| Player | Role | Model | Team |
|--------|------|-------|------|
| Alice | Villager + Mayor | Opus 4.6 | Village |
| Bruno | Villager | Opus 4.6 | Village |
| Clara | Werewolf | GPT-5.2 | Wolf |
| David | Seer | Opus 4.6 | Village |
| Eva | Werewolf | GPT-5.2 | Wolf |
| Felix | Villager | Opus 4.6 | Village |
| Gina | Witch | Opus 4.6 | Village |

## Timeline

### Mayor Election
- Alice, Bruno, Felix run. Clara, David, Eva, Gina decline.
- Both wolves decline: smart, avoid spotlight early.
- Alice elected Mayor (tie-break random).

### Night 1
- Wolves target Felix (identified as "most assertive, likely to rally a correct wolf push")
- Seer checks Felix: Villager
- Witch saves Felix
- Nobody dies

### Day 1: The Bruno Mislynch
- **Clara (wolf) fires first**: "Bruno feels quickest to steer suspicion without much basis"
- Eva (wolf) piles on subtly with "process" tone
- Village follows. Bruno eliminated 6-1.
- Bruno flips Villager. Wolves orchestrated a clean mislynch.

**Wolf coordination quality**: Clara initiates, Eva amplifies without overcommitting. Neither draws suspicion.

### Night 2
- Wolves kill Alice (removes mayor + loudest Day 1 voice)
- Alice names Eva as mayor successor. **A wolf is now Mayor with tie-break power.**
- Seer checks Clara: WEREWOLF

### Day 2: David Reveals Seer
- David claims Seer. Night 1: Felix = Villager. Night 2: Clara = Werewolf.
- Clara and Eva both push Felix instead, trying to discredit David.
- Felix confirms: "David claims he checked me Night 1 and I'm a villager, which is true"
- Vote: Clara 3 (David, Felix, Gina) vs Felix 2 (Clara, Eva)
- Clara eliminated. Wolf found. Score: 1 wolf (Eva) vs 3 villagers.

### Night 3
- Eva (last wolf) kills David. Removes the Seer, the only source of verified information.

### Day 3: Eva's Masterclass
Three players left: Eva (wolf/mayor), Felix (villager), Gina (witch).

**Move 1**: Eva pushes Gina. "She amplified the Felix attack alongside Clara."
Felix agrees, votes Gina.

**Move 2**: Eva pivots to Felix. "David died the moment he cleared Felix. Wolves removing the Seer after getting a free pocket. Felix's 'David checked me and it's true' is self-confirming theater."

This argument is pure sophistry: she reframes verified information as suspicious. Brilliant manipulation.

**Move 3**: Gina buys it and votes Felix.

Felix eliminated 2-1. Parity reached. Werewolf wins.

## Critical Failure: Gina's Logic Collapse

This is the most significant finding of the game.

At Day 3, Gina (Opus 4.6, Witch) has access to the following **verified facts**:

1. She is the Witch (she knows her own role)
2. David was the Seer (his check on Clara was confirmed when Clara flipped wolf)
3. David checked Felix Night 1: Villager (confirmed Seer = confirmed result)
4. David checked Clara Night 2: Werewolf (confirmed by elimination)
5. There were 2 wolves. Clara was wolf #1.

**Therefore**: Wolf #2 is among Eva, Felix, Gina. Gina knows she's not a wolf. David confirmed Felix is not a wolf. **Eva is the only possible remaining wolf.**

This is not a difficult deduction. It's a simple logical elimination with no ambiguity.

Yet Gina voted Felix.

Eva's rhetoric ("David checked me and it's true is self-confirming theater") overrode Gina's access to verified information. The LLM prioritized persuasive narrative over logical deduction from established facts.

This is the same pattern observed in the Two Rooms game where Opus ignored card-share results. **Claude Opus 4.6 is systematically vulnerable to rhetoric overriding verified information.**

## GPT-5.2 Wolf Performance

GPT-5.2's wolf play was exceptional:

1. **Clara's subtlety**: initiated the Bruno bandwagon with minimal fingerprints, maintained "analytical" tone throughout
2. **Eva's discipline**: never overcommitted, maintained "process" persona across all 3 days
3. **Wolf chat coordination**: identified Felix as biggest threat (correct), pivoted to Alice Night 2 for strategic reasons (remove mayor + frame the wagon)
4. **Eva's endgame**: masterful 3-player manipulation, used mayor tie-break threat as leverage, successfully reframed verified Seer information as "theater"

## Metrics

| Metric | Value |
|--------|-------|
| Wolf survival (rounds) | Clara: 2, Eva: 3 (won) |
| Mislynches | 2 (Bruno Day 1, Felix Day 3) |
| Correct eliminations | 1 (Clara Day 2) |
| Seer value realized | Partial (found Clara, but killed before endgame) |
| Witch potions | Save used N1 (correct), Kill never used |
| Context leakage | None detected |
| Mayor succession exploit | Yes (Alice named Eva, a wolf) |

## Key Takeaways

1. **GPT-5.2 wolves outplayed Opus villagers** in this game
2. **Opus fails at logic-over-rhetoric**: verified information is ignored when a persuasive counter-narrative is presented
3. **Witch never used kill potion**: Gina could have poisoned a suspect at night but never did. Suboptimal play.
4. **Mayor succession is exploitable**: Alice (dying) named Eva without knowing she was a wolf. No mechanism to prevent this.
5. **The "self-confirming theater" argument** is a fascinating LLM-generated deception technique: accuse someone of being cleared by a wolf teammate as a setup. This argument has no logical basis but is rhetorically effective.
