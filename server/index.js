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

// Wire DB key lookup into LLM client
setKeyLookup((providerId) => db.getProviderWithKey(providerId));

// Game plugins
import * as secretHitler from '../games/secret-hitler/index.js';
import * as werewolf from '../games/werewolf/index.js';
import * as twoRooms from '../games/two-rooms/index.js';

const GAME_PLUGINS = {
  [secretHitler.id]: secretHitler,
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

api.get('/elo', (req, res) => res.json(elo.getEloRankings()));
api.get('/elo/:model', (req, res) => res.json(elo.getEloHistory(decodeURIComponent(req.params.model))));
api.get('/stats', (req, res) => res.json(db.getStats(req.query.gameType)));

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
    gameType = 'secret-hitler',
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
  if (runningCount >= 3) {
    return res.status(429).json({ error: 'Too many concurrent games' });
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
    elo.updateElo(game);

    const tokens = getTokenUsage(game.id);
    const doneData = {
      id: game.id,
      status: 'finished',
      winner: game.winner,
      winReason: game.winReason,
      rounds: game.round,
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
      maxTokens: 20,
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
app.use(express.static(join(__dirname, '..', 'public')));
app.get('/{*splat}', (req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`ArenAI running on http://localhost:${PORT}`);
  console.log(`Available games: ${Object.keys(GAME_PLUGINS).join(', ')}`);
  db.getDb();
  elo.initEloTable();
});
