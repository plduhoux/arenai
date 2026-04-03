/**
 * Secret Dictator - Game Plugin
 *
 * Exports the standard game plugin interface:
 * - id, name, description
 * - setup(options) -> game state
 * - getCurrentPhase(game) -> { name, execute(game, ctx) }
 * - isOver(game) -> boolean
 * - recoverFromError(game)
 * - forceEnd(game, reason)
 * - getDisplayState(game) -> object for frontend
 */

import * as engine from './engine.js';
import * as prompts from './prompts.js';


export const id = 'secret-dictator';
export const name = 'Secret Dictator';
export const description = 'Social deduction game where Liberal and Fascist factions compete through legislation and deception.';

export const defaultConfig = {
  playerCount: 5,
  names: ['Ada', 'Blaise', 'Claude', 'Dijkstra', 'Euler', 'Turing', 'Lovelace', 'Knuth', 'Hopper', 'Babbage', 'Ritchie', 'Liskov', 'Kernighan', 'Hoare', 'Backus', 'Gosling', 'Torvalds', 'Rossum', 'Wozniak', 'Hamilton'],
  model: 'claude-sonnet-4-5',
  terms: { liberal: 'Liberal', fascist: 'Fascist', dictator: 'Dictator' },
  enableThoughts: false,
  winPolicies: { liberal: 5, fascist: 6 }, // standard rules
};

export function setup(options = {}) {
  const playerCount = options.playerCount || defaultConfig.playerCount;
  const names = (options.names || defaultConfig.names).slice(0, playerCount);
  const model = options.model || defaultConfig.model;
  const terms = { ...defaultConfig.terms, ...options.terms };

  const enableThoughts = options.enableThoughts ?? defaultConfig.enableThoughts;
  const winPolicies = { ...defaultConfig.winPolicies, ...options.winPolicies };

  return engine.createGame(names, {
    model,
    modelLiberal: options.modelGood || options.modelLiberal,
    modelFascist: options.modelEvil || options.modelFascist,
    modelDictator: options.modelEvil || options.modelDictator,
    terms,
    enableThoughts,
    winPolicies,
  });
}

export function isOver(game) {
  return game.phase === 'done';
}

export function recoverFromError(game) {
  game.phase = 'nomination';
  game.round++;
}

export function forceEnd(game, reason) {
  game.winner = 'draw';
  game.winReason = reason;
  game.phase = 'done';
  game.log.push({ type: 'game_over', winner: 'draw', reason: `Game ended: ${reason}` });
}

export function getDisplayState(game) {
  return {
    liberalPolicies: game.liberalPolicies,
    fascistPolicies: game.fascistPolicies,
    liberalTarget: game.winPolicies?.liberal || 5,
    fascistTarget: game.winPolicies?.fascist || 6,
    electionTracker: game.electionTracker,
    deckSize: game.deck.length,
    discardSize: game.discard.length,
  };
}

export function getCurrentPhase(game) {
  switch (game.phase) {
    case 'nomination': return { name: 'nomination', execute: phaseNomination };
    case 'discussion': return { name: 'discussion', execute: phaseDiscussion };
    case 'voting': return { name: 'voting', execute: phaseVoting };
    case 'legislative': return { name: 'legislative', execute: phaseLegislative };
    case 'power': return { name: 'power', execute: phasePower };
    default: return null;
  }
}

// --- Phases ---

function narrate(onEvent, text) {
  onEvent({ type: 'narrator', message: text });
}

async function phaseNomination(game, { onEvent }) {
  const president = engine.getPresident(game);
  const eligible = engine.getEligibleChancellors(game);
  const terms = game.terms || defaultConfig.terms;

  const ineligible = [];
  if (game.previousChancellorIndex !== null) ineligible.push(`${game.players[game.previousChancellorIndex].name} (ex-Chancellor)`);
  if (game.previousPresidentIndex !== null && engine.getAliveIndices(game).length > 5) ineligible.push(`${game.players[game.previousPresidentIndex].name} (ex-President)`);
  const ineligibleStr = ineligible.length ? ` Ineligible: ${ineligible.join(', ')}.` : '';

  narrate(onEvent, `Round ${game.round}: ${president.name} is President. They must nominate a Chancellor from ${eligible.length} eligible players.${ineligibleStr}`);

  onEvent({
    type: 'round_start',
    president: president.name,
    presidentIndex: game.presidentIndex,
    ...getDisplayState(game),
  });

  const chancellorIndex = await prompts.chooseChancellor(game, eligible);
  engine.nominateChancellor(game, chancellorIndex);

  onEvent({
    type: 'nomination',
    president: president.name,
    chancellor: game.players[chancellorIndex].name,
  });
}

async function phaseDiscussion(game, { onEvent, checkPause }) {
  const alive = engine.getAliveIndices(game);
  const president = engine.getPresident(game);
  const chancellor = game.players[game.currentChancellorCandidate];

  const discussionTurns = 2;
  narrate(onEvent, `Discussion phase: ${alive.length} players debate the ${president.name}/${chancellor.name} government before voting. ${discussionTurns} discussion turn(s), players speak one at a time.`);

  for (let turn = 0; turn < discussionTurns; turn++) {
    if (turn > 0) narrate(onEvent, `Discussion turn ${turn + 1}/${discussionTurns}.`);

    // Shuffle speaking order each turn
    const order = [...alive].sort(() => Math.random() - 0.5);

    for (const playerIndex of order) {
      if (checkPause) await checkPause();
      const result = await prompts.getDiscussion(game, playerIndex, turn);
      const player = game.players[playerIndex];

      if (result.thought) {
        game.log.push({ type: 'private_thought', round: game.round, player: playerIndex, playerName: player.name, thought: result.thought });
        onEvent({ type: 'thought', player: player.name, message: result.thought });
      }
      if (result.message && result.message !== 'PASS') {
        engine.recordDiscussion(game, playerIndex, result.message);
        onEvent({ type: 'discussion', player: player.name, message: result.message });
      }
    }
  }

  engine.startVoting(game);
}

async function phaseVoting(game, { onEvent }) {
  const alive = engine.getAliveIndices(game);
  const president = engine.getPresident(game);
  const chancellor = game.players[game.currentChancellorCandidate];

  narrate(onEvent, `Election: all ${alive.length} players vote simultaneously (Ja/Nein) on the ${president.name}/${chancellor.name} government. Strict majority of Ja required to pass.`);

  // SIMULTANEOUS VOTES: all players decide at the same time
  const votePromises = alive.map(i => prompts.getVote(game, i));
  const results = await Promise.all(votePromises);

  // Record all votes, then emit them all at once
  const voteEvents = [];
  for (let j = 0; j < alive.length; j++) {
    const i = alive[j];
    const { vote, reasoning } = results[j];
    engine.castVote(game, i, vote, reasoning);
    voteEvents.push({ type: 'vote', player: game.players[i].name, vote, reasoning });
  }

  // Emit all votes together (frontend can animate them appearing simultaneously)
  for (const ev of voteEvents) {
    onEvent(ev);
  }

  // Resolve
  engine.resolveElection(game);

  const lastElection = game.log.findLast(e => e.type === 'election_result');

  if (lastElection?.passed) {
    // Check Dictator chancellor win condition
    if (game.winner && game.winReason === 'dictator_elected') {
      narrate(onEvent, `The Dictator was elected Chancellor with 3+ fascist policies in play. Fascist victory!`);
    } else {
      narrate(onEvent, `Government elected. The President now draws 3 policy cards, discards 1, and passes 2 to the Chancellor who will enact 1.`);
    }
  } else {
    const tracker = game.electionTracker;
    if (tracker >= 3) {
      narrate(onEvent, `Government rejected. Election tracker reached 3: the top card of the deck is enacted automatically (chaos).`);
    } else {
      narrate(onEvent, `Government rejected (${lastElection?.ja} Ja vs ${lastElection?.nein} Nein). Election tracker: ${tracker}/3. Presidency passes to the next player.`);
    }
  }
  onEvent({
    type: 'election_result',
    passed: lastElection?.passed,
    ja: lastElection?.ja,
    nein: lastElection?.nein,
    ...getDisplayState(game),
  });

  // If chaos enacted a policy
  const lastPolicy = game.log.findLast(e => e.type === 'policy_enacted' && e.chaos);
  if (lastPolicy && lastPolicy.round === game.round) {
    onEvent({
      type: 'policy_enacted',
      policy: lastPolicy.policy,
      liberal: game.liberalPolicies,
      fascist: game.fascistPolicies,
      chaos: true,
    });
  }
}

async function phaseLegislative(game, { onEvent }) {
  const president = engine.getPresident(game);
  const chancellor = game.players[game.currentChancellorCandidate];

  narrate(onEvent, `Legislative session: ${president.name} draws 3 cards, discards 1 secretly, passes 2 to ${chancellor.name} who plays 1. No communication allowed during this phase.`);

  // President discards
  const { discardIndex, claim: presClaim } = await prompts.presidentDiscardChoice(game);
  engine.presidentDiscard(game, discardIndex, presClaim);
  onEvent({ type: 'president_action', president: president.name, claim: presClaim });

  // Veto check: if 5+ fascist policies, chancellor can propose veto
  if (engine.isVetoUnlocked(game)) {
    narrate(onEvent, `Veto power is active (5+ fascist policies). The Chancellor may propose to discard both cards. The President must agree for the veto to pass.`);
    const wantsVeto = await prompts.chancellorVetoChoice(game);
    if (wantsVeto) {
      engine.proposeVeto(game);
      onEvent({ type: 'veto_proposed', chancellor: chancellor.name });

      const accepted = await prompts.presidentVetoDecision(game);
      engine.resolveVeto(game, accepted);
      onEvent({
        type: accepted ? 'veto_accepted' : 'veto_rejected',
        president: president.name,
        ...getDisplayState(game),
      });

      if (accepted) return; // Cards discarded, round over
      // If rejected, chancellor must play normally (fall through)
    }
  }

  // Chancellor plays
  const { playIndex, claim: chancClaim } = await prompts.chancellorPlayChoice(game);
  engine.chancellorPlay(game, playIndex, chancClaim);

  const lastPolicy = game.log.findLast(e => e.type === 'policy_enacted');
  onEvent({
    type: 'policy_enacted',
    policy: lastPolicy?.policy,
    liberal: game.liberalPolicies,
    fascist: game.fascistPolicies,
    ...getDisplayState(game),
  });
}

async function phasePower(game, { onEvent }) {
  const president = engine.getPresident(game);
  const power = game.presidentialPower;

  const powerDescriptions = {
    investigate: `Presidential power: ${president.name} secretly looks at one player's party membership card (not their role). They may lie about what they saw.`,
    special_election: `Presidential power: ${president.name} chooses the next President. After that turn, the rotation returns to normal order.`,
    peek: `Presidential power: ${president.name} secretly looks at the top 3 cards of the policy deck.`,
    kill: `Presidential power: ${president.name} must execute a player. If the Dictator is executed, Liberals win immediately.`,
  };
  narrate(onEvent, powerDescriptions[power] || `Presidential power: ${power}`);
  let eligibleTargets;

  if (power === 'kill' || power === 'investigate') {
    eligibleTargets = engine.getAliveIndices(game).filter(i => i !== game.presidentIndex);
    if (power === 'investigate') {
      eligibleTargets = eligibleTargets.filter(i => !game.players[i].investigated);
    }
  } else if (power === 'special_election') {
    eligibleTargets = engine.getAliveIndices(game).filter(i => i !== game.presidentIndex);
  } else {
    eligibleTargets = [];
  }

  const { targetIndex, claim } = await prompts.choosePowerTarget(game, power, eligibleTargets);
  engine.executePower(game, targetIndex, { claim });

  onEvent({
    type: 'power',
    power,
    president: president.name,
    target: targetIndex !== null ? game.players[targetIndex].name : null,
    ...getDisplayState(game),
  });
}
