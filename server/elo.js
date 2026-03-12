/**
 * ArenAI — ELO Rating System
 * 
 * Each model gets an ELO rating per faction role:
 * - "sonnet:liberal", "sonnet:fascist", "opus:hitler", etc.
 * - Plus an overall rating per model
 * 
 * After each game, ratings are updated based on outcome.
 * K-factor = 32 (standard for new players, good for our sample sizes)
 */

import { getDb } from './db.js';

const K = 32;
const DEFAULT_ELO = 1500;

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

function newRating(rating, expected, actual) {
  return rating + K * (actual - expected);
}

/**
 * Update ELO ratings after a game.
 * @param {object} game - finished game object with players and winner
 */
export function updateElo(game) {
  if (!game.winner || game.winner === 'draw') return;

  const db = getDb();
  initEloTable();

  // Group models by side
  const liberalModels = new Set();
  const fascistModels = new Set();
  let hitlerModel = null;

  for (const p of game.players) {
    const model = p.model || game.model;
    if (p.role === 'liberal') liberalModels.add(model);
    else if (p.role === 'fascist') fascistModels.add(model);
    else if (p.role === 'hitler') hitlerModel = model;
  }

  // Also add hitler to fascist side for overall
  if (hitlerModel) fascistModels.add(hitlerModel);

  const liberalWon = game.winner === 'liberal';

  // Compute average ELO per side for matchup calculation
  const libRatings = [...liberalModels].map(m => getElo(db, m, 'liberal').rating);
  const fasRatings = [...fascistModels].map(m => getElo(db, m, 'fascist').rating);
  const avgLibElo = libRatings.reduce((a, b) => a + b, 0) / libRatings.length;
  const avgFasElo = fasRatings.reduce((a, b) => a + b, 0) / fasRatings.length;

  const transaction = db.transaction(() => {
    // Update each liberal model
    for (const model of liberalModels) {
      // Per-faction rating
      const elo = getElo(db, model, 'liberal');
      const expected = expectedScore(elo.rating, avgFasElo);
      const actual = liberalWon ? 1 : 0;
      const updated = newRating(elo.rating, expected, actual);
      setElo(db, model, 'liberal', updated, liberalWon);

      db.prepare('INSERT INTO elo_history (game_id, model, role, rating_before, rating_after) VALUES (?, ?, ?, ?, ?)')
        .run(game.id, model, 'liberal', elo.rating, updated);

      // Overall rating
      const overall = getElo(db, model, 'overall');
      const overallExpected = expectedScore(overall.rating, avgFasElo);
      const overallUpdated = newRating(overall.rating, overallExpected, actual);
      setElo(db, model, 'overall', overallUpdated, liberalWon);
    }

    // Update each fascist model (non-hitler)
    for (const model of fascistModels) {
      if (model === hitlerModel && liberalModels.has(model)) continue; // avoid double-counting
      const elo = getElo(db, model, 'fascist');
      const expected = expectedScore(elo.rating, avgLibElo);
      const actual = liberalWon ? 0 : 1;
      const updated = newRating(elo.rating, expected, actual);
      setElo(db, model, 'fascist', updated, !liberalWon);

      db.prepare('INSERT INTO elo_history (game_id, model, role, rating_before, rating_after) VALUES (?, ?, ?, ?, ?)')
        .run(game.id, model, 'fascist', elo.rating, updated);

      // Overall
      const overall = getElo(db, model, 'overall');
      const overallExpected = expectedScore(overall.rating, avgLibElo);
      const overallUpdated = newRating(overall.rating, overallExpected, actual);
      setElo(db, model, 'overall', overallUpdated, !liberalWon);
    }

    // Update hitler model specifically
    if (hitlerModel) {
      const elo = getElo(db, hitlerModel, 'hitler');
      const expected = expectedScore(elo.rating, avgLibElo);
      const actual = liberalWon ? 0 : 1;
      const updated = newRating(elo.rating, expected, actual);
      setElo(db, hitlerModel, 'hitler', updated, !liberalWon);

      db.prepare('INSERT INTO elo_history (game_id, model, role, rating_before, rating_after) VALUES (?, ?, ?, ?, ?)')
        .run(game.id, hitlerModel, 'hitler', elo.rating, updated);
    }
  });

  transaction();
}

/**
 * Get current ELO rankings
 */
export function getEloRankings() {
  const db = getDb();
  initEloTable();

  const all = db.prepare(`
    SELECT model, role, rating, games, wins
    FROM elo_ratings
    ORDER BY rating DESC
  `).all();

  // Group by model
  const byModel = {};
  for (const row of all) {
    if (!byModel[row.model]) byModel[row.model] = {};
    byModel[row.model][row.role] = {
      rating: Math.round(row.rating),
      games: row.games,
      wins: row.wins,
      winRate: row.games > 0 ? Math.round((row.wins / row.games) * 100) : 0,
    };
  }

  // Overall leaderboard
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

  // Per-role leaderboards
  const byRole = {};
  for (const role of ['liberal', 'fascist', 'hitler']) {
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

  return { overall, byRole, byModel };
}

/**
 * Get ELO history for a model
 */
export function getEloHistory(model) {
  const db = getDb();
  initEloTable();

  return db.prepare(`
    SELECT game_id, role, rating_before, rating_after, created_at
    FROM elo_history
    WHERE model = ?
    ORDER BY id ASC
  `).all(model);
}
