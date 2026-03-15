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
import { mkdirSync, writeFileSync } from 'fs';
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

// 1. Check saved games
const savedGames = db.listSavedGames();
console.log(`Found ${savedGames.length} saved game(s)`);

if (savedGames.length === 0) {
  console.log('\nNo saved games. Mark games with the ★ button first.');
  process.exit(0);
}

// 2. Build Vue app FIRST (Vite cleans the output dir)
console.log('\nBuilding frontend (static mode)...');
execSync(`npx vite build --outDir ${DIST}`, {
  cwd: join(ROOT, 'client'),
  stdio: 'inherit',
  env: { ...process.env, VITE_STATIC: 'true' },
});

// 3. Generate data AFTER build (so Vite doesn't delete it)
console.log('\nExporting data...');
mkdirSync(DATA, { recursive: true });
mkdirSync(join(DATA, 'games'), { recursive: true });

// 4. Export game list
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

// 5. Export each game + its logs
for (const game of savedGames) {
  const gameDir = join(DATA, 'games', game.id);
  mkdirSync(gameDir, { recursive: true });

  const detail = db.getGame(game.id);
  writeFileSync(join(DATA, 'games', `${game.id}.json`), JSON.stringify(detail, null, 2));

  const logs = db.getGameLogs(game.id);
  writeFileSync(join(gameDir, 'logs.json'), JSON.stringify(logs, null, 2));
}
console.log(`  Individual game data exported`);

// 6. Export stats
const statsAll = db.getStats();
writeFileSync(join(DATA, 'stats.json'), JSON.stringify(statsAll, null, 2));
console.log(`  stats.json`);

// 7. Export ELO
const eloData = elo.getEloRankings();
writeFileSync(join(DATA, 'elo.json'), JSON.stringify(eloData, null, 2));
console.log(`  elo.json`);

// 8. Export token stats
const gameTypes = getTokenGameTypes();
const tokenAll = getTokenStats();
const tokenByGame = {};
for (const gt of gameTypes) {
  tokenByGame[gt] = getTokenStats(gt);
}
writeFileSync(join(DATA, 'token-stats.json'), JSON.stringify({ ...tokenAll, byGame: tokenByGame, gameTypes }, null, 2));
console.log(`  token-stats.json`);

// 9. Export status (static placeholder)
writeFileSync(join(DATA, 'status.json'), JSON.stringify({ running: 0, games: [], dbGames: true }));

// 10. SPA fallback
import { copyFileSync } from 'fs';
copyFileSync(join(DIST, 'index.html'), join(DIST, '404.html'));

// .htaccess for Apache (OVH, etc.)
writeFileSync(join(DIST, '.htaccess'), `RewriteEngine On
RewriteBase /
RewriteRule ^index\\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
`);
console.log(`  404.html + .htaccess (SPA fallback)`);

console.log(`\n✓ Static site generated in ${DIST}`);
console.log(`  ${savedGames.length} games, ready to deploy.`);
console.log(`\n  Test locally: cd dist && python3 -m http.server 8086`);
