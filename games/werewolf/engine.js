/**
 * Werewolf (Loup-Garou) - Game Engine
 * 6 players: 2 Werewolves, 1 Seer, 1 Witch, 2 Villagers
 * Night: wolves vote kill, seer inspects, witch saves/poisons
 * Day: discussion + vote to eliminate
 * Win: wolves eliminated = villager win, wolves >= villagers = wolf win
 */

import { randomUUID } from 'crypto';

const ROLES = {
  werewolf: { party: 'werewolf', name: 'Werewolf' },
  seer: { party: 'villager', name: 'Seer' },
  witch: { party: 'villager', name: 'Witch' },
  villager: { party: 'villager', name: 'Villager' },
};

// Role distribution: scales with player count
// 6-10: 2 wolves, 1 seer, 1 witch, rest villagers
// 11-14: 3 wolves, 1 seer, 1 witch, rest villagers
// 15-20: 4 wolves, 1 seer, 1 witch, rest villagers
function assignRoles(count) {
  const wolfCount = count <= 10 ? 2 : count <= 14 ? 3 : 4;
  const roles = [];
  for (let i = 0; i < wolfCount; i++) roles.push('werewolf');
  roles.push('seer', 'witch');
  while (roles.length < count) roles.push('villager');
  // Shuffle
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  return roles;
}

export function createGame(names, options = {}) {
  const count = names.length;
  const roles = assignRoles(count);
  const model = options.model || 'claude-sonnet-4-5';

  const models = {
    villager: options.modelGood || options.modelVillager || model,
    werewolf: options.modelEvil || options.modelWerewolf || model,
  };

  const players = names.map((name, i) => ({
    name,
    role: roles[i],
    party: ROLES[roles[i]].party,
    model: ROLES[roles[i]].party === 'werewolf' ? models.werewolf : models.villager,
    alive: true,
  }));

  return {
    id: randomUUID(),
    players,
    round: 1,           // day number
    phase: 'mayor_election', // mayor_election | night | day_discussion | day_vote | done
    log: [],
    model,
    models,
    // Night state
    wolfTarget: null,     // index of wolf target
    seerResult: null,     // { target, party }
    witchSaveAvailable: true,
    witchKillAvailable: true,
    witchSaveUsed: false,
    witchKillTarget: null,
    // Day state
    pendingDeath: null,   // who dies at dawn (wolf kill, unless witch saved)
    // Mayor
    mayor: null,          // player index
    // Options
    discussionRounds: options.discussionRounds || 1,
    winCondition: options.winCondition || 'parity', // 'parity' or 'elimination'
    enableThoughts: options.enableThoughts || false,
    createdAt: new Date().toISOString(),
  };
}

export function getAlive(game) {
  return game.players.filter(p => p.alive);
}

export function getAliveIndices(game) {
  return game.players.map((p, i) => p.alive ? i : -1).filter(i => i >= 0);
}

export function getAliveByParty(game, party) {
  return game.players.filter(p => p.alive && p.party === party);
}

export function getWolves(game) {
  return game.players
    .map((p, i) => ({ ...p, index: i }))
    .filter(p => p.alive && p.role === 'werewolf');
}

// --- Night Actions ---

export function setWolfTarget(game, targetIndex) {
  game.wolfTarget = targetIndex;
  game.log.push({
    type: 'wolf_vote',
    round: game.round,
    target: targetIndex,
    targetName: game.players[targetIndex].name,
  });
}

export function setSeerInspection(game, targetIndex) {
  const target = game.players[targetIndex];
  game.seerResult = { target: targetIndex, party: target.party };
  game.log.push({
    type: 'seer_inspect',
    round: game.round,
    target: targetIndex,
    targetName: target.name,
    result: target.party,
  });
}

export function setWitchAction(game, { save, killTarget }) {
  if (save && game.witchSaveAvailable) {
    game.witchSaveUsed = true;
    game.witchSaveAvailable = false;
    game.log.push({ type: 'witch_save', round: game.round });
  }
  if (killTarget !== null && killTarget !== undefined && game.witchKillAvailable) {
    game.witchKillTarget = killTarget;
    game.witchKillAvailable = false;
    game.log.push({
      type: 'witch_kill',
      round: game.round,
      target: killTarget,
      targetName: game.players[killTarget].name,
    });
  }
}

// Resolve night: apply deaths
export function resolveNight(game) {
  const deaths = [];

  // Wolf kill (unless witch saved)
  if (game.wolfTarget !== null && !game.witchSaveUsed) {
    game.players[game.wolfTarget].alive = false;
    deaths.push({
      index: game.wolfTarget,
      name: game.players[game.wolfTarget].name,
      role: game.players[game.wolfTarget].role,
      cause: 'werewolf',
    });
  }

  // Witch poison kill
  if (game.witchKillTarget !== null) {
    if (game.players[game.witchKillTarget].alive) {
      game.players[game.witchKillTarget].alive = false;
      deaths.push({
        index: game.witchKillTarget,
        name: game.players[game.witchKillTarget].name,
        role: game.players[game.witchKillTarget].role,
        cause: 'witch',
      });
    }
  }

  game.log.push({
    type: 'dawn',
    round: game.round,
    deaths: deaths.map(d => ({ name: d.name, cause: d.cause })),
  });

  // Reset night state
  game.wolfTarget = null;
  game.seerResult = null;
  game.witchSaveUsed = false;
  game.witchKillTarget = null;

  return deaths;
}

// --- Day Actions ---

export function eliminatePlayer(game, targetIndex) {
  game.players[targetIndex].alive = false;
  game.log.push({
    type: 'elimination',
    round: game.round,
    target: targetIndex,
    targetName: game.players[targetIndex].name,
    role: game.players[targetIndex].role,
  });
}

// --- Win Check ---

export function checkWin(game) {
  const aliveWolves = getAliveByParty(game, 'werewolf').length;
  const aliveVillagers = getAliveByParty(game, 'villager').length;

  if (aliveWolves === 0) {
    game.winner = 'villager';
    game.winReason = 'wolves_eliminated';
    game.phase = 'done';
    game.log.push({ type: 'game_over', winner: 'villager', reason: 'All werewolves eliminated' });
    return true;
  }

  if (game.winCondition === 'parity') {
    // Foaster rules: wolves win at parity
    if (aliveWolves >= aliveVillagers) {
      game.winner = 'werewolf';
      game.winReason = 'wolves_parity';
      game.phase = 'done';
      game.log.push({ type: 'game_over', winner: 'werewolf', reason: 'Werewolves equal or outnumber villagers' });
      return true;
    }
  } else {
    // Official rules: wolves win when all villagers dead
    if (aliveVillagers === 0) {
      game.winner = 'werewolf';
      game.winReason = 'villagers_eliminated';
      game.phase = 'done';
      game.log.push({ type: 'game_over', winner: 'werewolf', reason: 'All villagers eliminated' });
      return true;
    }
  }

  return false;
}

export function setMayor(game, playerIndex) {
  game.mayor = playerIndex;
  game.log.push({
    type: 'mayor_elected',
    round: 0,
    player: playerIndex,
    playerName: game.players[playerIndex].name,
  });
}

export function transferMayor(game, fromIndex, toIndex) {
  game.mayor = toIndex;
  game.log.push({
    type: 'mayor_successor',
    round: game.round,
    from: fromIndex,
    fromName: game.players[fromIndex].name,
    to: toIndex,
    toName: game.players[toIndex].name,
  });
}
