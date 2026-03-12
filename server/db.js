/**
 * Secret Hitler — Database (SQLite)
 * Persists games, logs, and stats.
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'games.db');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema() {
  // Migrations
  try { db.exec(`ALTER TABLE games ADD COLUMN model_liberal TEXT`); } catch {}
  try { db.exec(`ALTER TABLE games ADD COLUMN model_fascist TEXT`); } catch {}
  // Rename to generic columns (keep old for migration)
  try { db.exec(`ALTER TABLE games ADD COLUMN model_good TEXT`); } catch {}
  try { db.exec(`ALTER TABLE games ADD COLUMN model_evil TEXT`); } catch {}
  // Migrate old data
  try { db.exec(`UPDATE games SET model_good = model_liberal, model_evil = model_fascist WHERE model_good IS NULL AND model_liberal IS NOT NULL`); } catch {}
  try { db.exec(`ALTER TABLE games ADD COLUMN game_type TEXT DEFAULT 'secret-hitler'`); } catch {}

  // Provider & model configuration
  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      auth_type TEXT NOT NULL DEFAULT 'api_key',
      api_key TEXT,
      base_url TEXT,
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL REFERENCES providers(id),
      model_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      UNIQUE(provider_id, model_id)
    );
  `);

  // Seed default providers if empty
  const providerCount = db.prepare('SELECT COUNT(*) as c FROM providers').get().c;
  if (providerCount === 0) seedDefaults();

  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      player_count INTEGER NOT NULL,
      rounds INTEGER,
      winner TEXT,
      win_reason TEXT,
      players JSON NOT NULL,
      terms JSON,
      policies_liberal INTEGER DEFAULT 0,
      policies_fascist INTEGER DEFAULT 0,
      tokens_input INTEGER DEFAULT 0,
      tokens_output INTEGER DEFAULT 0,
      api_calls INTEGER DEFAULT 0,
      status TEXT DEFAULT 'running',
      created_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS game_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL REFERENCES games(id),
      seq INTEGER NOT NULL,
      type TEXT NOT NULL,
      round INTEGER,
      data JSON NOT NULL,
      UNIQUE(game_id, seq)
    );

    CREATE INDEX IF NOT EXISTS idx_game_logs_game ON game_logs(game_id);
    CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
    CREATE INDEX IF NOT EXISTS idx_games_winner ON games(winner);
  `);
}

function seedDefaults() {
  const providers = [
    { id: 'anthropic', name: 'Anthropic' },
    { id: 'openai', name: 'OpenAI' },
    { id: 'google', name: 'Google' },
    { id: 'xai', name: 'xAI' },
    { id: 'moonshot', name: 'Moonshot' },
  ];

  const models = [
    { provider_id: 'anthropic', model_id: 'claude-opus-4-6', display_name: 'Claude Opus 4.6' },
    { provider_id: 'anthropic', model_id: 'claude-opus-4-5', display_name: 'Claude Opus 4.5' },
    { provider_id: 'anthropic', model_id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6' },
    { provider_id: 'anthropic', model_id: 'claude-sonnet-4-5', display_name: 'Claude Sonnet 4.5' },
    { provider_id: 'anthropic', model_id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5' },
    { provider_id: 'openai', model_id: 'gpt-5.2', display_name: 'GPT-5.2' },
    { provider_id: 'openai', model_id: 'gpt-5', display_name: 'GPT-5' },
    { provider_id: 'openai', model_id: 'gpt-5-mini', display_name: 'GPT-5 Mini' },
    { provider_id: 'google', model_id: 'gemini-2.5-pro', display_name: 'Gemini 2.5 Pro' },
    { provider_id: 'google', model_id: 'gemini-2.5-flash', display_name: 'Gemini 2.5 Flash' },
    { provider_id: 'xai', model_id: 'grok-4', display_name: 'Grok 4' },
    { provider_id: 'xai', model_id: 'grok-4.1-fast', display_name: 'Grok 4.1 Fast' },
    { provider_id: 'moonshot', model_id: 'kimi-k2.5', display_name: 'Kimi K2.5' },
  ];

  const insertProvider = db.prepare('INSERT OR IGNORE INTO providers (id, name) VALUES (?, ?)');
  const insertModel = db.prepare('INSERT OR IGNORE INTO models (id, provider_id, model_id, display_name, enabled) VALUES (?, ?, ?, ?, 1)');

  for (const p of providers) insertProvider.run(p.id, p.name);
  for (const m of models) insertModel.run(`${m.provider_id}/${m.model_id}`, m.provider_id, m.model_id, m.display_name);
}

// --- Provider & Model CRUD ---

export function listProviders() {
  const db = getDb();
  const providers = db.prepare('SELECT * FROM providers ORDER BY name').all();
  for (const p of providers) {
    p.models = db.prepare('SELECT * FROM models WHERE provider_id = ? ORDER BY display_name').all(p.id);
    // Mask API key for frontend
    if (p.api_key) p.has_key = true;
    delete p.api_key;
  }
  return providers;
}

export function getProviderWithKey(providerId) {
  const db = getDb();
  return db.prepare('SELECT * FROM providers WHERE id = ?').get(providerId);
}

export function updateProvider(id, { api_key, enabled, base_url }) {
  const db = getDb();
  if (api_key !== undefined) {
    db.prepare('UPDATE providers SET api_key = ? WHERE id = ?').run(api_key, id);
  }
  if (enabled !== undefined) {
    db.prepare('UPDATE providers SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
  }
  if (base_url !== undefined) {
    db.prepare('UPDATE providers SET base_url = ? WHERE id = ?').run(base_url, id);
  }
}

export function toggleModel(modelId, enabled) {
  const db = getDb();
  db.prepare('UPDATE models SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, modelId);
}

export function listEnabledModels() {
  const db = getDb();
  return db.prepare(`
    SELECT m.id, m.model_id, m.display_name, m.provider_id, p.name as provider_name
    FROM models m JOIN providers p ON m.provider_id = p.id
    WHERE m.enabled = 1 AND p.enabled = 1 AND (p.api_key IS NOT NULL OR p.auth_type = 'oauth_or_key')
    ORDER BY p.name, m.display_name
  `).all();
}

export function saveGame(game) {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO games (id, game_type, model, model_good, model_evil, player_count, rounds, winner, win_reason, players, terms,
                       policies_liberal, policies_fascist, tokens_input, tokens_output, api_calls,
                       status, created_at, finished_at)
    VALUES (@id, @gameType, @model, @modelGood, @modelEvil, @playerCount, @rounds, @winner, @winReason, @players, @terms,
            @liberal, @fascist, @tokensIn, @tokensOut, @apiCalls,
            @status, @createdAt, @finishedAt)
    ON CONFLICT(id) DO UPDATE SET
      rounds = @rounds, winner = @winner, win_reason = @winReason,
      game_type = @gameType,
      model_good = @modelGood, model_evil = @modelEvil,
      policies_liberal = @liberal, policies_fascist = @fascist,
      tokens_input = @tokensIn, tokens_output = @tokensOut, api_calls = @apiCalls,
      status = @status, finished_at = @finishedAt
  `);

  // Derive faction models from player data
  const libPlayer = game.players.find(p => p.party === 'liberal' || p.party === 'villager' || p.team === 'blue');
  const fasPlayer = game.players.find(p => p.party === 'fascist' || p.party === 'werewolf' || p.team === 'red');

  upsert.run({
    id: game.id,
    gameType: game.gameType || 'secret-hitler',
    model: game.model,
    modelGood: libPlayer?.model || game.model,
    modelEvil: fasPlayer?.model || game.model,
    playerCount: game.players.length,
    rounds: game.round,
    winner: game.winner,
    winReason: game.winReason,
    players: JSON.stringify(game.players.map(p => ({
      name: p.name, role: p.role, party: p.party, model: p.model, alive: p.alive,
    }))),
    terms: JSON.stringify(game.terms || null),
    tokensIn: game.tokenUsage?.input || 0,
    tokensOut: game.tokenUsage?.output || 0,
    apiCalls: game.tokenUsage?.calls || 0,
    liberal: game.liberalPolicies,
    fascist: game.fascistPolicies,
    status: game.phase === 'done' ? 'finished' : 'running',
    createdAt: game.createdAt,
    finishedAt: game.phase === 'done' ? new Date().toISOString() : null,
  });

  // Save SSE events (preferred) or fallback to game.log
  const events = game._sseEvents || game.log;

  const insertLog = db.prepare(`
    INSERT OR IGNORE INTO game_logs (game_id, seq, type, round, data)
    VALUES (?, ?, ?, ?, ?)
  `);

  const saveAll = db.transaction(() => {
    events.forEach((entry, i) => {
      insertLog.run(game.id, i, entry.type, entry.round || null, JSON.stringify(entry));
    });
  });

  saveAll();
}

export function listGames(limit = 50, offset = 0) {
  const db = getDb();
  return db.prepare(`
    SELECT id, model, game_type, player_count, rounds, winner, win_reason,
           players, policies_liberal, policies_fascist, status,
           tokens_input, tokens_output, api_calls,
           created_at, finished_at
    FROM games ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset).map(row => ({
    ...row,
    players: JSON.parse(row.players),
  }));
}

export function getGame(id) {
  const db = getDb();
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  if (!game) return null;
  game.players = JSON.parse(game.players);
  return game;
}

export function getGameLogs(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM game_logs WHERE game_id = ? ORDER BY seq').all(id)
    .map(row => ({ ...JSON.parse(row.data), _seq: row.seq }));
}

// Winner labels per game type
const GOOD_WINNERS = ['liberal', 'villager', 'blue'];
const EVIL_WINNERS = ['fascist', 'werewolf', 'red'];

export function getStats(gameType) {
  const db = getDb();
  const where = gameType ? `AND game_type = '${gameType}'` : '';

  const totals = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN winner IN ('liberal','villager','blue') THEN 1 ELSE 0 END) as good_wins,
      SUM(CASE WHEN winner IN ('fascist','werewolf','red') THEN 1 ELSE 0 END) as evil_wins,
      AVG(rounds) as avg_rounds
    FROM games WHERE status = 'finished' ${where}
  `).get();

  const byReason = db.prepare(`
    SELECT win_reason, COUNT(*) as count
    FROM games WHERE status = 'finished' ${where}
    GROUP BY win_reason
  `).all();

  const byModelRaw = db.prepare(`
    SELECT model_good, model_evil, winner, COUNT(*) as count
    FROM games WHERE status = 'finished' ${where}
    GROUP BY model_good, model_evil, winner
  `).all();

  const modelMap = {};
  for (const row of byModelRaw) {
    const mGood = row.model_good || row.model_evil || 'unknown';
    const mEvil = row.model_evil || row.model_good || 'unknown';
    const goodWon = GOOD_WINNERS.includes(row.winner);
    const evilWon = EVIL_WINNERS.includes(row.winner);

    if (!modelMap[mGood]) modelMap[mGood] = { model: mGood, played: 0, wins: 0, asGood: 0, goodWins: 0, asEvil: 0, evilWins: 0 };
    if (!modelMap[mEvil]) modelMap[mEvil] = { model: mEvil, played: 0, wins: 0, asGood: 0, goodWins: 0, asEvil: 0, evilWins: 0 };

    modelMap[mGood].played += row.count;
    modelMap[mGood].asGood += row.count;
    if (goodWon) { modelMap[mGood].wins += row.count; modelMap[mGood].goodWins += row.count; }

    if (mEvil !== mGood) {
      modelMap[mEvil].played += row.count;
    }
    modelMap[mEvil].asEvil += row.count;
    if (evilWon) { modelMap[mEvil].wins += row.count; modelMap[mEvil].evilWins += row.count; }
  }
  const byModel = Object.values(modelMap).sort((a, b) => b.played - a.played);

  // Game type list for tabs
  const gameTypes = db.prepare(`
    SELECT DISTINCT game_type FROM games WHERE status = 'finished'
  `).all().map(r => r.game_type);

  return { totals, byReason, byModel, gameTypes };
}
