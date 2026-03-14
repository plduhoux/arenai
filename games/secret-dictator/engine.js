/**
 * Secret Dictator — Game Engine
 * Core game state, rules, and logic.
 */

// Role distribution by player count
const ROLE_DISTRIBUTION = {
  5:  { liberals: 3, fascists: 1, dictator: 1 },
  6:  { liberals: 4, fascists: 1, dictator: 1 },
  7:  { liberals: 4, fascists: 2, dictator: 1 },
  8:  { liberals: 5, fascists: 2, dictator: 1 },
  9:  { liberals: 5, fascists: 3, dictator: 1 },
  10: { liberals: 6, fascists: 3, dictator: 1 },
};

// Presidential powers by player count bracket
const POWERS = {
  small: {  // 5-6 players
    1: null, 2: null, 3: 'peek', 4: 'kill', 5: 'kill',
  },
  medium: { // 7-8 players
    1: null, 2: 'investigate', 3: 'special_election', 4: 'kill', 5: 'kill',
  },
  large: {  // 9-10 players
    1: 'investigate', 2: 'investigate', 3: 'special_election', 4: 'kill', 5: 'kill',
  },
};

function getPowerBracket(playerCount) {
  if (playerCount <= 6) return 'small';
  if (playerCount <= 8) return 'medium';
  return 'large';
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Default terminology (can be overridden to avoid LLM bias)
const DEFAULT_TERMS = {
  liberal: 'Liberal',
  fascist: 'Fascist',
  dictator: 'Dictator',        // "Dictator" in the original game
  liberalPolicy: 'Liberal',
  fascistPolicy: 'Fascist',
};

export function createGame(playerNames, options = {}) {
  const count = playerNames.length;
  if (count < 5 || count > 10) throw new Error('Need 5-10 players');

  const terms = { ...DEFAULT_TERMS, ...options.terms };

  const dist = ROLE_DISTRIBUTION[count];
  const roles = shuffle([
    ...Array(dist.liberals).fill('liberal'),
    ...Array(dist.fascists).fill('fascist'),
    'dictator',
  ]);

  // Per-faction models: dictator always uses fascist model (same team)
  const models = {
    liberal: options.modelLiberal || options.model || 'claude-sonnet-4-5',
    fascist: options.modelFascist || options.model || 'claude-sonnet-4-5',
    dictator:  options.modelFascist || options.model || 'claude-sonnet-4-5',
  };

  const players = playerNames.map((name, i) => ({
    name,
    role: roles[i],        // liberal | fascist | dictator
    party: roles[i] === 'liberal' ? 'liberal' : 'fascist',
    model: models[roles[i]],
    alive: true,
    investigated: false,
  }));

  // Veto power unlocked after 5th fascist policy
  // (tracked dynamically via fascistPolicies >= 5)

  // Policy deck: 6 liberal, 11 fascist
  const deck = shuffle([
    ...Array(6).fill('liberal'),
    ...Array(11).fill('fascist'),
  ]);

  return {
    id: crypto.randomUUID(),
    players,
    deck,
    discard: [],
    liberalPolicies: 0,
    fascistPolicies: 0,
    electionTracker: 0,
    presidentIndex: Math.floor(Math.random() * count),
    previousPresidentIndex: null,
    previousChancellorIndex: null,
    specialElectionReturnIndex: null,
    phase: 'nomination', // nomination | discussion | voting | legislative | power | done
    currentChancellorCandidate: null,
    votes: {},
    drawnCards: null,
    presidentialPower: null,
    winner: null,
    winReason: null,
    round: 1,
    log: [],
    model: options.model || 'claude-sonnet-4-5', // global/display model
    models,  // per-faction models
    terms,
    enableThoughts: options.enableThoughts || false,
    winPolicies: options.winPolicies || { liberal: 5, fascist: 6 },
    createdAt: new Date().toISOString(),
  };
}

export function getAlive(game) {
  return game.players.filter(p => p.alive);
}

export function getAliveIndices(game) {
  return game.players.map((p, i) => p.alive ? i : -1).filter(i => i >= 0);
}

export function getPresident(game) {
  return game.players[game.presidentIndex];
}

export function getEligibleChancellors(game) {
  const alive = getAliveIndices(game);
  const aliveCount = alive.length;
  return alive.filter(i => {
    if (i === game.presidentIndex) return false;
    if (i === game.previousChancellorIndex) return false;
    // Term limit on previous president only if > 5 alive
    if (aliveCount > 5 && i === game.previousPresidentIndex) return false;
    return true;
  });
}

export function nominateChancellor(game, chancellorIndex) {
  if (game.phase !== 'nomination') throw new Error('Wrong phase');
  const eligible = getEligibleChancellors(game);
  if (!eligible.includes(chancellorIndex)) throw new Error('Ineligible chancellor');

  game.currentChancellorCandidate = chancellorIndex;
  game.phase = 'discussion';
  game.votes = {};

  game.log.push({
    type: 'nomination',
    round: game.round,
    president: game.presidentIndex,
    chancellor: chancellorIndex,
    presidentName: game.players[game.presidentIndex].name,
    chancellorName: game.players[chancellorIndex].name,
  });

  return game;
}

export function recordDiscussion(game, playerIndex, message) {
  game.log.push({
    type: 'discussion',
    round: game.round,
    player: playerIndex,
    playerName: game.players[playerIndex].name,
    message,
  });
}

export function startVoting(game) {
  game.phase = 'voting';
  return game;
}

export function castVote(game, playerIndex, vote, reasoning) {
  if (game.phase !== 'voting') throw new Error('Wrong phase');
  if (!game.players[playerIndex].alive) throw new Error('Dead player');
  game.votes[playerIndex] = { vote, reasoning };

  game.log.push({
    type: 'vote',
    round: game.round,
    player: playerIndex,
    playerName: game.players[playerIndex].name,
    vote,
    reasoning,
  });

  return game;
}

export function resolveElection(game) {
  const alive = getAliveIndices(game);
  const ja = alive.filter(i => game.votes[i]?.vote === 'ja').length;
  const nein = alive.filter(i => game.votes[i]?.vote === 'nein').length;
  const passed = ja > nein;

  game.log.push({
    type: 'election_result',
    round: game.round,
    ja,
    nein,
    passed,
  });

  if (passed) {
    // Check Dictator chancellor win condition
    if (game.fascistPolicies >= 3 && game.players[game.currentChancellorCandidate].role === 'dictator') {
      game.winner = 'fascist';
      game.winReason = 'dictator_elected';
      game.phase = 'done';
      game.log.push({ type: 'game_over', winner: 'fascist', reason: 'Dictator elected Chancellor after 3+ fascist policies' });
      return game;
    }

    game.previousPresidentIndex = game.presidentIndex;
    game.previousChancellorIndex = game.currentChancellorCandidate;
    game.electionTracker = 0;
    game.phase = 'legislative';

    // Draw 3 cards
    ensureDeck(game);
    game.drawnCards = [game.deck.pop(), game.deck.pop(), game.deck.pop()];

    game.log.push({
      type: 'legislative_start',
      round: game.round,
      president: game.presidentIndex,
      chancellor: game.currentChancellorCandidate,
      drawnCards: [...game.drawnCards], // for game record
    });
  } else {
    game.electionTracker++;

    if (game.electionTracker >= 3) {
      // Chaos: enact top policy
      ensureDeck(game);
      const policy = game.deck.pop();
      enactPolicy(game, policy, true);
      game.electionTracker = 0;
      game.previousPresidentIndex = null;
      game.previousChancellorIndex = null;

      if (game.winner) return game;
    }

    advancePresident(game);
    game.phase = 'nomination';
    game.round++;
  }

  return game;
}

export function presidentDiscard(game, discardIndex, claim) {
  if (game.phase !== 'legislative') throw new Error('Wrong phase');
  if (discardIndex < 0 || discardIndex >= 3) throw new Error('Invalid discard');

  const discarded = game.drawnCards.splice(discardIndex, 1)[0];
  game.discard.push(discarded);

  game.log.push({
    type: 'president_discard',
    round: game.round,
    president: game.presidentIndex,
    actualCards: [...game.drawnCards, discarded], // what they really had
    discarded,
    remaining: [...game.drawnCards],
    claim, // what they SAY they had
  });

  return game;
}

export function isVetoUnlocked(game) {
  return game.fascistPolicies >= 5;
}

export function proposeVeto(game) {
  if (!isVetoUnlocked(game)) throw new Error('Veto not unlocked');
  if (game.phase !== 'legislative') throw new Error('Wrong phase');
  game.log.push({
    type: 'veto_proposed',
    round: game.round,
    chancellor: game.currentChancellorCandidate,
    chancellorName: game.players[game.currentChancellorCandidate].name,
  });
}

export function resolveVeto(game, accepted) {
  if (accepted) {
    // Both cards discarded, election tracker advances
    game.discard.push(...game.drawnCards);
    game.drawnCards = null;
    game.electionTracker++;

    game.log.push({
      type: 'veto_accepted',
      round: game.round,
      president: game.presidentIndex,
    });

    if (game.electionTracker >= 3) {
      // Chaos
      ensureDeck(game);
      const policy = game.deck.pop();
      enactPolicy(game, policy, true);
      game.electionTracker = 0;
      game.previousPresidentIndex = null;
      game.previousChancellorIndex = null;
      if (game.winner) return game;
    }

    advancePresident(game);
    game.phase = 'nomination';
    game.round++;
    return game;
  } else {
    // President rejected veto, chancellor must play a card
    game.log.push({
      type: 'veto_rejected',
      round: game.round,
      president: game.presidentIndex,
    });
    return game;
  }
}

export function chancellorPlay(game, playIndex, claim) {
  if (game.phase !== 'legislative') throw new Error('Wrong phase');
  if (playIndex < 0 || playIndex >= 2) throw new Error('Invalid play');

  const played = game.drawnCards[playIndex];
  const discarded = game.drawnCards[1 - playIndex];
  game.discard.push(discarded);
  game.drawnCards = null;

  enactPolicy(game, played, false);

  game.log.push({
    type: 'chancellor_play',
    round: game.round,
    chancellor: game.currentChancellorCandidate,
    played,
    discarded,
    claim,
  });

  if (game.winner) return game;

  // Check for presidential power
  if (played === 'fascist') {
    const bracket = getPowerBracket(game.players.length);
    const power = POWERS[bracket][game.fascistPolicies];
    if (power) {
      game.presidentialPower = power;
      game.phase = 'power';
      game.log.push({
        type: 'power_activated',
        round: game.round,
        power,
        president: game.presidentIndex,
      });
      return game;
    }
  }

  advancePresident(game);
  game.phase = 'nomination';
  game.round++;
  return game;
}

export function executePower(game, targetIndex, result) {
  if (game.phase !== 'power') throw new Error('Wrong phase');

  const power = game.presidentialPower;
  game.presidentialPower = null;

  switch (power) {
    case 'investigate': {
      const target = game.players[targetIndex];
      target.investigated = true;
      // Private result: only the president sees the actual party
      game.log.push({
        type: 'power_investigate_result',
        round: game.round,
        player: game.presidentIndex,
        target: targetIndex,
        targetName: target.name,
        actualParty: target.party,
      });
      // Public claim: everyone sees what the president claims
      game.log.push({
        type: 'power_investigate',
        round: game.round,
        president: game.presidentIndex,
        target: targetIndex,
        targetName: target.name,
        claim: result?.claim, // what president SAYS the result was
      });
      break;
    }
    case 'peek': {
      ensureDeck(game);
      const top3 = game.deck.slice(-3).reverse();
      game.log.push({
        type: 'power_peek',
        round: game.round,
        player: game.presidentIndex,
        president: game.presidentIndex,
        cards: top3,
      });
      break;
    }
    case 'special_election': {
      game.specialElectionReturnIndex = nextAliveAfter(game, game.presidentIndex);
      game.presidentIndex = targetIndex;
      game.log.push({
        type: 'power_special_election',
        round: game.round,
        newPresident: targetIndex,
        newPresidentName: game.players[targetIndex].name,
      });
      game.phase = 'nomination';
      game.round++;
      return game;
    }
    case 'kill': {
      game.players[targetIndex].alive = false;
      game.log.push({
        type: 'power_kill',
        round: game.round,
        president: game.presidentIndex,
        target: targetIndex,
        targetName: game.players[targetIndex].name,
        wasDictator: game.players[targetIndex].role === 'dictator',
      });

      if (game.players[targetIndex].role === 'dictator') {
        game.winner = 'liberal';
        game.winReason = 'dictator_killed';
        game.phase = 'done';
        game.log.push({ type: 'game_over', winner: 'liberal', reason: 'Dictator was executed' });
        return game;
      }
      break;
    }
  }

  advancePresident(game);
  game.phase = 'nomination';
  game.round++;
  return game;
}

// --- Helpers ---

function enactPolicy(game, policy, chaos) {
  const winLib = game.winPolicies?.liberal || 5;
  const winFas = game.winPolicies?.fascist || 6;

  if (policy === 'liberal') {
    game.liberalPolicies++;
    if (game.liberalPolicies >= winLib) {
      game.winner = 'liberal';
      game.winReason = 'liberal_policies';
      game.phase = 'done';
      game.log.push({ type: 'game_over', winner: 'liberal', reason: `${winLib} liberal policies enacted` });
    }
  } else {
    game.fascistPolicies++;
    if (game.fascistPolicies >= winFas) {
      game.winner = 'fascist';
      game.winReason = 'fascist_policies';
      game.phase = 'done';
      game.log.push({ type: 'game_over', winner: 'fascist', reason: `${winFas} fascist policies enacted` });
    }
  }

  game.log.push({
    type: 'policy_enacted',
    round: game.round,
    policy,
    chaos,
    liberalTotal: game.liberalPolicies,
    fascistTotal: game.fascistPolicies,
  });
}

function ensureDeck(game) {
  if (game.deck.length < 3) {
    game.deck = shuffle([...game.deck, ...game.discard]);
    game.discard = [];
    game.log.push({ type: 'deck_reshuffled', round: game.round });
  }
}

function nextAliveAfter(game, index) {
  const n = game.players.length;
  for (let i = 1; i < n; i++) {
    const next = (index + i) % n;
    if (game.players[next].alive) return next;
  }
  return index;
}

function advancePresident(game) {
  if (game.specialElectionReturnIndex !== null) {
    game.presidentIndex = game.specialElectionReturnIndex;
    game.specialElectionReturnIndex = null;
  } else {
    game.presidentIndex = nextAliveAfter(game, game.presidentIndex);
  }
}

export function getPublicState(game) {
  return {
    id: game.id,
    round: game.round,
    phase: game.phase,
    liberalPolicies: game.liberalPolicies,
    fascistPolicies: game.fascistPolicies,
    electionTracker: game.electionTracker,
    president: game.presidentIndex,
    presidentName: game.players[game.presidentIndex].name,
    chancellorCandidate: game.currentChancellorCandidate,
    chancellorCandidateName: game.currentChancellorCandidate !== null
      ? game.players[game.currentChancellorCandidate].name : null,
    players: game.players.map((p, i) => ({
      index: i,
      name: p.name,
      alive: p.alive,
    })),
    winner: game.winner,
    winReason: game.winReason,
    deckSize: game.deck.length,
    discardSize: game.discard.length,
  };
}

export function getPlayerKnowledge(game, playerIndex) {
  const player = game.players[playerIndex];
  const knowledge = {
    myRole: player.role,
    myParty: player.party,
    knownPlayers: {},
  };

  if (player.role === 'fascist') {
    // Fascists know each other AND know who Dictator is
    game.players.forEach((p, i) => {
      if (i !== playerIndex && p.party === 'fascist') {
        knowledge.knownPlayers[i] = {
          name: p.name,
          role: p.role,
        };
      }
    });
  }

  if (player.role === 'dictator' && game.players.length <= 6) {
    // Dictator knows fascist teammate in 5-6 player games
    game.players.forEach((p, i) => {
      if (i !== playerIndex && p.role === 'fascist') {
        knowledge.knownPlayers[i] = {
          name: p.name,
          role: 'fascist',
        };
      }
    });
  }

  return knowledge;
}
