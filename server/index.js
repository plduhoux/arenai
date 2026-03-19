/**
 * ArenAI - Web Server
 * Express API + Vue static frontend
 * Supports multiple game plugins via /games/
 */

import express, { Router } from 'express';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as db from './db.js';
import { runGame, pauseGame, resumeGame, stopGame, listRunningGames } from '../core/game-runner.js';
import { getTokenUsage, setKeyLookup } from '../core/llm-client.js';
import { getGameSessions } from '../core/session-manager.js';
import * as elo from './elo.js';
import { getTokenStats, getTokenGameTypes } from './token-stats.js';

// Wire DB key lookup into LLM client
setKeyLookup((providerId) => db.getProviderWithKey(providerId));

// Game plugins
import * as secretDictator from '../games/secret-dictator/index.js';
import * as werewolf from '../games/werewolf/index.js';
import * as twoRooms from '../games/two-rooms/index.js';

const GAME_PLUGINS = {
  [secretDictator.id]: secretDictator,
  [werewolf.id]: werewolf,
  [twoRooms.id]: twoRooms,
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8085;

const app = express();
const api = Router();

app.use(express.json());

// Active game streams: gameId -> { emitter, events[], game }
const activeGames = new Map();

// --- API Routes ---

api.get('/gametypes', (req, res) => {
  res.json(Object.values(GAME_PLUGINS).map(g => ({
    id: g.id,
    name: g.name,
    description: g.description,
    defaultConfig: g.defaultConfig,
  })));
});

api.get('/token-estimates', (req, res) => {
  try {
  // Average tokens per game type, per model (from finished games)
  const rawDb = db.getDb();
  const games = rawDb.prepare(`
    SELECT game_type, players, session_stats,
           tokens_input, tokens_output,
           tokens_cache_read, tokens_cache_write
    FROM games WHERE status = 'finished'
  `).all();

  // Accumulate: { gameType -> { model -> { totalTokens, count } } }
  const acc = {};
  for (const g of games) {
    const gt = g.game_type;
    if (!acc[gt]) acc[gt] = {};
    const players = JSON.parse(g.players || '[]');
    const sessionStats = g.session_stats ? JSON.parse(g.session_stats) : null;

    if (sessionStats) {
      for (const [key, stats] of Object.entries(sessionStats)) {
        if (!stats.tokens) continue;
        const match = key.match(/^player:(\d+):/);
        if (!match) continue;
        const player = players[parseInt(match[1])];
        if (!player?.model) continue;
        const model = player.model;
        if (!acc[gt][model]) acc[gt][model] = { total: 0, input: 0, output: 0, count: 0 };
        const t = stats.tokens;
        acc[gt][model].input += (t.input || 0);
        acc[gt][model].output += (t.output || 0);
        acc[gt][model].total += (t.input || 0) + (t.output || 0);
      }
      // Count once per model per game
      const seen = new Set();
      for (const p of players) {
        if (p.model && !seen.has(p.model)) {
          seen.add(p.model);
          if (acc[gt][p.model]) acc[gt][p.model].count++;
        }
      }
    } else if (g.tokens_input || g.tokens_output) {
      const modelCounts = {};
      for (const p of players) {
        if (p.model) modelCounts[p.model] = (modelCounts[p.model] || 0) + 1;
      }
      const totalP = Object.values(modelCounts).reduce((a, b) => a + b, 0);
      for (const [model, cnt] of Object.entries(modelCounts)) {
        if (!acc[gt][model]) acc[gt][model] = { total: 0, input: 0, output: 0, count: 0 };
        const ratio = cnt / totalP;
        acc[gt][model].input += Math.round((g.tokens_input || 0) * ratio);
        acc[gt][model].output += Math.round((g.tokens_output || 0) * ratio);
        acc[gt][model].total += Math.round(((g.tokens_input || 0) + (g.tokens_output || 0)) * ratio);
        acc[gt][model].count++;
      }
    }
  }

  // Format: { gameType: { model: { avgTotal, avgInput, avgOutput, gamesPlayed } } }
  const result = {};
  for (const [gt, models] of Object.entries(acc)) {
    result[gt] = {};
    for (const [model, data] of Object.entries(models)) {
      if (data.count === 0) continue;
      result[gt][model] = {
        avgTotal: Math.round(data.total / data.count),
        avgInput: Math.round(data.input / data.count),
        avgOutput: Math.round(data.output / data.count),
        gamesPlayed: data.count,
      };
    }
  }
  res.json(result);
  } catch (err) {
    console.error('token-estimates error:', err);
    res.status(500).json({ error: err.message });
  }
});

api.get('/elo', (req, res) => {
  const excludeModels = req.query.excludeModels ? req.query.excludeModels.split(',') : [];
  res.json(elo.getEloRankings({ excludeModels }));
});
api.get('/elo/:model', (req, res) => res.json(elo.getEloHistory(decodeURIComponent(req.params.model))));
api.get('/stats', (req, res) => {
  const excludeModels = req.query.excludeModels ? req.query.excludeModels.split(',') : [];
  res.json(db.getStats(req.query.gameType, { excludeModels }));
});

api.get('/token-stats', (req, res) => {
  const excludeModels = req.query.excludeModels ? req.query.excludeModels.split(',') : [];
  const gameTypes = getTokenGameTypes({ excludeModels });
  const all = getTokenStats(null, { excludeModels });
  const byGame = {};
  for (const gt of gameTypes) {
    byGame[gt] = getTokenStats(gt, { excludeModels });
  }
  res.json({ ...all, byGame, gameTypes });
});

api.get('/status', (req, res) => {
  const running = listRunningGames();
  res.json({
    running: running.length,
    games: running,
    dbGames: db.listGames(1).length > 0,
  });
});

api.get('/games', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  res.json(db.listGames(limit, offset));
});

api.get('/games/:id', (req, res) => {
  const game = db.getGame(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
});

api.get('/games/:id/logs', (req, res) => {
  const logs = db.getGameLogs(req.params.id);
  if (!logs.length) return res.status(404).json({ error: 'Game not found' });
  res.json(logs);
});

// SSE stream for a game (live or replay buffered events)
api.get('/games/:id/stream', (req, res) => {
  const active = activeGames.get(req.params.id);
  if (!active) {
    return res.status(404).json({ error: 'No active game with this ID' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const send = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
  };

  // Send all buffered events (catch up)
  for (const evt of active.events) {
    send('game', evt);
  }

  // If game already finished, send done and close
  if (active.finished) {
    send('done', active.doneData);
    res.end();
    return;
  }

  // Listen for new events
  const onEvent = (data) => send('game', data);
  const onDone = (data) => { send('done', data); res.end(); };
  const onError = (data) => { send('error', data); res.end(); };

  active.emitter.on('event', onEvent);
  active.emitter.once('done', onDone);
  active.emitter.once('error', onError);

  req.on('close', () => {
    active.emitter.off('event', onEvent);
    active.emitter.off('done', onDone);
    active.emitter.off('error', onError);
  });
});

// Start a new game (returns gameId immediately)
api.post('/games/run', async (req, res) => {
  const {
    gameType = 'secret-dictator',
    playerCount = 7,
    model = 'claude-sonnet-4-5',
    modelGood,
    modelEvil,
    names,
    terms,
    enableThoughts = false,
    winPolicies,
    discussionRounds,
  } = req.body;

  console.log(`[game] New ${gameType}: model=${model}, modelGood=${modelGood}, modelEvil=${modelEvil}, players=${playerCount}`);

  const plugin = GAME_PLUGINS[gameType];
  if (!plugin) {
    return res.status(400).json({ error: `Unknown game type: ${gameType}` });
  }

  if (playerCount < 5 || playerCount > 10) {
    return res.status(400).json({ error: 'Player count must be 5-10' });
  }

  const runningCount = listRunningGames().length;
  if (runningCount >= 20) {
    return res.status(429).json({ error: 'Too many concurrent games (max 20)' });
  }

  // Create emitter for this game
  const emitter = new EventEmitter();
  emitter.setMaxListeners(20);

  let gameRef = null;
  let saveInterval = null;

  const activeGame = {
    emitter,
    events: [],
    finished: false,
    doneData: null,
  };

  // We need the gameId before the game starts running.
  // runGame calls plugin.setup() which creates the game with an ID.
  // We'll capture it from the game_start event.

  const gamePromise = runGame(plugin, {
    playerCount,
    model,
    modelGood,
    modelEvil,
    names,
    terms,
    enableThoughts,
    winPolicies,
    discussionRounds,
    onEvent: (event) => {
      // Capture gameId from game_start
      if (event.type === 'game_start' && event.gameId) {
        activeGames.set(event.gameId, activeGame);
      }
      activeGame.events.push(event);
      emitter.emit('event', event);
    },
    onGameRef: (game) => {
      gameRef = game;

      // Store game ref for session inspector
      activeGame.gameRef = game;

      // Link SSE events to game for DB storage
      game._sseEvents = activeGame.events;

      // Save to DB immediately
      db.saveGame(game);

      // Register in activeGames with the real ID
      activeGames.set(game.id, activeGame);

      // Periodic save every 10 seconds
      saveInterval = setInterval(() => {
        if (gameRef) db.saveGame(gameRef);
      }, 10000);
    },
  });

  // Wait a tick for the game to be set up and get an ID
  // The game starts running asynchronously
  await new Promise(resolve => setTimeout(resolve, 100));

  const gameId = gameRef?.id;
  if (!gameId) {
    // Game failed to start
    return res.status(500).json({ error: 'Failed to start game' });
  }

  // Return gameId immediately (game runs in background)
  res.json({ gameId });

  // Handle game completion
  gamePromise.then(game => {
    clearInterval(saveInterval);
    db.saveGame(game);
    const tokens = getTokenUsage(game.id);
    const doneData = {
      id: game.id,
      status: 'finished',
      gameType: game.gameType,
      winner: game.winner,
      winReason: game.winReason,
      rounds: game.round,
      players: game.players.map(p => ({ name: p.name, alive: p.alive, role: p.role, party: p.party, team: p.team, model: p.model })),
      tokensInput: tokens.input,
      tokensOutput: tokens.output,
      tokensCacheRead: tokens.cacheRead || 0,
      tokensCacheWrite: tokens.cacheWrite || 0,
      tokensTotalSent: tokens.totalSent || 0,
      apiCalls: tokens.calls,
    };

    activeGame.finished = true;
    activeGame.doneData = doneData;
    emitter.emit('done', doneData);

    // Clean up after 5 minutes (let late joiners catch up)
    setTimeout(() => activeGames.delete(game.id), 5 * 60 * 1000);
  }).catch(err => {
    clearInterval(saveInterval);
    if (gameRef) db.saveGame(gameRef);

    emitter.emit('error', { error: err.message });
    if (gameId) {
      setTimeout(() => activeGames.delete(gameId), 60 * 1000);
    }
  });
});

// Battle mode: launch N games with alternating roles
api.post('/games/battle', async (req, res) => {
  const {
    gameType = 'werewolf',
    playerCount = 7,
    modelA,
    modelB,
    count = 10,
    enableThoughts = false,
    terms,
    winPolicies,
    discussionRounds,
  } = req.body;

  if (!modelA || !modelB) {
    return res.status(400).json({ error: 'modelA and modelB are required' });
  }
  if (count < 2 || count > 50) {
    return res.status(400).json({ error: 'count must be 2-50' });
  }

  const plugin = GAME_PLUGINS[gameType];
  if (!plugin) {
    return res.status(400).json({ error: `Unknown game type: ${gameType}` });
  }

  const runningCount = listRunningGames().length;
  if (runningCount + count > 20) {
    return res.status(429).json({ error: `Too many concurrent games. Max 20, currently ${runningCount} running.` });
  }

  console.log(`[battle] ${modelA} vs ${modelB}, ${count} games of ${gameType}`);

  const gameIds = [];

  for (let i = 0; i < count; i++) {
    // Alternate roles each game
    const modelGood = i % 2 === 0 ? modelA : modelB;
    const modelEvil = i % 2 === 0 ? modelB : modelA;

    const emitter = new EventEmitter();
    emitter.setMaxListeners(20);

    let gameRef = null;
    let saveInterval = null;

    const activeGame = {
      emitter,
      events: [],
      finished: false,
      doneData: null,
    };

    const gamePromise = runGame(plugin, {
      playerCount,
      model: modelGood,
      modelGood,
      modelEvil,
      enableThoughts,
      terms,
      winPolicies,
      discussionRounds,
      onEvent: (event) => {
        if (event.type === 'game_start' && event.gameId) {
          activeGames.set(event.gameId, activeGame);
        }
        activeGame.events.push(event);
        emitter.emit('event', event);
      },
      onGameRef: (game) => {
        gameRef = game;
        activeGame.gameRef = game;
        game._sseEvents = activeGame.events;
        db.saveGame(game);
        activeGames.set(game.id, activeGame);
        saveInterval = setInterval(() => {
          if (gameRef) db.saveGame(gameRef);
        }, 10000);
      },
    });

    // Wait for game to initialize
    await new Promise(resolve => setTimeout(resolve, 150));

    if (gameRef?.id) {
      gameIds.push(gameRef.id);
    }

    // Handle completion in background
    gamePromise.then(game => {
      clearInterval(saveInterval);
      db.saveGame(game);
      const tokens = getTokenUsage(game.id);
      const doneData = {
        id: game.id,
        status: 'finished',
        gameType: game.gameType,
        winner: game.winner,
        winReason: game.winReason,
        rounds: game.round,
        players: game.players.map(p => ({ name: p.name, alive: p.alive, role: p.role, party: p.party, team: p.team, model: p.model })),
        tokensInput: tokens.input,
        tokensOutput: tokens.output,
        tokensCacheRead: tokens.cacheRead || 0,
        tokensCacheWrite: tokens.cacheWrite || 0,
        tokensTotalSent: tokens.totalSent || 0,
        apiCalls: tokens.calls,
      };
      activeGame.finished = true;
      activeGame.doneData = doneData;
      emitter.emit('done', doneData);
      setTimeout(() => activeGames.delete(game.id), 5 * 60 * 1000);
    }).catch(err => {
      clearInterval(saveInterval);
      if (gameRef) db.saveGame(gameRef);
      emitter.emit('error', { error: err.message });
      if (gameRef?.id) setTimeout(() => activeGames.delete(gameRef.id), 60 * 1000);
    });
  }

  res.json({ gameIds, count: gameIds.length });
});

// Game controls
api.post('/games/:id/pause', (req, res) => {
  pauseGame(req.params.id);
  res.json({ ok: true, action: 'paused' });
});

api.post('/games/:id/resume', (req, res) => {
  resumeGame(req.params.id);
  res.json({ ok: true, action: 'resumed' });
});

api.post('/games/:id/stop', (req, res) => {
  stopGame(req.params.id);
  res.json({ ok: true, action: 'stopped' });
});

api.put('/games/:id/save', (req, res) => {
  const result = db.toggleSaved(req.params.id);
  if (!result) return res.status(404).json({ error: 'Game not found' });
  res.json({ ok: true, saved: result.saved });
});

// Delete a single game
api.delete('/games/:id', (req, res) => {
  // Don't allow deleting running games
  const running = listRunningGames();
  if (running.some(g => g.id === req.params.id)) {
    return res.status(400).json({ error: 'Cannot delete a running game. Stop it first.' });
  }
  const deleted = db.deleteGame(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Game not found' });
  res.json({ ok: true, deleted: 1 });
});

// Delete all unfinished games
api.delete('/games', (req, res) => {
  if (req.query.status !== 'unfinished') {
    return res.status(400).json({ error: 'Use ?status=unfinished to delete unfinished games' });
  }
  // Don't delete running games
  const running = listRunningGames();
  if (running.length > 0) {
    return res.status(400).json({ error: `${running.length} game(s) still running. Stop them first.` });
  }
  const count = db.deleteUnfinishedGames();
  res.json({ ok: true, deleted: count });
});

// Session inspector: get all player sessions for a game
api.get('/games/:id/sessions', (req, res) => {
  const active = activeGames.get(req.params.id);
  
  // Try live sessions first
  const liveSessions = getGameSessions(req.params.id);
  if (Object.keys(liveSessions).length > 0) {
    // Add player info from game ref
    const players = active?.gameRef?.players || [];
    return res.json({ sessions: liveSessions, players: players.map((p, i) => ({
      index: i, name: p.name, role: p.role, party: p.party, team: p.team, alive: p.alive, model: p.model,
    }))});
  }
  
  // Try finished game sessions stored on game object
  if (active?.gameRef?.sessions) {
    const players = active.gameRef.players || [];
    return res.json({ sessions: active.gameRef.sessions, players: players.map((p, i) => ({
      index: i, name: p.name, role: p.role, party: p.party, team: p.team, alive: p.alive, model: p.model,
    }))});
  }
  
  res.json({ sessions: {}, players: [] });
});

// --- Provider & Model Settings ---

api.get('/providers', (req, res) => {
  res.json(db.listProviders());
});

api.put('/providers/:id', (req, res) => {
  const { api_key, enabled, base_url } = req.body;
  db.updateProvider(req.params.id, { api_key, enabled, base_url });
  res.json({ ok: true });
});

api.put('/models/:id/toggle', (req, res) => {
  const { enabled } = req.body;
  db.toggleModel(req.params.id, enabled);
  res.json({ ok: true });
});

api.get('/models/enabled', (req, res) => {
  res.json(db.listEnabledModels());
});

api.post('/models/test', async (req, res) => {
  const { modelId } = req.body;
  if (!modelId) return res.status(400).json({ error: 'modelId required' });
  const { askLLM } = await import('../core/llm-client.js');
  const question = 'Reply with exactly one word: the color of the sky.';
  try {
    const answer = await askLLM({
      gameId: '_test_',
      model: modelId,
      systemPrompt: 'You are a test. Reply briefly.',
      userPrompt: question,
      playerName: 'Test',
      maxTokens: 1024,
      retries: 0,
    });
    res.json({ ok: true, question, answer });
  } catch (err) {
    res.json({ ok: false, question, error: err.message?.slice(0, 300) });
  }
});

// Mount API before static
app.use('/api', api);

// Static files (Vue build)
// Assets have content hash in filename — cache forever
// HTML must never be cached (to pick up new asset hashes)
app.use('/assets', express.static(join(__dirname, '..', 'public', 'assets'), {
  maxAge: '1y',
  immutable: true,
}));
app.use(express.static(join(__dirname, '..', 'public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));
app.get('/{*splat}', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`ArenAI running on http://localhost:${PORT}`);
  console.log(`Available games: ${Object.keys(GAME_PLUGINS).join(', ')}`);
  db.getDb();
});
