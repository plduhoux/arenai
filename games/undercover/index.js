/**
 * Undercover - Game Plugin
 * Standard plugin interface for ArenAI.
 *
 * 4 players: 3 Civilians, 1 Undercover. Each gets a word (similar but different).
 * Nobody knows their role. Give clues, discuss, vote.
 * Civilians win by eliminating the Undercover.
 * Undercover wins by surviving to the final 2.
 */

import * as engine from './engine.js';
import * as prompts from './prompts.js';

export const id = 'undercover';
export const name = 'Undercover';
export const description = 'Word-based social deduction: civilians and an undercover agent have similar but different secret words. Give subtle clues, detect the odd one out.';

export const defaultConfig = {
  playerCount: 4,
  names: ['Alice', 'Bruno', 'Clara', 'David', 'Eva', 'Felix', 'Gina', 'Hugo', 'Iris', 'Jules'],
  model: 'claude-sonnet-4-5',
  enableThoughts: true,
  discussionRounds: 1,
};

export function setup(options = {}) {
  const playerCount = options.playerCount || defaultConfig.playerCount;
  const names = (options.names || defaultConfig.names).slice(0, playerCount);
  const model = options.model || defaultConfig.model;

  return engine.createGame(names, {
    model,
    modelCivilian: options.modelGood || options.modelCivilian || model,
    modelUndercover: options.modelEvil || options.modelUndercover || model,
    enableThoughts: options.enableThoughts ?? defaultConfig.enableThoughts,
    discussionRounds: options.discussionRounds ?? defaultConfig.discussionRounds,
  });
}

export function isOver(game) {
  return game.phase === 'done';
}

export function recoverFromError(game) {
  if (game.phase === 'clue') game.phase = 'discussion';
  else if (game.phase === 'discussion') game.phase = 'vote';
  else { game.phase = 'clue'; game.round++; }
}

export function forceEnd(game, reason) {
  game.winner = 'draw';
  game.winReason = reason;
  game.phase = 'done';
  game.log.push({ type: 'game_over', winner: 'draw', reason: `Game ended: ${reason}` });
}

export function getDisplayState(game) {
  const aliveCivilians = engine.getAliveByParty(game, 'civilian').length;
  const aliveUndercover = engine.getAliveByParty(game, 'undercover').length;
  return {
    aliveCivilians,
    aliveUndercover,
    aliveTotal: aliveCivilians + aliveUndercover,
    round: game.round,
    civilianWord: game.civilianWord,
    undercoverWord: game.undercoverWord,
  };
}

export function getCurrentPhase(game) {
  switch (game.phase) {
    case 'clue': return { name: 'clue', execute: phaseClue };
    case 'discussion': return { name: 'discussion', execute: phaseDiscussion };
    case 'vote': return { name: 'vote', execute: phaseVote };
    default: return null;
  }
}

// --- Phases ---

function narrate(onEvent, text) {
  onEvent({ type: 'narrator', message: text });
}

// Clue Phase: each player gives a clue, one at a time (sequential)
async function phaseClue(game, { onEvent, checkPause }) {
  const alive = engine.getAliveIndices(game);

  narrate(onEvent, `Round ${game.round}: each player gives a clue about their secret word.`);
  onEvent({ type: 'clue_phase_start', round: game.round, ...getDisplayState(game) });

  // Round 1: undercover speaks last so they can hear civilian clues and adapt.
  // Without this, the undercover gives a generic clue blind while civilians
  // cluster tightly, making detection trivial (100% civilian win rate in testing).
  // Later rounds: random order since undercover has enough context to adapt.
  const order = [...alive].sort(() => Math.random() - 0.5);
  if (game.round === 1) {
    const ucIdx = order.findIndex(i => game.players[i].role === 'undercover');
    if (ucIdx >= 0 && ucIdx < order.length - 1) {
      const [uc] = order.splice(ucIdx, 1);
      order.push(uc);
    }
  }

  for (const playerIndex of order) {
    if (checkPause) await checkPause();
    const { clue, thought } = await prompts.getClue(game, playerIndex);

    if (thought) {
      onEvent({ type: 'thought', player: game.players[playerIndex].name, thought });
    }

    game.log.push({
      type: 'clue',
      round: game.round,
      player: playerIndex,
      playerName: game.players[playerIndex].name,
      clue,
    });

    onEvent({
      type: 'clue',
      player: game.players[playerIndex].name,
      clue,
    });
  }

  game.phase = 'discussion';
}

// Discussion Phase: sequential, each player sees previous messages
async function phaseDiscussion(game, { onEvent, checkPause }) {
  const alive = engine.getAliveIndices(game);
  const rounds = Math.max(1, game.discussionRounds || 1);

  narrate(onEvent, `Discussion: who gave a suspicious clue?`);

  for (let dr = 0; dr < rounds; dr++) {
    // Shuffle speaking order, but put mentioned/accused players first after round 0
    const order = getSpeakingOrder(game, alive, dr);

    for (const playerIndex of order) {
      if (checkPause) await checkPause();
      const { stance, message, thought } = await prompts.getDiscussion(game, playerIndex);

      if (thought) {
        onEvent({ type: 'thought', player: game.players[playerIndex].name, thought });
      }

      if (message && message !== 'PASS') {
        game.log.push({
          type: 'discussion',
          round: game.round,
          player: playerIndex,
          playerName: game.players[playerIndex].name,
          message,
        });
        onEvent({
          type: 'discussion',
          player: game.players[playerIndex].name,
          stance,
          message,
        });
      }
    }
  }

  game.phase = 'vote';
}

function getSpeakingOrder(game, alive, roundIndex) {
  if (roundIndex === 0) {
    return [...alive].sort(() => Math.random() - 0.5);
  }

  // Mentioned players first
  const recentMessages = game.log
    .filter(e => e.type === 'discussion' && e.round === game.round)
    .map(e => e.message)
    .join(' ')
    .toLowerCase();

  const mentioned = alive.filter(i => recentMessages.includes(game.players[i].name.toLowerCase()));
  const notMentioned = alive.filter(i => !mentioned.includes(i));

  return [
    ...mentioned.sort(() => Math.random() - 0.5),
    ...notMentioned.sort(() => Math.random() - 0.5),
  ];
}

// Vote Phase: simultaneous
async function phaseVote(game, { onEvent }) {
  const alive = engine.getAliveIndices(game);

  narrate(onEvent, `Vote: eliminate the player you think is the Undercover.`);

  // Simultaneous votes
  const votePromises = alive.map(i => prompts.getVote(game, i).then(v => ({ i, ...v })));
  const votes = await Promise.all(votePromises);

  const voteCounts = {};
  for (const { i, target } of votes) {
    voteCounts[target] = (voteCounts[target] || 0) + 1;
    game.log.push({
      type: 'vote', round: game.round,
      player: i, playerName: game.players[i].name,
      target, targetName: game.players[target].name,
    });
    onEvent({ type: 'vote', player: game.players[i].name, target: game.players[target].name });
  }

  // Find highest
  const sorted = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
  const topVotes = parseInt(sorted[0][1]);
  const tied = sorted.filter(([, count]) => count === topVotes).map(([idx]) => parseInt(idx));

  let eliminatedIndex = null;

  if (tied.length === 1) {
    eliminatedIndex = tied[0];
  } else {
    // Runoff
    narrate(onEvent, `Tie between ${tied.map(i => game.players[i].name).join(' and ')}. Runoff vote.`);
    onEvent({ type: 'runoff', tied: tied.map(i => game.players[i].name) });

    const runoffPromises = alive.map(i => prompts.getRunoffVote(game, i, tied).then(v => ({ i, ...v })));
    const runoffVotes = await Promise.all(runoffPromises);

    const runoffCounts = {};
    for (const { i, target } of runoffVotes) {
      runoffCounts[target] = (runoffCounts[target] || 0) + 1;
      onEvent({ type: 'vote', player: game.players[i].name, target: game.players[target].name });
    }

    const runoffSorted = Object.entries(runoffCounts).sort((a, b) => b[1] - a[1]);
    const runoffTop = parseInt(runoffSorted[0][1]);
    const runoffTied = runoffSorted.filter(([, count]) => count === runoffTop);

    if (runoffTied.length === 1) {
      eliminatedIndex = parseInt(runoffSorted[0][0]);
    }
    // If still tied, random among tied
    if (eliminatedIndex === null) {
      const tiedIndices = runoffTied.map(([idx]) => parseInt(idx));
      eliminatedIndex = tiedIndices[Math.floor(Math.random() * tiedIndices.length)];
      narrate(onEvent, `Still tied. Random elimination.`);
    }
  }

  engine.eliminatePlayer(game, eliminatedIndex);
  const eliminated = game.players[eliminatedIndex];
  narrate(onEvent, `${eliminated.name} is eliminated. They were a ${eliminated.role}.`);
  onEvent({
    type: 'elimination',
    player: eliminated.name,
    role: eliminated.role,
    party: eliminated.party,
    votes: topVotes,
    ...getDisplayState(game),
  });

  if (engine.checkWin(game)) return;

  game.round++;
  game.phase = 'clue';
}
