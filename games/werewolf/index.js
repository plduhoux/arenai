/**
 * Werewolf (Loup-Garou) - Game Plugin
 * Standard plugin interface for the ArenAI.
 */

import * as engine from './engine.js';
import * as prompts from './prompts.js';

export const id = 'werewolf';
export const name = 'Werewolf';
export const description = 'Classic social deduction: villagers hunt werewolves by day, werewolves hunt villagers by night. Features Seer, Witch, Mayor election, and wolf private chat.';

export const defaultConfig = {
  playerCount: 6,
  names: ['Alice', 'Bruno', 'Clara', 'David', 'Eva', 'Felix', 'Gina', 'Hugo', 'Iris', 'Jules'],
  model: 'claude-sonnet-4-5',
  enableThoughts: false,
  discussionRounds: 2,
  winCondition: 'parity',
};

export function setup(options = {}) {
  const playerCount = options.playerCount || defaultConfig.playerCount;
  const names = (options.names || defaultConfig.names).slice(0, playerCount);
  const model = options.model || defaultConfig.model;

  return engine.createGame(names, {
    model,
    modelVillager: options.modelGood || options.modelVillager || model,
    modelWerewolf: options.modelEvil || options.modelWerewolf || model,
    enableThoughts: options.enableThoughts ?? defaultConfig.enableThoughts,
    discussionRounds: options.discussionRounds ?? defaultConfig.discussionRounds,
    winCondition: options.winCondition ?? defaultConfig.winCondition,
  });
}

export function isOver(game) {
  return game.phase === 'done';
}

export function recoverFromError(game) {
  if (game.phase === 'mayor_election') game.phase = 'night';
  else if (game.phase === 'night') game.phase = 'day_discussion';
  else if (game.phase === 'day_discussion') game.phase = 'day_vote';
  else { game.phase = 'night'; game.round++; }
}

export function forceEnd(game, reason) {
  game.winner = 'draw';
  game.winReason = reason;
  game.phase = 'done';
  game.log.push({ type: 'game_over', winner: 'draw', reason: `Game ended: ${reason}` });
}

export function getDisplayState(game) {
  const aliveWolves = engine.getAliveByParty(game, 'werewolf').length;
  const aliveVillagers = engine.getAliveByParty(game, 'villager').length;
  return {
    aliveWolves,
    aliveVillagers,
    aliveTotal: aliveWolves + aliveVillagers,
    round: game.round,
    mayor: game.mayor !== null ? game.players[game.mayor]?.name : null,
  };
}

export function getCurrentPhase(game) {
  switch (game.phase) {
    case 'mayor_election': return { name: 'mayor_election', execute: phaseMayorElection };
    case 'night': return { name: 'night', execute: phaseNight };
    case 'day_discussion': return { name: 'day_discussion', execute: phaseDayDiscussion };
    case 'day_vote': return { name: 'day_vote', execute: phaseDayVote };
    default: return null;
  }
}

// --- Phases ---

function narrate(onEvent, text) {
  onEvent({ type: 'narrator', message: text });
}

// Mayor Election (before Night 1)
async function phaseMayorElection(game, { onEvent }) {
  narrate(onEvent, `Mayor election: each player may run for Mayor. The Mayor breaks ties during elimination votes.`);

  const allIndices = engine.getAliveIndices(game);

  // Get candidacies (parallel)
  const candidacyPromises = allIndices.map(i =>
    prompts.getMayorCandidacy(game, i).then(r => ({ index: i, ...r }))
  );
  const candidacies = await Promise.all(candidacyPromises);

  const candidates = [];
  for (const c of candidacies) {
    if (c.thought) {
      onEvent({ type: 'thought', player: game.players[c.index].name, thought: c.thought });
    }
    game.log.push({
      type: 'mayor_candidacy', round: 0,
      player: c.index, playerName: game.players[c.index].name,
      runs: c.runs, reason: c.reason,
    });
    onEvent({
      type: 'mayor_candidacy',
      player: game.players[c.index].name,
      runs: c.runs,
      reason: c.reason,
    });
    if (c.runs) candidates.push(c.index);
  }

  // If nobody runs, pick 2 random
  if (candidates.length === 0) {
    const shuffled = [...allIndices].sort(() => Math.random() - 0.5);
    candidates.push(shuffled[0], shuffled[1]);
    narrate(onEvent, `Nobody volunteered. ${game.players[candidates[0]].name} and ${game.players[candidates[1]].name} are drafted.`);
  }

  // If only 1 candidate, auto-elected
  if (candidates.length === 1) {
    engine.setMayor(game, candidates[0]);
    narrate(onEvent, `${game.players[candidates[0]].name} is the only candidate and is elected Mayor.`);
    onEvent({ type: 'mayor_elected', player: game.players[candidates[0]].name, ...getDisplayState(game) });
    game.phase = 'night';
    return;
  }

  // Vote (parallel)
  narrate(onEvent, `Candidates: ${candidates.map(i => game.players[i].name).join(', ')}. Everyone votes.`);

  const votePromises = allIndices.map(i =>
    prompts.getMayorVote(game, i, candidates).then(pick => ({ voter: i, pick }))
  );
  const votes = await Promise.all(votePromises);

  const counts = {};
  for (const { voter, pick } of votes) {
    counts[pick] = (counts[pick] || 0) + 1;
    onEvent({ type: 'mayor_vote', voter: game.players[voter].name, pick: game.players[pick].name });
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const topVotes = parseInt(sorted[0][1]);
  const tied = sorted.filter(([, count]) => count === topVotes).map(([idx]) => parseInt(idx));

  let mayorIndex;
  if (tied.length === 1) {
    mayorIndex = tied[0];
  } else {
    // Tie: random among tied
    mayorIndex = tied[Math.floor(Math.random() * tied.length)];
    narrate(onEvent, `Tie in mayor election. ${game.players[mayorIndex].name} selected randomly.`);
  }

  engine.setMayor(game, mayorIndex);
  narrate(onEvent, `${game.players[mayorIndex].name} is elected Mayor.`);
  onEvent({ type: 'mayor_elected', player: game.players[mayorIndex].name, ...getDisplayState(game) });

  game.phase = 'night';
}

// Night Phase
async function phaseNight(game, { onEvent }) {
  narrate(onEvent, `Night ${game.round}: the village sleeps. Werewolves, Seer, and Witch act in secret.`);
  onEvent({ type: 'night_start', round: game.round, ...getDisplayState(game) });

  // Wolf private chat (2 exchanges)
  const wolves = engine.getWolves(game);
  if (wolves.length >= 2) {
    const chatHistory = [];
    for (let turn = 0; turn < 2; turn++) {
      for (const wolf of wolves) {
        const result = await prompts.getWolfChat(game, wolf.index, chatHistory);
        chatHistory.push({ name: game.players[wolf.index].name, message: result.message });
        game.log.push({
          type: 'wolf_chat', round: game.round,
          player: wolf.index, playerName: game.players[wolf.index].name,
          message: result.message, target: result.target,
        });
        onEvent({
          type: 'wolf_chat',
          player: game.players[wolf.index].name,
          message: result.message,
        });
      }
    }
  }

  // Seer + Wolf final vote in parallel
  const [wolfTarget, seerResult] = await Promise.all([
    prompts.wolfChooseTarget(game),
    prompts.seerInspect(game),
  ]);

  // Wolf target
  engine.setWolfTarget(game, wolfTarget);
  onEvent({ type: 'wolf_action', target: game.players[wolfTarget].name });

  // Seer
  if (seerResult !== null) {
    const seerTarget = typeof seerResult === 'object' ? seerResult.target : seerResult;
    if (seerResult?.thought) {
      onEvent({ type: 'thought', player: game.players[game.players.findIndex(p => p.alive && p.role === 'seer')].name, thought: seerResult.thought });
    }
    engine.setSeerInspection(game, seerTarget);
    onEvent({
      type: 'seer_action',
      target: game.players[seerTarget].name,
      result: game.players[seerTarget].party,
    });
  }

  // Witch (needs wolf target)
  const witchResult = await prompts.witchDecide(game, wolfTarget);
  if (witchResult.thought) {
    const witchIdx = game.players.findIndex(p => p.alive && p.role === 'witch');
    if (witchIdx !== -1) onEvent({ type: 'thought', player: game.players[witchIdx].name, thought: witchResult.thought });
  }
  engine.setWitchAction(game, witchResult);
  if (witchResult.save) onEvent({ type: 'witch_save' });
  if (witchResult.killTarget !== null) {
    onEvent({ type: 'witch_kill', target: game.players[witchResult.killTarget].name });
  }

  // Resolve deaths
  const deaths = engine.resolveNight(game);

  if (deaths.length === 0) {
    narrate(onEvent, `Dawn breaks. Everyone survived the night.`);
  } else {
    const deathDescs = deaths.map(d => `${d.name} (${d.role})`).join(' and ');
    narrate(onEvent, `Dawn breaks. ${deathDescs} did not survive the night.`);
  }

  onEvent({
    type: 'dawn',
    deaths: deaths.map(d => ({ name: d.name, role: d.role, cause: d.cause })),
    ...getDisplayState(game),
  });

  // Mayor successor if mayor died
  for (const d of deaths) {
    if (d.index === game.mayor) {
      const successor = await prompts.getMayorSuccessor(game, d.index);
      engine.transferMayor(game, d.index, successor);
      narrate(onEvent, `${d.name} was Mayor. ${game.players[successor].name} is named successor.`);
      onEvent({ type: 'mayor_successor', from: d.name, to: game.players[successor].name });
    }
  }

  if (engine.checkWin(game)) return;

  game.phase = 'day_discussion';
}

// Day Discussion — Village Council (sequential)
// Each player speaks one at a time. Each subsequent speaker sees all previous messages.
// Round 1: randomized order (mayor speaks first if alive).
// Round 2: mentioned/attacked players speak first, then others.
async function phaseDayDiscussion(game, { onEvent }) {
  const alive = engine.getAliveIndices(game);
  const rounds = Math.max(1, game.discussionRounds || 2);

  narrate(onEvent, `Day ${game.round}: ${alive.length} players discuss. ${rounds} rounds of debate. Someone must be eliminated.`);

  for (let dr = 0; dr < rounds; dr++) {
    const speakingOrder = getSpeakingOrder(game, alive, dr);

    for (const playerIndex of speakingOrder) {
      const { stance, message, thought } = await prompts.getDayDiscussion(game, playerIndex);

      if (thought) {
        onEvent({ type: 'thought', player: game.players[playerIndex].name, thought: thought });
      }

      if (message && message !== 'PASS') {
        game.log.push({
          type: 'discussion', round: game.round,
          player: playerIndex, playerName: game.players[playerIndex].name,
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

  game.phase = 'day_vote';
}

// Determine speaking order for a discussion round.
// Round 0: mayor first (if alive), then shuffled others.
// Round 1+: mentioned/attacked players first, then others (shuffled).
function getSpeakingOrder(game, alive, roundIndex) {
  if (roundIndex === 0) {
    // Mayor first, then shuffled
    const order = [...alive].sort(() => Math.random() - 0.5);
    if (game.mayor !== null && order.includes(game.mayor)) {
      const idx = order.indexOf(game.mayor);
      order.splice(idx, 1);
      order.unshift(game.mayor);
    }
    return order;
  }

  // Round 1+: find players mentioned in recent discussion, they go first
  const recentMessages = game.log
    .filter(e => e.type === 'discussion' && e.round === game.round)
    .map(e => e.message)
    .join(' ')
    .toLowerCase();

  const mentioned = alive.filter(i => recentMessages.includes(game.players[i].name.toLowerCase()));
  const notMentioned = alive.filter(i => !mentioned.includes(i));

  // Shuffle within each group
  const shuffleMentioned = [...mentioned].sort(() => Math.random() - 0.5);
  const shuffleOthers = [...notMentioned].sort(() => Math.random() - 0.5);

  return [...shuffleMentioned, ...shuffleOthers];
}

// Day Vote
async function phaseDayVote(game, { onEvent }) {
  const alive = engine.getAliveIndices(game);

  narrate(onEvent, `Vote: everyone must point at a player to eliminate. No abstention.${game.mayor !== null ? ` Mayor (${game.players[game.mayor]?.name}) breaks ties.` : ''}`);

  // Simultaneous votes
  const votePromises = alive.map(i => prompts.getDayVote(game, i).then(v => ({ i, ...v })));
  const votes = await Promise.all(votePromises);

  // Count & display votes
  const voteCounts = {};
  for (const { i, target } of votes) {
    voteCounts[target] = (voteCounts[target] || 0) + 1;
    game.log.push({ type: 'vote', round: game.round, player: i, playerName: game.players[i].name, target, targetName: game.players[target].name });
    onEvent({ type: 'vote', player: game.players[i].name, target: game.players[target].name });
  }

  // Find highest
  const sorted = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
  const topVotes = parseInt(sorted[0][1]);
  const tied = sorted.filter(([, count]) => count === topVotes).map(([idx]) => parseInt(idx));

  let eliminatedIndex = null;

  if (tied.length === 1) {
    eliminatedIndex = tied[0];
  } else if (game.mayor !== null && game.players[game.mayor]?.alive) {
    // Mayor tie-break: find who the mayor voted for among tied
    const mayorVote = votes.find(v => v.i === game.mayor);
    if (mayorVote && tied.includes(mayorVote.target)) {
      eliminatedIndex = mayorVote.target;
      narrate(onEvent, `Tie broken by Mayor ${game.players[game.mayor].name}.`);
    }
  }

  if (eliminatedIndex === null && tied.length > 1) {
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
    } else if (game.mayor !== null && game.players[game.mayor]?.alive) {
      // Mayor breaks runoff tie too
      const mayorRunoff = runoffVotes.find(v => v.i === game.mayor);
      const runoffTiedIndices = runoffTied.map(([idx]) => parseInt(idx));
      if (mayorRunoff && runoffTiedIndices.includes(mayorRunoff.target)) {
        eliminatedIndex = mayorRunoff.target;
        narrate(onEvent, `Runoff tie broken by Mayor.`);
      }
    }
  }

  if (eliminatedIndex !== null) {
    // Mayor successor before elimination
    if (eliminatedIndex === game.mayor) {
      const successor = await prompts.getMayorSuccessor(game, eliminatedIndex);
      engine.transferMayor(game, eliminatedIndex, successor);
      narrate(onEvent, `${game.players[eliminatedIndex].name} was Mayor. ${game.players[successor].name} is named successor.`);
      onEvent({ type: 'mayor_successor', from: game.players[eliminatedIndex].name, to: game.players[successor].name });
    }

    engine.eliminatePlayer(game, eliminatedIndex);
    const eliminated = game.players[eliminatedIndex];
    narrate(onEvent, `${eliminated.name} is eliminated. They were a ${eliminated.role}.`);
    onEvent({
      type: 'elimination',
      player: eliminated.name,
      role: eliminated.role,
      votes: topVotes,
      ...getDisplayState(game),
    });
  } else {
    narrate(onEvent, `Runoff still tied. Nobody is eliminated.`);
    game.log.push({ type: 'no_elimination', round: game.round });
    onEvent({ type: 'no_elimination', ...getDisplayState(game) });
  }

  if (engine.checkWin(game)) return;

  game.round++;
  game.phase = 'night';
}
