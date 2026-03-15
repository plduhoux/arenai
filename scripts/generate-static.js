#!/usr/bin/env node
/**
 * ArenAI - Static Site Generator
 *
 * Exports saved games + stats as a fully static site.
 * Output goes to dist/ (ready to deploy anywhere).
 *
 * Usage: node scripts/generate-static.js
 */

import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, cpSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const DATA = join(DIST, 'data');

// Initialize DB
import * as db from '../server/db.js';
import * as elo from '../server/elo.js';
import { getTokenStats, getTokenGameTypes } from '../server/token-stats.js';

console.log('ArenAI Static Generator');
console.log('=======================\n');

// 1. Get saved games
const savedGames = db.listSavedGames();
console.log(`Found ${savedGames.length} saved game(s)`);

if (savedGames.length === 0) {
  console.log('\nNo saved games. Mark games with the ★ button first.');
  process.exit(0);
}

// 2. Create output directories
mkdirSync(DATA, { recursive: true });
mkdirSync(join(DATA, 'games'), { recursive: true });

// 3. Export game list (same format as /api/games)
const gameList = savedGames.map(g => ({
  id: g.id,
  model: g.model,
  game_type: g.game_type,
  player_count: g.player_count,
  rounds: g.rounds,
  winner: g.winner,
  win_reason: g.win_reason,
  players: g.players,
  policies_liberal: g.policies_liberal,
  policies_fascist: g.policies_fascist,
  status: g.status,
  tokens_input: g.tokens_input,
  tokens_output: g.tokens_output,
  api_calls: g.api_calls,
  tokens_cache_read: g.tokens_cache_read,
  tokens_cache_write: g.tokens_cache_write,
  tokens_total_sent: g.tokens_total_sent,
  created_at: g.created_at,
  finished_at: g.finished_at,
}));
writeFileSync(join(DATA, 'games.json'), JSON.stringify(gameList, null, 2));
console.log(`  games.json (${gameList.length} games)`);

// 4. Export each game + its logs
for (const game of savedGames) {
  const gameDir = join(DATA, 'games', game.id);
  mkdirSync(gameDir, { recursive: true });

  // Game detail
  const detail = db.getGame(game.id);
  writeFileSync(join(DATA, 'games', `${game.id}.json`), JSON.stringify(detail, null, 2));

  // Game logs
  const logs = db.getGameLogs(game.id);
  writeFileSync(join(gameDir, 'logs.json'), JSON.stringify(logs, null, 2));
}
console.log(`  Individual game data exported`);

// 5. Export stats (all + per game type)
const statsAll = db.getStats();
writeFileSync(join(DATA, 'stats.json'), JSON.stringify(statsAll, null, 2));
console.log(`  stats.json`);

// 6. Export ELO
const eloData = elo.getEloRankings();
writeFileSync(join(DATA, 'elo.json'), JSON.stringify(eloData, null, 2));
console.log(`  elo.json`);

// 7. Export token stats
const gameTypes = getTokenGameTypes();
const tokenAll = getTokenStats();
const tokenByGame = {};
for (const gt of gameTypes) {
  tokenByGame[gt] = getTokenStats(gt);
}
writeFileSync(join(DATA, 'token-stats.json'), JSON.stringify({ ...tokenAll, byGame: tokenByGame, gameTypes }, null, 2));
console.log(`  token-stats.json`);

// 8. Export status (static)
writeFileSync(join(DATA, 'status.json'), JSON.stringify({ running: 0, games: [], dbGames: true }));

// 9. Build Vue app in static mode
console.log('\nBuilding frontend (static mode)...');
execSync('npx vite build', {
  cwd: join(ROOT, 'client'),
  stdio: 'inherit',
  env: { ...process.env, VITE_STATIC: 'true' },
});

// 10. Copy built assets to dist
// Vite outputs to ../public/ (relative to client/)
// We need to copy public/* to dist/
const publicDir = join(ROOT, 'public');
cpSync(publicDir, DIST, { recursive: true });
console.log('\nCopied built assets to dist/');

// Data files are already in dist/data/

console.log(`\n✓ Static site generated in ${DIST}`);
console.log(`  ${savedGames.length} games, ready to deploy.`);
console.log(`\n  Test locally: cd dist && npx serve .`);
