/**
 * ArenAI - Dynamic ELO Rating System
 *
 * Computes ELO ratings on-the-fly from finished games.
 * No persistent storage — recalculated on every request.
 * Deleting games automatically updates rankings.
 *
 * K-factor = 32, base = 1500
 */

import { getDb } from './db.js';

const K = 32;
const BASE = 1500;

function expectedScore(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

function getSide(player) {
  if (player.party === 'liberal' || player.party === 'villager' || player.team === 'blue') return 'good';
  if (player.party === 'fascist' || player.party === 'werewolf' || player.team === 'red') return 'evil';
  return 'neutral';
}

function isGoodWinner(winner) {
  return ['liberal', 'villager', 'blue'].includes(winner);
}

/**
 * Replay all finished games chronologically and compute ELO ratings.
 * Returns { overall, byRole: { good, evil }, byGame: { 'two-rooms': {...}, ... } }
 */
function computeElo(gameTypeFilter) {
  const db = getDb();

  const where = gameTypeFilter
    ? "WHERE status = 'finished' AND game_type = ?"
    : "WHERE status = 'finished'";
  const params = gameTypeFilter ? [gameTypeFilter] : [];

  const games = db.prepare(`
    SELECT id, players, winner, game_type, created_at
    FROM games ${where}
    ORDER BY created_at ASC
  `).all(...params);

  // Rating accumulators: model -> { rating, games, wins }
  const ratings = {
    overall: {},
    good: {},
    evil: {},
  };

  function ensure(bucket, model) {
    if (!bucket[model]) bucket[model] = { rating: BASE, games: 0, wins: 0 };
    return bucket[model];
  }

  for (const game of games) {
    if (!game.winner || game.winner === 'draw') continue;

    const players = JSON.parse(game.players);
    const goodWon = isGoodWinner(game.winner);

    // Collect unique models per side
    const goodModels = new Set();
    const evilModels = new Set();

    for (const p of players) {
      const model = p.model || 'unknown';
      const side = getSide(p);
      if (side === 'good') goodModels.add(model);
      else if (side === 'evil') evilModels.add(model);
    }

    if (goodModels.size === 0 || evilModels.size === 0) continue;

    // Average ELO per side (for matchup expected score)
    const avgGood = [...goodModels].reduce((s, m) => s + ensure(ratings.good, m).rating, 0) / goodModels.size;
    const avgEvil = [...evilModels].reduce((s, m) => s + ensure(ratings.evil, m).rating, 0) / evilModels.size;

    // Update good side
    for (const model of goodModels) {
      const r = ensure(ratings.good, model);
      const exp = expectedScore(r.rating, avgEvil);
      r.rating += K * ((goodWon ? 1 : 0) - exp);
      r.games++;
      if (goodWon) r.wins++;

      // Overall (always update)
      const o = ensure(ratings.overall, model);
      const oExp = expectedScore(o.rating, avgEvil);
      o.rating += K * ((goodWon ? 1 : 0) - oExp);
      o.games++;
      if (goodWon) o.wins++;
    }

    // Update evil side
    for (const model of evilModels) {
      const r = ensure(ratings.evil, model);
      const exp = expectedScore(r.rating, avgGood);
      r.rating += K * ((goodWon ? 0 : 1) - exp);
      r.games++;
      if (!goodWon) r.wins++;

      // Overall (skip if same model on both sides to avoid double-counting)
      if (!goodModels.has(model)) {
        const o = ensure(ratings.overall, model);
        const oExp = expectedScore(o.rating, avgGood);
        o.rating += K * ((goodWon ? 0 : 1) - oExp);
        o.games++;
        if (!goodWon) o.wins++;
      }
    }
  }

  return ratings;
}

function formatBucket(bucket) {
  return Object.entries(bucket)
    .map(([model, r]) => ({
      model,
      rating: Math.round(r.rating),
      games: r.games,
      wins: r.wins,
      winRate: r.games > 0 ? Math.round((r.wins / r.games) * 100) : 0,
    }))
    .sort((a, b) => b.rating - a.rating);
}

/**
 * Get ELO rankings (computed dynamically).
 */
export function getEloRankings() {
  const db = getDb();

  // Get all game types
  const gameTypes = db.prepare("SELECT DISTINCT game_type FROM games WHERE status = 'finished'")
    .all().map(r => r.game_type);

  // Overall ratings (all games)
  const all = computeElo();

  // Per game type
  const byGame = {};
  for (const gt of gameTypes) {
    const gtRatings = computeElo(gt);
    byGame[gt] = {
      overall: formatBucket(gtRatings.overall),
      good: formatBucket(gtRatings.good),
      evil: formatBucket(gtRatings.evil),
    };
  }

  return {
    overall: formatBucket(all.overall),
    byRole: {
      good: formatBucket(all.good),
      evil: formatBucket(all.evil),
    },
    byGame,
    gameTypes,
  };
}

/**
 * Get ELO history for a model (computed dynamically by replaying games).
 */
export function getEloHistory(model) {
  const db = getDb();
  const games = db.prepare("SELECT id, players, winner, game_type, created_at FROM games WHERE status = 'finished' ORDER BY created_at ASC").all();

  const history = [];
  let rating = BASE;

  for (const game of games) {
    if (!game.winner || game.winner === 'draw') continue;
    const players = JSON.parse(game.players);
    const goodWon = isGoodWinner(game.winner);

    const goodModels = new Set();
    const evilModels = new Set();
    let modelSide = null;

    for (const p of players) {
      const m = p.model || 'unknown';
      const side = getSide(p);
      if (side === 'good') goodModels.add(m);
      else if (side === 'evil') evilModels.add(m);
      if (m === model) modelSide = side;
    }

    if (!modelSide) continue;

    const opponentAvg = modelSide === 'good'
      ? [...evilModels].reduce((s, m) => s + BASE, 0) / evilModels.size  // simplified
      : [...goodModels].reduce((s, m) => s + BASE, 0) / goodModels.size;

    const won = (modelSide === 'good' && goodWon) || (modelSide === 'evil' && !goodWon);
    const before = rating;
    const exp = expectedScore(rating, opponentAvg);
    rating += K * ((won ? 1 : 0) - exp);

    history.push({
      game_id: game.id,
      game_type: game.game_type,
      role: modelSide,
      rating_before: Math.round(before),
      rating_after: Math.round(rating),
      created_at: game.created_at,
    });
  }

  return history;
}

// Legacy stubs — no-ops now
export function initEloTable() {}
export function updateElo() {}
