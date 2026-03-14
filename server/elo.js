/**
 * ArenAI - ELO Rating System
 *
 * Generic across all game types. Each model gets:
 * - An overall rating
 * - Per-role ratings (good/evil, or specific roles like seer, bomber, etc.)
 *
 * K-factor = 32 (standard for new players, good for our sample sizes)
 */

import { getDb } from './db.js';

const K = 32;
const DEFAULT_ELO = 1500;

// Map game-specific roles to generic sides
const GOOD_ROLES = ['liberal', 'villager', 'seer', 'witch', 'president', 'member:blue'];
const EVIL_ROLES = ['fascist', 'dictator', 'werewolf', 'bomber', 'member:red'];

function getSide(player) {
  if (player.party === 'liberal' || player.party === 'villager' || player.team === 'blue') return 'good';
  if (player.party === 'fascist' || player.party === 'werewolf' || player.team === 'red') return 'evil';
  return 'neutral';
}

function isGoodWinner(winner) {
  return ['liberal', 'villager', 'blue'].includes(winner);
}

export function initEloTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS elo_ratings (
      model TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'overall',
      rating REAL NOT NULL DEFAULT ${DEFAULT_ELO},
      games INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (model, role)
    );

    CREATE TABLE IF NOT EXISTS elo_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL,
      model TEXT NOT NULL,
      role TEXT NOT NULL,
      rating_before REAL NOT NULL,
      rating_after REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_elo_history_model ON elo_history(model);
    CREATE INDEX IF NOT EXISTS idx_elo_history_game ON elo_history(game_id);
  `);
}

function getElo(db, model, role) {
  const row = db.prepare('SELECT rating, games, wins FROM elo_ratings WHERE model = ? AND role = ?').get(model, role);
  return row || { rating: DEFAULT_ELO, games: 0, wins: 0 };
}

function setElo(db, model, role, rating, won) {
  db.prepare(`
    INSERT INTO elo_ratings (model, role, rating, games, wins)
    VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(model, role) DO UPDATE SET
      rating = ?, games = games + 1, wins = wins + ?
  `).run(model, role, rating, won ? 1 : 0, rating, won ? 1 : 0);
}

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function calcNewRating(rating, expected, actual) {
  return rating + K * (actual - expected);
}

/**
 * Update ELO ratings after a game (any game type).
 */
export function updateElo(game) {
  if (!game.winner || game.winner === 'draw') return;

  const db = getDb();
  initEloTable();

  const goodWon = isGoodWinner(game.winner);

  // Group models by side
  const goodModels = new Set();
  const evilModels = new Set();

  for (const p of game.players) {
    const model = p.model || game.model;
    const side = getSide(p);
    if (side === 'good') goodModels.add(model);
    else if (side === 'evil') evilModels.add(model);
  }

  // Compute average ELO per side
  const goodRatings = [...goodModels].map(m => getElo(db, m, 'good').rating);
  const evilRatings = [...evilModels].map(m => getElo(db, m, 'evil').rating);
  const avgGoodElo = goodRatings.length > 0 ? goodRatings.reduce((a, b) => a + b, 0) / goodRatings.length : DEFAULT_ELO;
  const avgEvilElo = evilRatings.length > 0 ? evilRatings.reduce((a, b) => a + b, 0) / evilRatings.length : DEFAULT_ELO;

  const transaction = db.transaction(() => {
    // Update good side
    for (const model of goodModels) {
      const elo = getElo(db, model, 'good');
      const expected = expectedScore(elo.rating, avgEvilElo);
      const actual = goodWon ? 1 : 0;
      const updated = calcNewRating(elo.rating, expected, actual);
      setElo(db, model, 'good', updated, goodWon);

      db.prepare('INSERT INTO elo_history (game_id, model, role, rating_before, rating_after) VALUES (?, ?, ?, ?, ?)')
        .run(game.id, model, 'good', elo.rating, updated);

      // Overall
      const overall = getElo(db, model, 'overall');
      const overallExpected = expectedScore(overall.rating, avgEvilElo);
      const overallUpdated = calcNewRating(overall.rating, overallExpected, actual);
      setElo(db, model, 'overall', overallUpdated, goodWon);
    }

    // Update evil side
    for (const model of evilModels) {
      const elo = getElo(db, model, 'evil');
      const expected = expectedScore(elo.rating, avgGoodElo);
      const actual = goodWon ? 0 : 1;
      const updated = calcNewRating(elo.rating, expected, actual);
      setElo(db, model, 'evil', updated, !goodWon);

      db.prepare('INSERT INTO elo_history (game_id, model, role, rating_before, rating_after) VALUES (?, ?, ?, ?, ?)')
        .run(game.id, model, 'evil', elo.rating, updated);

      // Overall (skip if same model on both sides)
      if (!goodModels.has(model)) {
        const overall = getElo(db, model, 'overall');
        const overallExpected = expectedScore(overall.rating, avgGoodElo);
        const overallUpdated = calcNewRating(overall.rating, overallExpected, actual);
        setElo(db, model, 'overall', overallUpdated, !goodWon);
      }
    }
  });

  transaction();
}

/**
 * Get current ELO rankings.
 */
export function getEloRankings() {
  const db = getDb();
  initEloTable();

  const all = db.prepare(`
    SELECT model, role, rating, games, wins
    FROM elo_ratings ORDER BY rating DESC
  `).all();

  const overall = all
    .filter(r => r.role === 'overall')
    .map(r => ({
      model: r.model,
      rating: Math.round(r.rating),
      games: r.games,
      wins: r.wins,
      winRate: r.games > 0 ? Math.round((r.wins / r.games) * 100) : 0,
    }))
    .sort((a, b) => b.rating - a.rating);

  const byRole = {};
  for (const role of ['good', 'evil']) {
    byRole[role] = all
      .filter(r => r.role === role)
      .map(r => ({
        model: r.model,
        rating: Math.round(r.rating),
        games: r.games,
        wins: r.wins,
        winRate: r.games > 0 ? Math.round((r.wins / r.games) * 100) : 0,
      }))
      .sort((a, b) => b.rating - a.rating);
  }

  return { overall, byRole };
}

/**
 * Get ELO history for a model.
 */
export function getEloHistory(model) {
  const db = getDb();
  initEloTable();

  return db.prepare(`
    SELECT game_id, role, rating_before, rating_after, created_at
    FROM elo_history WHERE model = ? ORDER BY id ASC
  `).all(model);
}
