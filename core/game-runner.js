/**
 * Generic Game Runner
 * Orchestrates any turn-based game with LLM players.
 * Each game plugin exports phases, and the runner executes them in sequence.
 */

import { getTokenUsage, FatalLLMError } from './llm-client.js';
import { clearGameSessions, getGameSessions } from './session-manager.js';

// Game control: pause/resume/stop
const gameControls = new Map();

export function pauseGame(gameId) {
  const ctrl = gameControls.get(gameId);
  if (ctrl) { ctrl.paused = true; ctrl.stopped = false; }
}

export function resumeGame(gameId) {
  const ctrl = gameControls.get(gameId);
  if (ctrl && ctrl.paused) {
    ctrl.paused = false;
    if (ctrl.resumeResolve) { ctrl.resumeResolve(); ctrl.resumeResolve = null; }
  }
}

export function stopGame(gameId) {
  const ctrl = gameControls.get(gameId);
  if (ctrl) {
    ctrl.stopped = true;
    ctrl.paused = false;
    if (ctrl.resumeResolve) { ctrl.resumeResolve(); ctrl.resumeResolve = null; }
  }
}

export function getGameControl(gameId) {
  return gameControls.get(gameId);
}

export function listRunningGames() {
  return [...gameControls.entries()]
    .filter(([, c]) => !c.stopped)
    .map(([id, c]) => ({ id, paused: c.paused }));
}

export async function runGame(gamePlugin, options = {}) {
  const onEvent = options.onEvent || (() => {});

  // Let the plugin create and setup the game
  const game = gamePlugin.setup(options);

  const control = { paused: false, stopped: false, resumeResolve: null };
  gameControls.set(game.id, control);

  // Tag game with type for DB
  game.gameType = gamePlugin.id;

  // Pass game reference to server for DB saves
  const onGameRef = options.onGameRef || (() => {});
  onGameRef(game);

  onEvent({
    type: 'game_start',
    gameId: game.id,
    gameType: gamePlugin.id,
    players: game.players.map(p => ({ name: p.name, alive: p.alive, role: p.role, party: p.party, team: p.team, model: p.model })),
  });

  // Safety limit: count actual game rounds, not phase iterations
  const maxRounds = options.maxRounds || 50;
  let iterations = 0;
  const maxIterations = maxRounds * 6; // ~6 phases per round max

  while (!gamePlugin.isOver(game) && game.round <= maxRounds && iterations++ < maxIterations) {
    // Check stop
    if (control.stopped) {
      gamePlugin.forceEnd(game, 'stopped_by_user');
      break;
    }

    // Check pause: wait until resumed
    if (control.paused) {
      onEvent({ type: 'game_paused', round: game.round });
      await new Promise(resolve => { control.resumeResolve = resolve; });
      if (control.stopped) { gamePlugin.forceEnd(game, 'stopped_by_user'); break; }
      onEvent({ type: 'game_resumed', round: game.round });
    }

    try {
      const phase = gamePlugin.getCurrentPhase(game);
      if (!phase) break;

      await phase.execute(game, {
        onEvent: (event) => {
          const tokens = getTokenUsage(game.id);
          onEvent({
            ...event,
            round: game.round,
            tokensInput: tokens.input,
            tokensOutput: tokens.output,
            tokensCacheRead: tokens.cacheRead || 0,
            tokensCacheWrite: tokens.cacheWrite || 0,
            tokensTotalSent: tokens.totalSent || 0,
            apiCalls: tokens.calls,
          });
        },
        // Allow phases to check pause/stop between sequential calls
        async checkPause() {
          if (control.stopped) throw new Error('GAME_STOPPED');
          if (control.paused) {
            onEvent({ type: 'game_paused', round: game.round });
            await new Promise(resolve => { control.resumeResolve = resolve; });
            if (control.stopped) throw new Error('GAME_STOPPED');
            onEvent({ type: 'game_resumed', round: game.round });
          }
        },
      });
    } catch (err) {
      if (err.message === 'GAME_STOPPED') {
        gamePlugin.forceEnd(game, 'stopped_by_user');
        break;
      }

      console.error(`Error in round ${game.round}:`, err.message, err.stack);
      game.log.push({ type: 'error', round: game.round, message: err.message });
      onEvent({ type: 'error', round: game.round, message: err.message });

      // All LLM errors after retries are fatal — stop the game
      console.error('LLM error after retries — stopping game.');
      gamePlugin.forceEnd(game, 'llm_error');
      game.errorStatus = true;
      break;
    }
  }

  // Finalize
  if (!gamePlugin.isOver(game)) {
    gamePlugin.forceEnd(game, 'max_rounds');
  }

  game.tokenUsage = getTokenUsage(game.id);
  game.sessions = getGameSessions(game.id); // Save sessions for prompt inspector
  // Full sessions for DB persistence (system prompt + messages + tokens)
  game.sessionStats = {};
  for (const [key, session] of Object.entries(game.sessions)) {
    game.sessionStats[key] = {
      systemPrompt: session.systemPrompt,
      messages: session.messages,
      tokens: session.tokens,
      messageCount: session.messageCount,
    };
  }
  clearGameSessions(game.id);
  gameControls.delete(game.id);

  onEvent({
    type: 'game_end',
    winner: game.winner,
    reason: game.winReason,
    round: game.round,
  });

  return game;
}
