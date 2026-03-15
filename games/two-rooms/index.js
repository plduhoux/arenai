/**
 * Two Rooms and a Boom - Game Plugin
 * Standard plugin interface for the ArenAI.
 */

import * as engine from './engine.js';
import * as prompts from './prompts.js';

export const id = 'two-rooms';
export const name = 'Two Rooms and a Boom';
export const description = 'Two teams, two rooms, one bomb. Blue protects the President. Red sends the Bomber. 3 rounds of social deduction with hostage exchanges.';

export const defaultConfig = {
  playerCount: 8,
  names: ['Alice', 'Bruno', 'Clara', 'David', 'Eva', 'Felix', 'Gina', 'Hugo', 'Iris', 'Jules', 'Karl', 'Luna', 'Max', 'Nina', 'Oscar', 'Petra', 'Quinn', 'Rosa', 'Sven', 'Tina'],
  model: 'claude-sonnet-4-5',
  enableThoughts: false,
};

export function setup(options = {}) {
  const playerCount = options.playerCount || defaultConfig.playerCount;
  const names = (options.names || defaultConfig.names).slice(0, playerCount);
  const model = options.model || defaultConfig.model;

  return engine.createGame(names, {
    model,
    modelBlue: options.modelGood || options.modelBlue || model,
    modelRed: options.modelEvil || options.modelRed || model,
    enableThoughts: options.enableThoughts ?? defaultConfig.enableThoughts,
  });
}

export function isOver(game) {
  return game.phase === 'done';
}

export function recoverFromError(game) {
  if (game.phase === 'discussion') game.phase = 'leader_pick';
  else if (game.phase === 'leader_pick') game.phase = 'hostage_pick';
  else if (game.phase === 'hostage_pick') game.phase = 'exchange';
  else if (game.phase === 'exchange') {
    if (game.round >= game.maxRounds) game.phase = 'gambler_guess';
    else { game.round++; game.phase = 'discussion'; }
  } else if (game.phase === 'gambler_guess') {
    engine.checkWin(game);
  }
}

export function forceEnd(game, reason) {
  game.winner = 'draw';
  game.winReason = reason;
  game.phase = 'done';
  game.log.push({ type: 'game_over', winner: 'draw', reason: `Game ended: ${reason}` });
}

export function getDisplayState(game) {
  const roomA = engine.getPlayersInRoom(game, 'A');
  const roomB = engine.getPlayersInRoom(game, 'B');
  return {
    roomACount: roomA.length,
    roomBCount: roomB.length,
    round: game.round,
    maxRounds: game.maxRounds,
    leaderA: game.leaderA !== null ? game.players[game.leaderA]?.name : null,
    leaderB: game.leaderB !== null ? game.players[game.leaderB]?.name : null,
  };
}

export function getCurrentPhase(game) {
  switch (game.phase) {
    case 'discussion': return { name: 'discussion', execute: phaseDiscussion };
    case 'leader_pick': return { name: 'leader_pick', execute: phaseLeaderPick };
    case 'hostage_pick': return { name: 'hostage_pick', execute: phaseHostagePick };
    case 'exchange': return { name: 'exchange', execute: phaseExchange };
    case 'gambler_guess': return { name: 'gambler_guess', execute: phaseGamblerGuess };
    default: return null;
  }
}

// --- Phases ---

function narrate(onEvent, text) {
  onEvent({ type: 'narrator', message: text });
}

// Discussion — Room Talk (sequential within each room, rooms in parallel)
// Within each room, players speak one at a time so they can react to each other.
// Both rooms run in parallel (they can't hear each other anyway).
async function phaseDiscussion(game, { onEvent, checkPause }) {
  const display = getDisplayState(game);
  // 2 discussion turns per round (including final round)
  const discussionTurns = 2;
  narrate(onEvent, `Round ${game.round}/${game.maxRounds}: Room A (${display.roomACount}) and Room B (${display.roomBCount}). ${discussionTurns} discussion turn(s).`);
  onEvent({ type: 'round_start', round: game.round, ...display });

  for (let turn = 0; turn < discussionTurns; turn++) {
    if (turn > 0) narrate(onEvent, `Discussion turn ${turn + 1}/${discussionTurns}.`);

    // Both rooms discuss in parallel, but within each room it's sequential
    await Promise.all([
      runRoomDiscussion(game, 'A', turn, onEvent, checkPause),
      runRoomDiscussion(game, 'B', turn, onEvent, checkPause),
    ]);
  }

  // Card sharing phase — sequential within each room (rooms in parallel)
  narrate(onEvent, `Card sharing: players may privately show their card to one person in their room.`);
  await Promise.all([
    runRoomCardSharing(game, 'A', onEvent),
    runRoomCardSharing(game, 'B', onEvent),
  ]);

  game.phase = 'leader_pick';
}

// Sequential discussion within a single room
async function runRoomDiscussion(game, room, turn, onEvent, checkPause) {
  const roomPlayers = engine.getPlayerIndicesInRoom(game, room);
  const names = roomPlayers.map(i => game.players[i].name).join(', ');
  onEvent({ type: 'room_header', room, playerCount: roomPlayers.length, playerNames: names });

  // Shuffle speaking order each turn
  const order = [...roomPlayers].sort(() => Math.random() - 0.5);

  for (const playerIndex of order) {
    if (checkPause) await checkPause();
    const result = await prompts.getRoomDiscussion(game, playerIndex, turn);
    const player = game.players[playerIndex];

    if (result.thought) {
      game.log.push({ type: 'thought', round: game.round, room, player: playerIndex, playerName: player.name, message: result.thought });
      onEvent({ type: 'thought', player: player.name, message: result.thought, room });
    }
    if (result.message && result.message !== 'PASS') {
      game.log.push({
        type: 'discussion', round: game.round, room,
        player: playerIndex, playerName: player.name,
        message: result.message,
      });
      onEvent({ type: 'discussion', room, player: player.name, message: result.message });
    }
  }
}

// Sequential card sharing within a single room
async function runRoomCardSharing(game, room, onEvent) {
  const roomPlayers = engine.getPlayerIndicesInRoom(game, room);

  for (const playerIndex of roomPlayers) {
    const result = await prompts.getCardShare(game, playerIndex);
    const player = game.players[playerIndex];

    if (result.thought) {
      game.log.push({ type: 'thought', round: game.round, room, player: playerIndex, playerName: player.name, message: result.thought });
      onEvent({ type: 'thought', player: player.name, message: result.thought, room });
    }

    if (result.share && result.target !== null) {
      const targetPlayer = game.players[result.target];
      if (targetPlayer && targetPlayer.room === room) {
        engine.addShare(game, playerIndex, result.target, result.shareType || 'color');
        onEvent({
          type: 'share', room,
          player: player.name,
          target: targetPlayer.name,
          shareType: result.shareType || 'color',
        });
      }
    }
  }
}

async function phaseLeaderPick(game, { onEvent }) {
  // Elect a leader in each room every round (composition changes after exchanges)
  for (const room of ['A', 'B']) {
    narrate(onEvent, `Room ${room} elects a leader.`);

    const roomPlayers = engine.getPlayerIndicesInRoom(game, room);
    const votePromises = roomPlayers.map(i =>
      prompts.getLeaderVote(game, i).then(pick => ({ voter: i, pick }))
    );
    const votes = await Promise.all(votePromises);

    // Count votes
    const counts = {};
    for (const { voter, pick } of votes) {
      counts[pick] = (counts[pick] || 0) + 1;
      onEvent({ type: 'leader_vote', room, voter: game.players[voter].name, pick: game.players[pick].name });
    }

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const leaderId = parseInt(sorted[0][0]);
    engine.setLeader(game, room, leaderId);

    narrate(onEvent, `${game.players[leaderId].name} is elected leader of Room ${room}.`);
    onEvent({ type: 'leader_elected', room, player: game.players[leaderId].name, ...getDisplayState(game) });
  }

  game.phase = 'hostage_pick';
}

async function phaseHostagePick(game, { onEvent }) {
  const hostageCount = engine.getHostageCount(game);
  narrate(onEvent, `Leaders choose ${hostageCount} hostage(s) to exchange.`);

  // Both leaders pick simultaneously
  const [picksA, picksB] = await Promise.all([
    prompts.getHostagePick(game, game.leaderA),
    prompts.getHostagePick(game, game.leaderB),
  ]);

  engine.setHostages(game, 'A', picksA);
  engine.setHostages(game, 'B', picksB);

  onEvent({
    type: 'hostage_selected',
    roomA: picksA.map(i => game.players[i].name),
    roomB: picksB.map(i => game.players[i].name),
  });

  game.phase = 'exchange';
}

async function phaseExchange(game, { onEvent }) {
  const aToB = game.hostagesAtoB.map(i => game.players[i].name);
  const bToA = game.hostagesBtoA.map(i => game.players[i].name);

  engine.executeExchange(game);

  narrate(onEvent, `Exchange: ${aToB.join(', ')} moved to Room B. ${bToA.join(', ')} moved to Room A.`);
  onEvent({
    type: 'exchange',
    aToB,
    bToA,
    round: game.round,
    ...getDisplayState(game),
  });

  if (game.round >= game.maxRounds) {
    if (game.hasGambler) {
      game.phase = 'gambler_guess';
    } else {
      engine.checkWin(game);
    }
  } else {
    game.round++;
    game.phase = 'discussion';
  }
}

async function phaseGamblerGuess(game, { onEvent }) {
  const gamblerIndex = game.players.findIndex(p => p.role === 'gambler');
  if (gamblerIndex === -1) {
    engine.checkWin(game);
    return;
  }

  narrate(onEvent, `${game.players[gamblerIndex].name} (Gambler) must predict the winner before cards are revealed.`);

  const guess = await prompts.getGamblerGuess(game, gamblerIndex);
  game.gamblerGuess = guess;

  onEvent({
    type: 'gambler_prediction',
    player: game.players[gamblerIndex].name,
    prediction: guess,
  });

  engine.checkWin(game);
}
