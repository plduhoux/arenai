# ADR-002: Prompt Caching

**Date** : 14 mars 2026
**Status** : Accepted
**Contexte** : Investigation et implémentation du prompt caching par provider dans ArenAI

## Le problème

Dans une partie Two Rooms (10 joueurs, 3 rounds, ~12 appels/joueur), les joueurs GPT-5.4 montrent du cache (18-30%), les joueurs Opus 4.6 : 0%.

## Comment fonctionne le cache en mode session

Chaque appel API en multi-turn renvoie **tout l'historique** depuis le début :

```
Call  1 : system + msg1                    =   500 tokens
Call  2 : system + msg1 + reply1 + msg2    =   987 tokens
...
Call 12 : system + msg1..12 + reply1..11   = 4 215 tokens
                                    TOTAL  = 24 227 tokens (somme des 12 appels)
```

Le cache fonctionne sur le **préfixe** : au call N, tout ce qui est identique au call N-1 peut être lu depuis le cache au lieu d'être retraité. Ça réduit le coût et la latence.

**Mais** chaque provider impose un **seuil minimum** : le préfixe doit dépasser ce seuil pour que le cache s'active.

## Pourquoi Opus 4.6 ne cache pas sur Two Rooms

Le seuil minimum d'Opus 4.6 est **4 096 tokens**.

Le system prompt Two Rooms fait ~274 tokens. Les messages sont courts (instructions "be CONCISE, 1-2 sentences"). Résultat :

| Call | Contexte cumulé | > 4096 ? |
|------|----------------|----------|
| 1    | ~504 tokens    | ❌       |
| 6    | ~1 905 tokens  | ❌       |
| 10   | ~3 653 tokens  | ❌       |
| 11   | ~3 921 tokens  | ❌       |
| 12   | ~4 216 tokens  | ✅ (dernier appel seulement) |

Le contexte ne dépasse 4 096 qu'au **tout dernier appel**. Et Opus 4.6 a un "warm-up" de 2 appels (cache_write au call N, cache_read au call N+2). Résultat : le cache ne s'active jamais.

GPT-5.4 cache parce que son seuil est de **1 024 tokens** : atteint dès le call 2.

## Seuils de cache par provider

### Anthropic (Claude)

| Modèle | Seuil minimum | TTL | Réduction coût |
|--------|--------------|-----|----------------|
| **Opus 4.6** | **4 096 tokens** | 5 min | input cached : 90% moins cher, cache write : 25% plus cher |
| **Opus 4.5** | **4 096 tokens** | 5 min | idem |
| Opus 4.1 | 1 024 tokens | 5 min | idem |
| Opus 4 | 1 024 tokens | 5 min | idem |
| **Sonnet 4.6** | **2 048 tokens** | 5 min | idem |
| Sonnet 4.5 | 1 024 tokens | 5 min | idem |
| Sonnet 4 | 1 024 tokens | 5 min | idem |
| Haiku 4.5 | 4 096 tokens | 5 min | idem |

**Activation** : `cache_control: { type: 'ephemeral' }` au top-level du request (auto-caching) ou sur les content blocks individuels.

**Warm-up Opus 4.6** : le cache_read ne commence qu'au 3ème appel après avoir dépassé le seuil (1er appel = rien, 2ème = cache_write, 3ème = cache_read).

### OpenAI (GPT)

| Modèle | Seuil minimum | TTL | Réduction coût |
|--------|--------------|-----|----------------|
| Tous les modèles (GPT-4o, GPT-5, etc.) | **1 024 tokens** | 5-10 min | input cached : **gratuit** (0$), pas de surcoût cache write |

**Activation** : automatique, rien à configurer. Fonctionne sur tous les modèles qui supportent le caching.

### Google (Gemini)

| Modèle | Seuil minimum | TTL | Réduction coût |
|--------|--------------|-----|----------------|
| Gemini 2.5 Pro/Flash | **2 048 tokens** (Vertex AI) / **4 096 tokens** (AI Studio) | configurable (min 1 min) | input cached : 75% moins cher + coût stockage par heure |

**Activation** : explicite. Nécessite de créer un objet cache avec l'API `cachedContents`. Pas de caching automatique.

**Attention** : le context caching Gemini est fondamentalement différent des autres providers. C'est un objet persistant côté serveur avec un TTL configurable, pas du prefix matching automatique. Il faut créer/gérer le cache manuellement.

### xAI (Grok)

| Modèle | Seuil minimum | TTL | Réduction coût |
|--------|--------------|-----|----------------|
| Grok 4, Grok 4 Fast, etc. | **Non documenté** (semble ~0) | cache distribué | input cached : 90% moins cher |

**Activation** : automatique par prefix matching. Possibilité d'ajouter `x-grok-conv-id: <uuid>` en header HTTP pour augmenter les chances de cache hit (routage vers le même serveur).

**Note** : la taille du cache est limitée et distribuée. Pas de garantie de cache hit.

### DeepSeek

| Modèle | Seuil minimum | TTL | Réduction coût |
|--------|--------------|-----|----------------|
| Tous les modèles | **64 tokens** | non documenté | input cached : ~90% moins cher |

**Activation** : automatique. Granularité de 64 tokens (le cache s'aligne sur des blocs de 64).

## Impact sur ArenAI

### Modèles qui bénéficient du cache Two Rooms (system prompt ~274 tokens, ~12 calls/joueur)

| Provider | Seuil | Cache à partir du call... | Calls avec cache | Économie estimée |
|----------|-------|--------------------------|-----------------|------------------|
| OpenAI (GPT) | 1 024 | ~2-3 | ~9-10/12 | **20-30%** |
| DeepSeek | 64 | ~2 | ~10-11/12 | **25-35%** |
| xAI (Grok) | ~faible | ~2 | ~10/12 | **20-30%** |
| Anthropic Sonnet 4.5/4 | 1 024 | ~3 | ~8-9/12 | **15-25%** |
| Anthropic Sonnet 4.6 | 2 048 | ~5-6 | ~5-6/12 | **10-15%** |
| Anthropic Opus 4/4.1 | 1 024 | ~3 | ~8-9/12 | **15-25%** |
| **Anthropic Opus 4.5/4.6** | **4 096** | **jamais** | **0/12** | **0%** |
| Google Gemini | 2 048-4 096 | N/A (manuel) | N/A | N/A (nécessite implémentation spécifique) |

### Options pour améliorer le cache Opus 4.5/4.6

1. **Accepter** : le caching ne marchera pas pour Two Rooms avec ces modèles. Le system prompt est trop court et les conversations trop concises pour atteindre 4 096 tokens.

2. **Enrichir le system prompt** : passer de ~274 à ~3 000+ tokens avec des règles détaillées (factuelles, pas stratégiques). Mais même à 1 500 tokens, le seuil n'est atteint qu'au call 8-10. Pour un vrai impact, il faudrait un prompt de ~4 096 tokens à lui seul (= du padding).

3. **Utiliser un modèle avec un seuil plus bas** : Opus 4.0/4.1 (seuil 1 024) cache dès le call 3.

## Tests réalisés

Tous les tests ont été réalisés le 14 mars 2026 avec un token OAuth.

1. **Opus 4 (claude-opus-4-20250514)** : cache fonctionne dès call 2-3 ✅
2. **Opus 4.6 (claude-opus-4-6) - petit prompt** : 0% cache (sous le seuil de 4096) ❌
3. **Opus 4.6 - gros prompt (>4096 tokens)** : cache fonctionne à partir du call 3 ✅
4. **Opus 4.6 - interleaved (2 joueurs alternés)** : cache fonctionne normalement, pas d'éviction entre joueurs ✅
5. **Opus 4.6 - prompt enrichi (~1500 tokens)** : toujours 0% car contexte max = 2710, sous le seuil ❌
6. **Reconstitution des vrais volumes Bruno** : contexte ne dépasse 4096 qu'au call 12/12

## Implémentation dans ArenAI

### Anthropic (llm-client.js)
- `cache_control: { type: 'ephemeral' }` au top-level du request dans `callAnthropicSession`
- Fonctionne automatiquement pour tous les modèles Claude, sous réserve de dépasser le seuil minimum
- Pas besoin de header beta supplémentaire (GA depuis fin 2024)

### OpenAI / GPT (llm-client.js)
- Cache automatique, aucune configuration nécessaire
- Tracking via `usage.prompt_tokens_details.cached_tokens`

### xAI / Grok (llm-client.js)
- Cache automatique par prefix matching
- Header `x-grok-conv-id` ajouté dans `callOpenAISession` pour améliorer le cache hit rate en routant les appels d'un même joueur vers le même cluster
- Valeur = `gameId:playerKey` (stable entre les appels d'un même joueur)

### DeepSeek (futur)
- Cache automatique, seuil très bas (64 tokens)
- Tracking préparé via `usage.prompt_cache_hit_tokens`
- Provider pas encore ajouté dans ArenAI

### Google / Gemini
- Le context caching Gemini est fondamentalement différent : objet persistant côté serveur avec TTL configurable
- Pas de caching automatique via l'endpoint OpenAI-compatible
- Implémentation hors scope pour le moment (nécessiterait l'API native Gemini)

## Conclusion

Le prompt caching Opus 4.6 **fonctionne** techniquement, mais le seuil de 4 096 tokens est trop élevé pour les conversations Two Rooms (system prompt court + messages concis). Il n'y a pas de bug dans le code ArenAI : `cache_control: { type: 'ephemeral' }` au top-level est la bonne approche (documentée par Anthropic).

Les implémentations de cache sont en place pour tous les providers supportés. L'amélioration principale est le header `x-grok-conv-id` pour xAI qui améliore le cache hit rate.
