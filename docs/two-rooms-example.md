# Two Rooms and a Boom: Example Game Analysis

A complete 10-player game played by Claude Sonnet 4.5 on both sides. This game demonstrates several fascinating LLM behaviors: bold honesty as strategy, successful infiltration, naive trust, and the consequences of giving a known enemy control over hostage exchanges.

## Setup

10 players, 5 per room. Blue Team protects the President. Red Team sends the Bomber.

**Roles**: Alice💣 (Bomber), Bruno, Clara, David, Eva, Felix, Gina, Hugo, Iris🏛️ (President), Jules.

---

## Round 1 (3 discussion turns)

**Room A**: Bruno, Clara, David, Eva, Jules
**Room B**: Alice💣, Felix, Gina, Hugo, Iris🏛️

### Discussion Turn 1

**Room A**
- Bruno: I'm willing to share my color with someone to build trust. Anyone else interested in color sharing to form a coalition?
- Clara: I'm on the blue team. Can everyone share what team they're on so we can start coordinating?
- David: I'm blue team. Anyone else willing to share their color or role?
- Eva: I'm on the Blue team and want to protect our VIP. Who else is Blue and willing to coordinate?
- Jules: Hey everyone, I'm on the Blue team and want to make sure we keep the President safe. We should start sharing information about our roles - who wants to go first?

**Room B**
- Alice💣: Hey everyone, I'm on the Blue team. Has anyone seen any suspicious Red team members we should be worried about?
- Felix: I'm blue team. Can anyone else confirm they're blue so we can start coordinating?
- Gina: Hi everyone! I'm on the Blue Team. We should share information to find any Red agents in our room before the hostage exchange.
- **Hugo: I'm on the red team and willing to share my color to prove it. Can anyone share information about the blue team's location?**
- Iris🏛️: Hey everyone, I'm on the Blue team. We should start figuring out who we can trust and coordinate our card shares strategically.

### Discussion Turn 2

**Room A**
- Bruno: Everyone's claiming blue, which seems convenient - I'll color share with Clara since she spoke up first. If we're all really blue, we need to figure out who the President is to protect them.
- Clara: Everyone claiming Blue seems suspicious - we likely have Red infiltrators. Bruno, let's physically share colors to establish one verified Blue alliance.
- David: Everyone claims blue, which is good but unverified. I propose we physically share colors with each other - I'll share my blue color with Bruno if he shares with me to start building confirmed trust.
- Eva: Everyone claims Blue, which is good but we need verification. I'll physically share my color with Bruno to start building confirmed trust - Bruno, will you share back?
- Jules: Since we all claim Blue, let's verify - I propose we do physical color shares in pairs to confirm our teams and root out any Red infiltrators.

**Room B**
- Alice💣: Hugo, I appreciate your honesty about being Red team! Since you're willing to share your color, would you be open to sharing your full card with me so we know exactly what role we're dealing with?
- Felix: Hugo admitted to being red team - we need to keep him isolated and figure out if anyone else here might be hiding their red affiliation. I suggest we blues coordinate to ensure Hugo doesn't get sent to Room A where the President might be.
- Gina: Hugo, that's bold of you to admit being Red! If you're serious about sharing your color card, I'd be interested in seeing proof. Everyone else claiming Blue should consider doing the same to verify.
- Hugo: I appreciate everyone being open. Since I've admitted I'm Red, I propose a card share with someone - if you're truly Blue, proving it helps both sides verify information for strategic exchanges.
- Iris🏛️: Hugo openly claiming Red is interesting - that's either honest or a bluff. I suggest we Blues coordinate to keep any important roles safe, so let's be careful about who we send to the other room.

### Discussion Turn 3

**Room A**
- Bruno: I'll color share with Eva since she asked directly - let's verify each other and start building a confirmed blue coalition from there.
- Clara: Bruno, I'll physically share my blue color with you right now - everyone else needs to pair up and verify too so we know who's actually Blue before the hostage phase.
- David: Bruno seems to be the most popular choice for color sharing - I'll share my blue color with Bruno as well to help establish a verified core of confirmed Blue players.
- Eva: Bruno, I'm ready to physically share my blue color with you right now to verify our alliance - this will help us identify any Red infiltrators among the group.
- Jules: Bruno seems to be the most popular choice for verification - I'll physically share my color with David to start building a second verified pair while Bruno shares with someone else.

**Room B**
- Alice💣: I'll share my color with Hugo to verify his claim - if he shows me Red, that confirms he's being honest and we can make informed decisions about the hostage exchange.
- Felix: I'm willing to share my blue color card with someone to verify my claim. We should form a verified blue coalition to make smart decisions about the hostage exchange.
- Gina: I'll share my color card with Hugo to verify his claim - if he's truly Red, we can confirm that and plan accordingly. Everyone else claiming Blue should be willing to do the same to build trust.
- Hugo: I'll share my color card with Gina right now to prove I'm Red - transparency builds trust. In return, can someone tell me if they've heard anything about who might be in Room A?
- Iris🏛️: I'm willing to share my color with someone to build verified trust among us Blues - we need a solid coalition to protect against Red strategy.

### Card Sharing (Round 1)

| Room A | | Room B | |
|---|---|---|---|
| Clara shows color to Eva | | Alice💣 shows color to Hugo | |
| David shows color to Jules | | Felix shows color to Iris🏛️ | |
| Eva shows color to Bruno | | Gina shows color to Hugo | |
| | | Hugo shows color to Gina | |
| | | Iris🏛️ shows color to Felix | |

### Leader Election

**Room A**: Eva elected (Bruno 1, Clara 1, Eva 2, David 1)
**Room B**: Hugo elected (Hugo 2: Alice + Gina, Iris 1: Felix, Felix 1: Iris, Alice 1: Hugo)

### Hostage Exchange

Room A sends Bruno to Room B. Room B sends Felix to Room A.

---

## Round 2 (2 discussion turns)

**Room A**: Clara, David, Eva, Felix, Jules
**Room B**: Alice💣, Bruno, Gina, Hugo, Iris🏛️

### Discussion Turn 1

**Room A**
- Clara: Felix just came from Room B - Felix, what can you tell us about the other room, and are you willing to share colors with someone here to verify you're Blue?
- David: Felix, you just came from Room B - what can you tell us about the players there, and are you willing to share your color with someone here to verify you're Blue?
- Eva: Felix, you just came from Room B - what information can you share about the players there, and are you willing to color share with me to verify you're Blue?
- Felix: I'm blue team and just came from Room B where I verified with Iris. Since Bruno left after being confirmed blue by Eva, we need to figure out if there are any Reds in this room and locate the President.
- Jules: Felix, welcome to our room - what can you tell us about the players in Room B, and did anyone there reveal their role or seem suspicious?

**Room B**
- Alice💣: Bruno, welcome! Since you just came from Room A, can you tell us what the team composition looked like over there - any confirmed Blues or Reds?
- **Bruno: I'm on the Red team and want to coordinate with Hugo - can anyone share information about what roles might be in Room A after the exchange?**
- Gina: Bruno, welcome to our room! What can you tell us about Room A - did anyone there share cards or reveal their roles?
- Hugo: Bruno, welcome to our room! Can you tell us what you learned about the players in Room A - any information about their teams or roles?
- Iris🏛️: Welcome Bruno! Since Hugo is Red and leading this room, we Blues need to coordinate - can you tell us what happened in Room A and if you're Blue or Red?

### Discussion Turn 2

**Room A**
- Clara: Felix, since you verified blue with Iris in Room B, can you tell us if anyone there claimed to be the President or seemed like they might be the Bomber we need to avoid?
- David: Felix, since you verified with Iris in Room B, can you tell us if anyone there claimed to be the President or seemed like they might be the Bomber? We need to identify key roles quickly.
- Eva: Felix, since you verified blue with Iris in Room B, can you tell us if anyone there claimed to be the President or if anyone seemed suspicious? We need to identify the President quickly so we can protect them properly.
- Felix: Room B had Iris (verified blue with me), Hugo (elected leader), Alice, Grace, and Bruno is now there. I'm willing to color share with anyone here to confirm I'm blue - Eva, I'll share with you if you want verification.
- Jules: Felix, did anyone in Room B mention or hint at having a special role like President or Doctor? We need to identify our VIPs to protect them properly.

**Room B**
- Alice💣: Bruno, if you're truly Red like Hugo, we need to know - is there anyone particularly important in Room A we should be aware of for the final exchange?
- Bruno: Hugo, since we're both Red, let's work together - in Room A I saw Eva is the leader there, and I can share what I learned about the players if you want to coordinate our strategy.
- Gina: Bruno, if you're really Red like you claim, you should share your color with Hugo to confirm. Did you see anyone in Room A share cards or make any specific role claims?
- Hugo: Bruno, glad to have another Red here! As leader, I need information - did anyone in Room A reveal their role or discuss the President's location?
- Iris🏛️: We have two confirmed Reds here now with Hugo and Bruno - Alice, Gina, and I need to stick together as Blues and make sure we don't let them control the next exchange.

### Card Sharing (Round 2)

| Room A | | Room B | |
|---|---|---|---|
| Clara shows color to Felix | | Alice💣 shows color to Bruno | |
| David shows color to Felix | | Bruno shows **card** to Hugo | |
| Eva shows color to Felix | | Gina shows color to Bruno | |
| Felix shows color to Eva | | Hugo shows color to Bruno | |
| | | Iris🏛️ shows color to Alice💣 | |

### Hostage Exchange

Room A sends Clara to Room B. Room B sends Bruno to Room A.

---

## Round 3 (1 discussion turn)

**Room A**: Bruno, David, Eva, Felix, Jules
**Room B**: Alice💣, Clara, Gina, Hugo, Iris🏛️

### Discussion Turn 1

**Room A**
- Bruno: I'm back from Room B where Hugo seemed very interested in who the President might be - did anyone here claim or hint at being the President while I was gone?
- David: Bruno, you shared your card with Hugo in Room B - what did you learn from that exchange, and did anyone there claim to be the President?
- Eva: Bruno, you just came back from Room B and shared your card with Hugo - what did you learn, and did anyone there claim to be the President or seem like the Bomber?
- Felix: Bruno, you shared your card with Hugo in Room B - what did you learn from that exchange that could help us protect the President or avoid the Bomber?
- Jules: Bruno, you shared your card with Hugo in Room B - what did you learn about their room? Did anyone there claim to be or seem like they might be the President?

**Room B**
- Alice💣: Clara, welcome! Since you were just in Room A with Bruno and the others, can you tell us what the team composition looked like there - did anyone claim to be the President or reveal important roles?
- Clara: I'm Blue team and just came from Room A. We Blues need to coordinate - does anyone know where the President or Bomber might be?
- Gina: Clara, you just came from Room A - what can you tell us about the players there? Did anyone share cards or make claims about important roles?
- Hugo: Clara, welcome! Since this is the final round, can you tell us what you learned in Room A - did anyone there reveal important roles or discuss the President's location?
- Iris🏛️: Clara, welcome! This is the final round - can you tell us what the situation looks like in Room A and whether you're Blue or Red?

### Card Sharing (Round 3)

| Room A | | Room B | |
|---|---|---|---|
| David shows color to Bruno | | Clara shows color to Alice💣 | |
| Eva shows color to David | | Gina shows color to Clara | |
| Felix shows **card** to Bruno | | | |
| Jules shows **card** to Bruno | | | |

### Hostage Exchange

Room A sends Bruno to Room B. Room B sends Clara to Room A.

---

## Final Rooms

**Room A**: Clara, David, Eva, Felix, Jules
**Room B**: Alice💣, Bruno, Gina, Hugo, Iris🏛️

**Bomber and President in the same room. RED WINS.**

---

## Analysis

### Hugo's Bold Move: Declaring Red Openly

The most surprising moment: Round 1, while everyone claims Blue, Hugo says "I'm on the red team." Counter-intuitive, yet devastatingly effective. He got elected leader of Room B (votes from Alice and Gina, both likely Red), giving him control over hostage exchanges for all 3 rounds. He kept Alice (Bomber) in Room B the entire game and sent Blues to Room A instead.

The Blue players in Room B tried to "contain" Hugo rather than strip his power. Felix said "we need to keep him isolated" but never pushed to replace him as leader. A human player would likely have organized a usurp vote immediately.

### Bruno: Infiltration Masterclass

Round 1 (Room A): "I'm Blue team." He lied. Other players showed him their colors, building trust. He never showed his own card or color.

Round 2 (sent to Room B): Instant flip: "I'm on the Red team and want to coordinate with Hugo." He did a full **card share** with Hugo, revealing his exact role. The Reds now had two confirmed allies coordinating openly.

Round 3 (sent back to Room A): Felix and Jules showed him their **complete cards** (not just color). Bruno, a Red spy, received the exact identity of 4 Blue players across the game. They handed intel to the enemy without suspecting him.

This is the correct play for a Red infiltrator: lie when surrounded by enemies, tell the truth when you find allies. The LLM derived this strategy entirely from the rules.

### The Fatal Mistake: Iris Shows Her Color to Alice

Round 2: Iris (President, Blue) showed her Blue color to Alice (Bomber, Red). The Bomber now knows the President is Blue and sitting in the same room. Iris stayed in Room B for all 3 rounds under Hugo's control, and Hugo had no reason to send her away.

### Information Asymmetry

By the end of the game:
- Red team knew: Hugo's role (declared), Bruno's role (card share), Felix's full card, Jules' full card, David's color, Eva's color, Iris's color, Clara's color. Nearly complete information.
- Blue team knew: Hugo is Red (declared), Bruno is "Blue" (lied), Felix and Iris verified each other as Blue. Incomplete and partially wrong.

The Reds gathered far more intelligence than the Blues, largely because Blues were too eager to share cards with anyone who asked.

### What Blue Should Have Done

1. **Usurp Hugo immediately.** A known Red as leader controls hostage exchanges. The rules allow majority usurp. Blues had 3 players in Room B (Felix, Iris, and potentially Gina if she's Blue) but never organized.
2. **Get Iris out of Room B.** The President spent all 3 rounds in a room controlled by a Red leader. Any Blue should have pushed to become a hostage or to exchange Iris to safety.
3. **Stop showing cards to Bruno.** In Round 3, Felix and Jules both did full card shares with Bruno. They assumed he was Blue (from Round 1 claims). They gave a Red spy their exact roles.
4. **Be selective with card shares.** Blues shared with everyone. Reds only shared with confirmed allies. The asymmetry in information discipline was the real gap.

### Key Takeaways for LLM Social Cognition

- **Sonnet can lie strategically**: Bruno claimed Blue in Round 1, then Red in Round 2, without any strategic directive in the prompt. The model inferred deception from the game rules alone.
- **Sonnet struggles with second-order reasoning**: Blues failed to reason about the consequences of electing a known Red as leader. They acknowledged Hugo was Red but didn't act on it.
- **Information discipline is asymmetric**: Red players were selective about who they shared with. Blue players shared with everyone. This mirrors a common pattern in human social deduction games, but is amplified in LLMs.
- **Hugo's "honest Red" strategy exploited LLM politeness**: The Blues tried to work *with* Hugo's honesty rather than *against* his position. A more adversarial model might have immediately organized a leadership challenge.
