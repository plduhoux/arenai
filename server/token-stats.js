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

// Pricing per 1M tokens (USD)
const PRICING = {
  'claude-opus-4-6':   { input: 5.00,  output: 25.00, cacheRead: 0.50,  cacheWrite: 6.25 },
  'claude-opus-4-5':   { input: 5.00,  output: 25.00, cacheRead: 0.50,  cacheWrite: 6.25 },
  'claude-sonnet-4-6': { input: 3.00,  output: 15.00, cacheRead: 0.30,  cacheWrite: 3.75 },
  'claude-sonnet-4-5': { input: 3.00,  output: 15.00, cacheRead: 0.30,  cacheWrite: 3.75 },
  'claude-haiku-4-5':  { input: 1.00,  output: 5.00,  cacheRead: 0.10,  cacheWrite: 1.25 },
  'gpt-5.4':           { input: 2.50,  output: 15.00, cacheRead: 0,     cacheWrite: 0 },
  'gpt-5.2':           { input: 1.75,  output: 14.00, cacheRead: 0,     cacheWrite: 0 },
  'gpt-5':             { input: 1.25,  output: 10.00, cacheRead: 0,     cacheWrite: 0 },
  'gpt-5-mini':        { input: 0.40,  output: 1.60,  cacheRead: 0,     cacheWrite: 0 },
  'gemini-2.5-pro':    { input: 1.25,  output: 10.00, cacheRead: 0,     cacheWrite: 0 },
  'gemini-2.5-flash':  { input: 0.15,  output: 0.60,  cacheRead: 0,     cacheWrite: 0 },
  'grok-4':            { input: 2.00,  output: 10.00, cacheRead: 0,     cacheWrite: 0 },
  'grok-4.1-fast':     { input: 0.20,  output: 0.50,  cacheRead: 0,     cacheWrite: 0 },
};

function estimateCost(model, input, output, cacheRead = 0, cacheWrite = 0) {
  const p = PRICING[model];
  if (!p) return null;
  return (
    (input / 1_000_000) * p.input +
    (output / 1_000_000) * p.output +
    (cacheRead / 1_000_000) * p.cacheRead +
    (cacheWrite / 1_000_000) * p.cacheWrite
  );
}

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
        cost: 0,
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
        const tIn = t.input || 0, tOut = t.output || 0;
        const tCR = t.cacheRead || 0, tCW = t.cacheWrite || 0;
        m.input += tIn;
        m.output += tOut;
        m.cacheRead += tCR;
        m.cacheWrite += tCW;
        m.total += tIn + tOut;
        const c = estimateCost(player.model, tIn, tOut, tCR, tCW);
        if (c !== null) m.cost += c;

        // Aggregate for game detail
        if (!gameEntry.models[player.model]) {
          gameEntry.models[player.model] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
        }
        gameEntry.models[player.model].input += tIn;
        gameEntry.models[player.model].output += tOut;
        gameEntry.models[player.model].cacheRead += tCR;
        gameEntry.models[player.model].cacheWrite += tCW;
        if (c !== null) gameEntry.models[player.model].cost += c;
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
        const cr = Math.round((game.tokens_cache_read || 0) * ratio);
        const cw = Math.round((game.tokens_cache_write || 0) * ratio);
        m.input += input;
        m.output += output;
        m.cacheRead += cr;
        m.cacheWrite += cw;
        m.total += input + output;
        const c = estimateCost(model, input, output, cr, cw);
        if (c !== null) m.cost += c;
        m.games++;

        gameEntry.models[model] = { input, output, cacheRead: cr, cacheWrite: cw, cost: c || 0 };
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
      cost: Math.round(m.cost * 10000) / 10000,
      avgInput: m.games > 0 ? Math.round(m.input / m.games) : 0,
      avgOutput: m.games > 0 ? Math.round(m.output / m.games) : 0,
      avgTotal: m.games > 0 ? Math.round(m.total / m.games) : 0,
      avgCost: m.games > 0 ? Math.round((m.cost / m.games) * 10000) / 10000 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Grand totals
  const totals = modelList.reduce((acc, m) => ({
    input: acc.input + m.input,
    output: acc.output + m.output,
    cacheRead: acc.cacheRead + m.cacheRead,
    cacheWrite: acc.cacheWrite + m.cacheWrite,
    total: acc.total + m.total,
    cost: acc.cost + m.cost,
    games: acc.games + m.games,
  }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0, games: 0 });
  totals.cost = Math.round(totals.cost * 10000) / 10000;

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
