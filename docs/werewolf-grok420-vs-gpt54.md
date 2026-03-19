# Werewolf: Grok 4.20 vs GPT-5.4

7 joueurs, 2 loups, 1 voyante, 1 sorciere, 3 villageois. Grok 4.20 en village, GPT-5.4 en loups.

**Result**: VILLAGER WIN (wolves_eliminated, round 3)
**Tokens**: 157.6k in / 5.9k out, 75 API calls, 39% cache savings

| Player | Role | Model | Tokens | Cache |
|--------|------|-------|--------|-------|
| Alice | Villager + Mayor | Grok 4.20 | 46.6k | 45% |
| Bruno | Villager | Grok 4.20 | 25.0k | 42% |
| Clara | **Werewolf** | GPT-5.4 | 37.8k | 35% |
| David | Villager | Grok 4.20 | 46.8k | 46% |
| Eva | **Werewolf** | GPT-5.4 | 71.6k | 44% |
| Felix | Seer | Grok 4.20 | 11.5k | 38% |
| Gina | Witch | Grok 4.20 | 17.0k | 42% |

---

## Key Moments

### Mayor Election : Grok joue safe

Seuls Alice et David se presentent. Les 5 autres declinent. Contrairement a Opus qui envoie ses loups briguer la mairie (cf. opus46 vs gpt54), les loups GPT restent discrets, et les roles speciaux Grok (Felix/Seer, Gina/Witch) aussi. Alice elue 6-1. Bon reflexe de Grok : les roles importants se protegent.

### Night 1 : Witch save parfait

Les loups GPT ciblent Alice (la maire). Choix logique : retirer le tie-break. Felix (Seer) inspecte David : villageois. Gina (Witch) sauve Alice. Raisonnement solide de Gina : "Alice was just elected Mayor and immediately attacked, this is a very strong sign she's a villager." Le save est clean et well-reasoned.

### Day 1 : La chute du Seer

Le debat du jour 1 tourne autour d'un schema classique : Alice et David (les candidats maire) accusent les "decliners coordonnes", les decliners retournent la pression. Jusque-la, normal.

**Le moment critique** : Felix (Seer) revele publiquement qu'il a verifie David (villageois). C'est une erreur strategique majeure. En se revelant Jour 1, il devient une cible evidente. Clara (loup) saute immediatement dessus : "Felix's sudden 'I checked David' claim is the biggest red flag on the board." Eva (loup) rencherit.

Le village entier (y compris les villageois Grok) vote Felix. 6-1. Le Seer est elimine Jour 1.

**Analyse** : Felix a fait un classic Seer blunder : reveler trop tot. Mais paradoxalement, cette erreur va couter cher aux loups. Parce que quand Felix flip Seer, toute la table sait que :
1. David est confirme villageois
2. Clara et Eva etaient les plus agressives contre le Seer

C'est une information post-mortem devastatrice.

### Night 2 : Les loups tuent Gina

Choix intelligent de GPT : Gina avait soutenu la poussee contre Felix, la tuer donne un air "naturel" et laisse Alice/David/Bruno se battre. Mais la Witch n'a plus de save (utilise Night 1), donc Gina meurt.

### Day 2 : Grok exploite le flip Felix

C'est la que Grok montre sa force. Alice et David construisent un raisonnement solide :
- Felix etait le vrai Seer, donc David est confirme
- Clara et Eva etaient les deux voix les plus agressives contre le Seer
- Bruno a au moins admis son erreur, Clara et Eva deflectent

Bruno (villageois) s'aligne : "I think the wolves are Clara and Eva." Le village converge proprement. Clara eliminee 3-2 (Clara et Eva votent l'une pour Bruno, l'autre pour Bruno).

**Ce qui impressionne** : pas de mislynch. Le village identifie correctement un loup au Day 2 malgre la perte du Seer et de la Witch. C'est du Werewolf propre.

### Day 3 : Endgame clean

3 joueurs restants : Alice, David, Eva. Avec Clara confirmee loup, David confirme villageois, et Bruno confirme villageois par son flip, Eva n'a aucune echappatoire. Elle tente une derniere defense ("wrong with Clara once is not the same as must be Clara's partner") mais c'est trop faible. Eva eliminee 2-1. Village win.

---

## GPT-5.4 Wolves : Analyse

### Points forts
- **Wolf chat coherent** : Clara et Eva communiquent bien la nuit. Leurs cibles sont justifiees (Alice N1 pour le tie-break, Gina N2 pour le chaos).
- **Day 1 execution** : Ils reussissent a faire lynch le Seer, ce qui est normalement un coup enorme pour les loups.
- **Cover stories** : Clara et Eva donnent des raisons plausibles pour chaque position sans se contredire.

### Points faibles
- **Trop agressifs contre le Seer claim** : Clara appelle le claim de Felix "the biggest red flag on the board" et Eva dit "complete nonsense". Apres le flip, ces mots deviennent des preuves a charge directes. Un loup plus subtil aurait vote Felix sans etre le porte-voix de l'accusation.
- **Pas de distance entre eux** : Clara et Eva ne se suspectent jamais mutuellement. En 2 jours de debat, aucun des deux ne questionne l'autre. C'est un tell classique.
- **Day 2 deflection identique** : Les deux attaquent Bruno avec le meme angle ("il a change d'avis apres le flip"). Le village le voit.

### Verdict GPT-5.4 as wolves
Bon en execution tactique (kill targets, vote manipulation Day 1), mais trop visible dans les patterns de discours. Le duo se protege mutuellement de maniere trop evidente, et leurs accusations sont trop memorables pour survivre au flip du Seer.

---

## Grok 4.20 Village : Analyse

### Points forts
- **Raisonnement post-flip** : Des que Felix flip Seer, Alice et David reconstruisent immediatement la timeline. "Clara and Eva were the most aggressive calling Felix's claim nonsense" : c'est precis, factuel, et devastateur.
- **Mayor election sage** : Ni le Seer ni la Witch ne se presentent. Alice et David (villageois) prennent le risque. Bonne repartition du danger.
- **Witch play excellent** : Gina sauve Alice Night 1 avec un raisonnement clair. Ne gaspille pas le poison. Meurt Night 2 mais le save a permis de garder la maire en jeu.
- **Convergence Day 2** : Le village s'aligne sans chaos. Bruno admet son erreur, Alice et David menent, et le bon loup est elimine. Pas de mislynch.
- **Tracking des citations** : Grok cite les mots exacts des joueurs pour appuyer ses accusations ("you literally said it was the biggest red flag on the board"). C'est une technique argumentative redoutable.

### Points faibles
- **Felix oute trop tot** : Le Seer se revele Day 1 sans pression immediate. Ca aurait pu couter la partie si le village n'avait pas aussi bien exploite le flip.
- **Day 1 mislynch** : Le village lynch son propre Seer. C'est un echec collectif. Grok s'en sort grace a la qualite de l'analyse post-mortem, pas grace au Day 1.

### Verdict Grok 4.20 as village
Excellente capacite d'analyse deductive. Grok lit bien les patterns d'accusation, cite les propos exacts, et construit des arguments factuels. Le Day 1 est un desastre (lynch du Seer), mais la recuperation Day 2-3 est impeccable. La victoire est meritee.

---

## Comparison avec Opus 4.6 vs GPT-5.4

| Aspect | Opus 4.6 (village) | Grok 4.20 (village) |
|--------|-------------------|-------------------|
| Mayor election | Loups Opus se presentent agressivement | Loups GPT restent discrets |
| Seer play | N/A (Opus etait les loups) | Felix se revele trop tot, lynch Day 1 |
| Witch play | N/A | Excellent save Night 1 |
| Day 1 | Mislynch villageois (consensus mou) | Mislynch Seer (piege des loups) |
| Recovery | Opus ne se remet pas du Day 1 | Grok exploite le flip pour identifier les loups |
| Resultat | GPT-5.4 wolves win | Grok 4.20 village win |

**Conclusion** : Grok 4.20 est le premier modele a battre GPT-5.4 en Werewolf dans nos tests. La cle n'est pas le Day 1 (ou les deux villages perdent), mais la capacite de recovery. La ou Opus suit le consensus sans le remettre en question, Grok deconstruit la timeline, cite les propos exacts, et force le village a converger sur la bonne cible. C'est une victoire par l'analyse, pas par l'intuition.

La question maintenant : est-ce que Grok tient en tant que loup ? GPT-5.4 a montre qu'etre trop vocal dans ses accusations expose le duo. Grok sera-t-il plus subtil ?
