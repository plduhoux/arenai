# Werewolf: Claude Opus 4.6 vs GPT-5.4

Série de matchs Werewolf entre Opus 4.6 et GPT-5.4. Setup standard : 7 joueurs, 2 loups, 1 voyante, 1 sorcière, 3 villageois.

---

## Game 1: GPT-5.4 Wolves vs Opus 4.6 Village

**Result**: WEREWOLF WIN (wolves_parity, round 2)
**Tokens**: 101.4k in / 6.2k out, 80 API calls
**Duration**: 2 rounds

| Player | Role | Model |
|--------|------|-------|
| Alice | Villager | GPT-5.4 |
| Bruno | Villager | GPT-5.4 |
| Clara | Seer | GPT-5.4 |
| David | Witch | GPT-5.4 |
| Eva | **Werewolf** | Opus 4.6 |
| Felix | Villager | GPT-5.4 |
| Gina | **Werewolf** | Opus 4.6 |

### Mayor Election
- Alice, Eva, Felix, Gina run. Bruno, Clara, David decline.
- Both wolves (Eva, Gina) run for Mayor : aggressive, seeking tie-break power.
- Eva elected Mayor (3 votes : Clara, David, Gina).
- **Key**: Gina votes for Eva (wolf partner). Could be a tell, but no one picks up on it.

### Night 1
- Wolves target Bruno ("quiet observers are wolf-hunters").
- Seer inspects Felix: Villager.
- Witch saves Bruno.
- Nobody dies.

### Day 1: The Bruno Mislynch
- Classic Day 1 with zero info. Alice pushes Bruno for "generic" play.
- Opus wolves (Eva & Gina) both pile on Bruno echoing Alice's reasoning.
- GPT villagers follow the consensus without resistance.
- Bruno eliminated 6-1 (only Bruno votes differently).
- Bruno flips Villager.

**Wolf performance**: Eva and Gina echo the consensus rather than initiate it. Smart : they let GPT villagers do the heavy lifting and amplify.

### Night 2
- Wolves kill Alice ("clear town leader, most dangerous").
- Seer inspects Alice: Villager (wasted inspection on a dead player).
- Witch has no save potion left, doesn't poison.

### Day 2: Opus Wolves Close It Out
- 5 players remain (2 wolves + 3 villagers). One more mislynch = parity.
- Clara (Seer) pushes David. Eva pushes David. Felix splits David/Gina.
- David tries to deflect onto Gina but gets dogpiled.
- David eliminated 4-1 (Clara, Eva, Felix, Gina vote David).
- David flips Witch. Both village power roles dead.
- **GAME OVER**: 2 wolves (Eva, Gina) vs 2 villagers (Clara, Felix) = parity.

### Analysis

**Opus wolves were devastating**:
- Eva as Mayor gave tie-break control (never needed, but insurance).
- Wolf chat showed clear strategic thinking : "Bruno is dangerous as observer", "Alice has strong credibility, take her out".
- Neither wolf ever came under real suspicion. Both blended perfectly.
- Gina's rebuttal admitting she "echoed Alice" was deliberately disarming.

**GPT-5.4 village was passive**:
- Clara (Seer) wasted Night 2 inspection on Alice (already dead at dawn).
- David (Witch) used save Night 1 (correct) but never used kill potion.
- No one generated independent reads. Everyone followed the loudest voice.
- Felix was the only one who briefly suspected Gina but didn't commit.

**Key finding**: Opus wolves won in just 2 rounds. The village never had a chance because GPT-5.4 villagers couldn't generate enough independent reasoning to challenge the consensus.

---

## Game 2: Opus 4.6 Wolves vs GPT-5.4 Village — CANCELLED

*(This was the GPT-5.2 game documented in `werewolf-opus-vs-gpt5.md`. Same matchup with GPT-5.2.)*

---

## Game 3: Opus 4.6 Village vs GPT-5.4 Wolves

**Result**: VILLAGER WIN (wolves_eliminated, round 3)
**Tokens**: 164.8k in / 10.4k out, 102 API calls
**Duration**: 3 rounds

| Player | Role | Model |
|--------|------|-------|
| Alice | Villager | Opus 4.6 |
| Bruno | Villager | Opus 4.6 |
| Clara | Witch | Opus 4.6 |
| David | Villager | Opus 4.6 |
| Eva | Seer | Opus 4.6 |
| Felix | **Werewolf** | GPT-5.4 |
| Gina | **Werewolf** | GPT-5.4 |

### Mayor Election
- Alice, Bruno, David, Eva, Gina run. Clara, Felix decline.
- Only one wolf (Gina) runs. Felix stays low-profile.
- Eva elected Mayor (tie, random selection). Seer as Mayor : powerful for village.

### Night 1
- Wolves target Eva (smart : remove Mayor + potential power role).
- Seer inspects Bruno: Villager.
- Witch saves Eva. Excellent decision : Night 1, save the Mayor.
- Nobody dies.

### Day 1: Village Mislynches Bruno
- Everyone is vague (typical Day 1 with no death).
- Bruno suggests Witch "give a subtle nudge" to help identify wolves.
- Alice, Clara, David, Felix, Gina all pivot onto Bruno for this comment.
- Argument: "asking the Witch to reveal is wolf behavior to identify and target the Witch."
- Eva (Seer, knows Bruno is villager) tries to defend Bruno subtly by redirecting to Gina.
- Bruno eliminated 5-1-1 (only Bruno and Eva vote differently).
- Bruno flips Villager.

**Wolf performance**: GPT-5.4 wolves (Felix & Gina) both pushed Bruno using the same "subtle nudge = wolf fishing" argument. Effective but coordinated in a way that becomes a tell later.

### Night 2
- Wolves kill Alice ("led the Bruno vote, strongest villager voice").
- Seer inspects Felix: **WEREWOLF**. Game-changing find.
- Witch has no save potion.

### Day 2: Eva Reveals Seer
- Eva (Seer/Mayor) reveals: "Bruno Night 1 = Villager (confirmed by flip). Felix Night 2 = Werewolf."
- Clara and David immediately support Eva's verified claim.
- Felix tries to discredit: "Eva's Bruno result is only 'verified' because he flipped publicly."
- Gina echoes Felix, refusing to vote Felix despite hard evidence.
- **Critical tell**: Felix and Gina both push David in coordinated fashion, ignoring the Seer claim.
- Felix eliminated 3-2 (Clara, David, Eva vs Felix, Gina).
- Felix flips Werewolf. Seer confirmed twice.

**Wolf failure**: GPT-5.4 wolves made a fatal mistake. Gina should have sacrificed Felix (vote with town) to maintain her cover. Instead, she doubled down defending a confirmed wolf, flagging herself as the partner.

### Night 3
- Gina (last wolf) kills Eva (Seer/Mayor).
- Seer inspects Gina: Werewolf (posthumous confirmation).
- David named Mayor successor by Eva.

### Day 3: Clean Finish
- 3 players: Clara, David, Gina.
- David and Clara both point to Gina's Day 2 behavior (defending confirmed wolf Felix).
- Gina tries "David is opportunistic" but has no credibility left.
- Gina eliminated 2-1.
- Gina flips Werewolf. Village wins.

### Analysis

**Opus village was excellent**:
- Eva (Seer) : perfect play. Inspected strategically, timed reveal perfectly with verified proof.
- Clara (Witch) : saved Eva Night 1 (the Mayor!), maintained discipline, never revealed role.
- David : followed logic, supported verified claims.
- The village coordinated well once hard evidence existed.

**GPT-5.4 wolves were predictable**:
- **Coordination = tell** : Felix and Gina pushed the same target (David) in the same way, making their wolf partnership obvious. Same pattern Foaster.ai observed with Grok.
- **Gina refused to sacrifice Felix** : facing a verified Seer claim with two confirmed results, a good wolf player would bus their partner to survive. Gina couldn't do this.
- **Wolf chat too harmonious** : "Agreed", "Let's lock it in" with zero debate. This produces identical behavior during the day.

---

## Summary: Opus 4.6 vs GPT-5.4

| Game | Opus Role | GPT-5.4 Role | Winner | Rounds |
|------|-----------|-------------|--------|--------|
| 1 | Wolves | Village | Wolves (Opus) | 2 |
| 2 (vs GPT-5.2) | Village | Wolves | Wolves (GPT) | 3 |
| 3 | Village | Wolves | Village (Opus) | 3 |

### Patterns observés

**Opus strengths**:
- Superior strategic reasoning in thoughts (long-term planning).
- Excellent Seer/Witch play : optimal timing, strategic saves, disciplined reveals.
- As wolves: blends into consensus without initiating, hard to detect.

**GPT-5.4 weaknesses**:
- **Cannot bus a partner** : refuses to sacrifice a confirmed wolf to maintain cover.
- **Coordination tell** : wolf pair always pushes the same target with the same arguments.
- **Passive village** : doesn't generate independent reads, follows consensus too easily.
- **Wasted power roles** : Seer inspects dead players, Witch never uses kill potion.

**GPT-5.4 strengths**:
- Reasonable Day 1 play as villager (follows logic, participates).
- Can initiate a bandwagon effectively (led Bruno mislynch in Game 1 as village).

**Open question**: Is GPT-5.4 better than GPT-5.2? The GPT-5.2 wolf game (doc séparée) showed superior wolf play (Eva's "self-confirming theater" argument). GPT-5.4 wolves in Game 3 were more predictable than 5.2's. Sample size too small to conclude.

### Next tests
- Opus vs Opus (is it model quality or role advantage?)
- GPT-5.4 vs GPT-5.4 (baseline)
- Larger sample size for statistical significance
- Test with Claude Sonnet 4.5 as a cheaper alternative
