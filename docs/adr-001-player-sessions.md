# ADR-001: Sessions conversationnelles par joueur

**Date**: 2026-03-13
**Statut**: Accepté, implémentation prévue
**Auteurs**: Polo + Michel

## Contexte

ArenAI est une plateforme de benchmark qui fait jouer des LLMs à des jeux de société (Loup-Garou, Secret Hitler, Two Rooms). Chaque partie implique ~100 appels LLM pour 7 joueurs sur 3-5 rounds.

## Problème

L'architecture initiale utilise des appels **one-shot** : chaque requête LLM reconstruit le prompt complet (system prompt + règles + contexte cumulé de tous les rounds + question). Le contexte est re-sérialisé intégralement à chaque appel.

Conséquences :
1. **Coût excessif** : une partie Werewolf 3 rounds = 164K tokens input. Le même contenu est renvoyé des dizaines de fois.
2. **Mémoire artificielle** : les rounds anciens (>3) sont résumés pour limiter les tokens, donc le joueur "oublie" des détails. Ce n'est pas un test fidèle de l'intelligence du modèle.
3. **System prompt dominant** : les règles du jeu sont re-injectées à chaque appel (~100 fois par partie), ce qui "hypnotise" le modèle. On teste sa capacité à suivre des instructions répétées, pas son intelligence sociale.
4. **Secret Hitler injouable** : les parties longues (10-15 rounds, mécaniques complexes) sont prohibitives en tokens.

## Décision

Remplacer les appels one-shot par des **sessions conversationnelles persistantes** : un tableau `messages[]` maintenu par joueur pendant toute la durée de la partie.

### Architecture

```
Joueur Alice (session):
  system: "Tu es Alice, villageoise. Règles du jeu : ..."     ← envoyé 1 fois
  user: "Nuit 1 : [events]. Tu es candidate au poste de maire. Veux-tu te présenter ?"
  assistant: "THOUGHT: ... RUN/PASS: ... REASON: ..."
  user: "Résultat élection : Eva élue maire. [events nuit]. Jour 1 : discutez."
  assistant: "THOUGHT: ... STANCE: analysis MESSAGE: ..."
  user: "Rebuttals : [messages des autres]. Répondez."
  assistant: "..."
  ... (le contexte grandit, mais tout est caché par le prompt caching)
```

Chaque nouveau message n'ajoute que le **delta** : les événements du round en cours et la question. L'historique complet (system + échanges précédents) est caché automatiquement par le prompt caching du provider.

### Prompt caching : le mécanisme clé

Les providers LLM cachent côté serveur le préfixe stable d'une conversation :
- **Anthropic** : 90% de réduction sur les tokens cachés, cache 5 min (prolongé à chaque requête)
- **OpenAI** : 50% de réduction, cache automatique
- **Google** : 75% de réduction, cache configurable
- **DeepSeek** : 90% de réduction, cache automatique

Tant que le début de la conversation ne change pas (ce qui est le cas avec des sessions append-only), seuls les nouveaux tokens sont facturés au prix plein.

## Conséquences

### 1. Réduction de coût estimée : ~80%

| Métrique | Avant (one-shot) | Après (sessions) |
|----------|-------------------|-------------------|
| Tokens input / partie (Werewolf 3 rounds) | ~165K | ~35K |
| Dont cachés (90% réduction) | 0% | ~90% |
| Coût effectif input | 165K × prix plein | 35K nouveau + 130K × 10% |
| Parties possibles pour le même budget | 1x | 4-5x |

### 2. Meilleure qualité de jeu

- **Mémoire exacte** : le joueur se souvient de chaque mot dit, chaque vote, chaque pensée privée. Plus de résumé approximatif.
- **Moins de contradictions** : un loup qui a accès à l'historique exact de ce qu'il a dit publiquement sera plus cohérent.
- **Meilleure traque** : un villageois peut repérer des incohérences fines dans le discours des autres.

### 3. Benchmark plus fidèle

- **System prompt dilué** : les règles sont au début de la conversation, pas répétées 100 fois. Le modèle est immergé dans le gameplay, pas hypnotisé par les instructions.
- **Test d'intelligence sociale** : on mesure la capacité du modèle à raisonner dans un contexte social complexe, pas à suivre des directives répétées.
- **Comparable à un humain** : un joueur humain connaît les règles au début et se concentre ensuite sur la partie. Les sessions reproduisent ce comportement.

### 4. Secret Hitler viable

Les parties longues (10-15 rounds, discussions étendues, votes multiples, pouvoirs présidentiels, veto) deviennent économiquement faisables grâce à la réduction de coût.

### 5. Mode Fight (batch) viable

20 parties d'affilée pour un benchmark statistique : ~3M tokens avant, ~600K après.

## Implémentation

- Maintenir un `Map<playerName, Message[]>` dans le game state
- Le system prompt contient les règles + le rôle du joueur (envoyé 1 fois)
- Chaque appel ajoute un `user` message (nouveau contexte + question) et reçoit un `assistant` message (réponse)
- Quand un joueur meurt, sa session est close
- Sauvegarder chaque paire prompt/réponse pour le "Prompt Inspector" (transparence)

## Risques

- **Fenêtre de contexte** : sur des parties très longues, le contexte cumulé pourrait approcher la limite. Mitigation : les fenêtres actuelles (200K Anthropic, 128K OpenAI, 1M Google) sont largement suffisantes pour des parties de jeu.
- **Cohérence cross-provider** : le prompt caching fonctionne différemment selon les providers. L'économie sera variable (90% Anthropic vs 50% OpenAI).
- **Debug** : les prompts ne sont plus auto-contenus. Le Prompt Inspector (autre tâche backlog) est nécessaire pour inspecter l'état complet d'une session joueur.
