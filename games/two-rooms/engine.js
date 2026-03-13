/**
 * Two Rooms and a Boom - Game Engine (Simple Mode)
 * 6-10 players, 2 rooms, 3 rounds, 1 hostage exchange per round.
 * Blue: President NOT in same room as Bomber = win.
 * Red: President IN same room as Bomber = win.
 * Grey (Gambler): predict the winner correctly.
 */

import { randomUUID } from 'crypto';

export function createGame(names, options = {}) {
  const count = names.length;
  const model = options.model || 'claude-sonnet-4-5';
  options.modelBlue = options.modelGood || options.modelBlue;
  options.modelRed = options.modelEvil || options.modelRed;

  // Build roles: President (blue), Bomber (red), equal blue/red, Gambler if odd
  const roles = [];
  roles.push({ role: 'president', team: 'blue', label: 'President' });
  roles.push({ role: 'bomber', team: 'red', label: 'Bomber' });

  const hasGambler = count % 2 === 1;
  const slotsLeft = count - 2 - (hasGambler ? 1 : 0);
  const blueCount = slotsLeft / 2;
  const redCount = slotsLeft / 2;

  for (let i = 0; i < blueCount; i++) roles.push({ role: 'member', team: 'blue', label: 'Blue Agent' });
  for (let i = 0; i < redCount; i++) roles.push({ role: 'member', team: 'red', label: 'Red Agent' });
  if (hasGambler) roles.push({ role: 'gambler', team: 'grey', label: 'Gambler' });

  // Shuffle
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }

  const players = names.map((name, i) => ({
    name,
    index: i,
    role: roles[i].role,
    team: roles[i].team,
    label: roles[i].label,
    model: roles[i].team === 'red' ? (options.modelRed || model) :
           roles[i].team === 'blue' ? (options.modelBlue || model) : model,
    room: null,           // 'A' or 'B'
    alive: true,          // always true (no elimination)
  }));

  // Split into 2 rooms as equally as possible
  const shuffledIndices = players.map((_, i) => i).sort(() => Math.random() - 0.5);
  const halfA = Math.ceil(count / 2);
  shuffledIndices.forEach((idx, i) => {
    players[idx].room = i < halfA ? 'A' : 'B';
  });

  return {
    id: randomUUID(),
    players,
    round: 1,
    maxRounds: 3,
    phase: 'discussion',  // discussion | leader_pick | hostage_pick | exchange | gambler_guess | done
    log: [],
    model,
    models: {
      blue: options.modelBlue || model,
      red: options.modelRed || model,
    },
    // Room state
    leaderA: null,        // player index
    leaderB: null,
    hostagesAtoB: [],     // indices moving A->B this round
    hostagesBtoA: [],     // indices moving B->A this round
    // Shared info tracking (who showed what to whom)
    shares: [],           // { from, to, type: 'card'|'color', round }
    // End state
    hasGambler,
    gamblerGuess: null,   // 'blue' or 'red'
    enableThoughts: options.enableThoughts || false,
    createdAt: new Date().toISOString(),
  };
}

export function getPlayersInRoom(game, room) {
  return game.players.filter(p => p.room === room);
}

export function getPlayerIndicesInRoom(game, room) {
  return game.players.map((p, i) => p.room === room ? i : -1).filter(i => i >= 0);
}

export function addShare(game, fromIndex, toIndex, type) {
  game.shares.push({
    from: fromIndex,
    to: toIndex,
    type, // 'card' (full role) or 'color' (team only)
    round: game.round,
  });
  game.log.push({
    type: 'share',
    round: game.round,
    from: fromIndex,
    fromName: game.players[fromIndex].name,
    to: toIndex,
    toName: game.players[toIndex].name,
    shareType: type,
    fromTeam: game.players[fromIndex].team,
    fromLabel: game.players[fromIndex].label,
  });
}

export function setLeader(game, room, playerIndex) {
  if (room === 'A') game.leaderA = playerIndex;
  else game.leaderB = playerIndex;
  game.log.push({
    type: 'leader_elected',
    round: game.round,
    room,
    player: playerIndex,
    playerName: game.players[playerIndex].name,
  });
}

export function setHostages(game, room, hostageIndices) {
  if (room === 'A') game.hostagesAtoB = hostageIndices;
  else game.hostagesBtoA = hostageIndices;
  game.log.push({
    type: 'hostage_selected',
    round: game.round,
    room,
    hostages: hostageIndices.map(i => game.players[i].name),
  });
}

export function executeExchange(game) {
  // Move hostages
  for (const i of game.hostagesAtoB) game.players[i].room = 'B';
  for (const i of game.hostagesBtoA) game.players[i].room = 'A';

  game.log.push({
    type: 'exchange',
    round: game.round,
    aToB: game.hostagesAtoB.map(i => game.players[i].name),
    bToA: game.hostagesBtoA.map(i => game.players[i].name),
  });

  // Reset for next round
  game.hostagesAtoB = [];
  game.hostagesBtoA = [];
}

export function getHostageCount(game) {
  // Simple mode, 6-10 players: always 1 hostage per round
  return 1;
}

export function checkWin(game) {
  const president = game.players.find(p => p.role === 'president');
  const bomber = game.players.find(p => p.role === 'bomber');

  const sameRoom = president.room === bomber.room;

  if (sameRoom) {
    game.winner = 'red';
    game.winReason = 'bomber_with_president';
  } else {
    game.winner = 'blue';
    game.winReason = 'president_safe';
  }

  // Gambler
  if (game.hasGambler && game.gamblerGuess) {
    const gamblerWon = game.gamblerGuess === game.winner;
    game.gamblerResult = gamblerWon ? 'correct' : 'wrong';
  }

  game.phase = 'done';
  game.log.push({
    type: 'game_over',
    winner: game.winner,
    reason: sameRoom ? 'Bomber is in the same room as the President' : 'President is safe from the Bomber',
    presidentRoom: president.room,
    bomberRoom: bomber.room,
  });
}

// What a player knows about others based on shares they received
export function getKnowledge(game, playerIndex) {
  const known = {};
  for (const s of game.shares) {
    if (s.to === playerIndex) {
      const from = game.players[s.from];
      known[s.from] = s.type === 'card'
        ? { name: from.name, team: from.team, role: from.role, label: from.label }
        : { name: from.name, team: from.team };
    }
  }
  return known;
}
