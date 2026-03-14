/**
 * ArenAI - Dynamic Token Stats
 *
 * Computes token usage per model on-the-fly from finished games.
 * No persistent storage — recalculated on every request.
 *
 * Two data sources:
 * 1. Game-level: tokens_input, tokens_output (aggregate per game)
 * 2. Session-level: session_stats JSON (per-player breakdown)
 */

import { getDb } from './db.js';

function getSide(player) {
  if (player.party === 'liberal' || player.party === 'villager' || player.team === 'blue') return 'good';
  if (player.party === 'fascist' || player.party === 'werewolf' || player.team === 'red') return 'evil';
  return 'neutral';
}

/**
 * Compute token stats from session_stats (per-player granularity).
 * Falls back to game-level tokens split by model when session_stats unavailable.
 */
export function getTokenStats(gameTypeFilter) {
  const db = getDb();

  const where = gameTypeFilter
    ? "WHERE status = 'finished' AND game_type = ?"
    : "WHERE status = 'finished'";
  const params = gameTypeFilter ? [gameTypeFilter] : [];

  const games = db.prepare(`
    SELECT id, game_type, players, session_stats,
           tokens_input, tokens_output,
           tokens_cache_read, tokens_cache_write, tokens_total_sent,
           created_at
    FROM games ${where}
    ORDER BY created_at DESC
  `).all(...params);

  // Per-model accumulators
  const models = {};

  function ensure(model) {
    if (!models[model]) {
      models[model] = {
        model,
        games: 0,
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      };
    }
    return models[model];
  }

  // Per-game detail for the response
  const gameDetails = [];

  for (const game of games) {
    const players = JSON.parse(game.players);
    const sessionStats = game.session_stats ? JSON.parse(game.session_stats) : null;

    // Collect unique models in this game
    const gameModels = new Set();
    for (const p of players) {
      if (p.model) gameModels.add(p.model);
    }

    const gameEntry = {
      id: game.id,
      game_type: game.game_type,
      created_at: game.created_at,
      models: {},
    };

    if (sessionStats) {
      // Use per-player session stats (most accurate)
      for (const [key, stats] of Object.entries(sessionStats)) {
        if (!stats.tokens) continue;
        // Find the model for this player
        const playerIndex = key.match(/^player:(\d+):/);
        if (!playerIndex) continue;
        const idx = parseInt(playerIndex[1]);
        const player = players[idx];
        if (!player?.model) continue;

        const m = ensure(player.model);
        const t = stats.tokens;
        m.input += t.input || 0;
        m.output += t.output || 0;
        m.cacheRead += t.cacheRead || 0;
        m.cacheWrite += t.cacheWrite || 0;
        m.total += (t.input || 0) + (t.output || 0);

        // Aggregate for game detail
        if (!gameEntry.models[player.model]) {
          gameEntry.models[player.model] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
        }
        gameEntry.models[player.model].input += t.input || 0;
        gameEntry.models[player.model].output += t.output || 0;
        gameEntry.models[player.model].cacheRead += t.cacheRead || 0;
        gameEntry.models[player.model].cacheWrite += t.cacheWrite || 0;
      }

      // Count games per model
      for (const model of gameModels) {
        ensure(model).games++;
      }
    } else if (game.tokens_input || game.tokens_output) {
      // Fallback: split game-level tokens proportionally by player count per model
      const modelPlayerCounts = {};
      for (const p of players) {
        if (!p.model) continue;
        modelPlayerCounts[p.model] = (modelPlayerCounts[p.model] || 0) + 1;
      }
      const totalPlayers = Object.values(modelPlayerCounts).reduce((a, b) => a + b, 0);

      for (const [model, count] of Object.entries(modelPlayerCounts)) {
        const ratio = count / totalPlayers;
        const m = ensure(model);
        const input = Math.round((game.tokens_input || 0) * ratio);
        const output = Math.round((game.tokens_output || 0) * ratio);
        m.input += input;
        m.output += output;
        m.cacheRead += Math.round((game.tokens_cache_read || 0) * ratio);
        m.cacheWrite += Math.round((game.tokens_cache_write || 0) * ratio);
        m.total += input + output;
        m.games++;

        gameEntry.models[model] = {
          input,
          output,
          cacheRead: Math.round((game.tokens_cache_read || 0) * ratio),
          cacheWrite: Math.round((game.tokens_cache_write || 0) * ratio),
        };
      }
    } else {
      // No token data at all, just count games
      for (const model of gameModels) {
        ensure(model).games++;
      }
    }

    gameDetails.push(gameEntry);
  }

  // Format output
  const modelList = Object.values(models)
    .map(m => ({
      ...m,
      avgInput: m.games > 0 ? Math.round(m.input / m.games) : 0,
      avgOutput: m.games > 0 ? Math.round(m.output / m.games) : 0,
      avgTotal: m.games > 0 ? Math.round(m.total / m.games) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Grand totals
  const totals = modelList.reduce((acc, m) => ({
    input: acc.input + m.input,
    output: acc.output + m.output,
    cacheRead: acc.cacheRead + m.cacheRead,
    cacheWrite: acc.cacheWrite + m.cacheWrite,
    total: acc.total + m.total,
    games: acc.games + m.games,
  }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, games: 0 });

  return { models: modelList, totals, games: gameDetails };
}

/**
 * Get all game types with finished games.
 */
export function getTokenGameTypes() {
  const db = getDb();
  return db.prepare("SELECT DISTINCT game_type FROM games WHERE status = 'finished'")
    .all().map(r => r.game_type);
}
