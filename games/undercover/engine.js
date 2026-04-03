/**
 * Undercover - Game Engine
 * 4 players: 3 Civilians (same word), 1 Undercover (similar but different word).
 * Players don't know their role — they must deduce it from clues.
 * Each round: give a clue, discuss, vote to eliminate.
 * Civilians win by eliminating the Undercover.
 * Undercover wins by surviving to the final 2.
 */

import { randomUUID } from 'crypto';

// Word pairs: [civilian word, undercover word]
// Chosen for semantic overlap that challenges LLMs
const WORD_PAIRS = [
  ['Coffee', 'Tea'],
  ['Beach', 'Pool'],
  ['Pillow', 'Blanket'],
  ['Sock', 'Glove'],
  ['Guitar', 'Ukulele'],
];

function pickWordPair() {
  const pair = WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];
  // Randomly swap which word goes to civilians vs undercover
  if (Math.random() < 0.5) return { civilianWord: pair[0], undercoverWord: pair[1] };
  return { civilianWord: pair[1], undercoverWord: pair[0] };
}

function assignRoles(count) {
  // Always exactly 1 undercover, rest are civilians
  const roles = new Array(count).fill('civilian');
  const undercoverIndex = Math.floor(Math.random() * count);
  roles[undercoverIndex] = 'undercover';
  return roles;
}

export function createGame(names, options = {}) {
  const count = names.length;
  const roles = assignRoles(count);
  const model = options.model || 'claude-sonnet-4-5';
  const { civilianWord, undercoverWord } = pickWordPair();

  const models = {
    civilian: options.modelGood || options.modelCivilian || model,
    undercover: options.modelEvil || options.modelUndercover || model,
  };

  const players = names.map((name, i) => ({
    name,
    role: roles[i],
    party: roles[i] === 'undercover' ? 'undercover' : 'civilian',
    word: roles[i] === 'undercover' ? undercoverWord : civilianWord,
    model: roles[i] === 'undercover' ? models.undercover : models.civilian,
    alive: true,
  }));

  return {
    id: randomUUID(),
    players,
    round: 1,
    phase: 'clue',  // clue | discussion | vote | done
    log: [],
    model,
    models,
    civilianWord,
    undercoverWord,
    // Options
    discussionRounds: options.discussionRounds || 1,
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

export function eliminatePlayer(game, targetIndex) {
  game.players[targetIndex].alive = false;
  game.log.push({
    type: 'elimination',
    round: game.round,
    target: targetIndex,
    targetName: game.players[targetIndex].name,
    role: game.players[targetIndex].role,
    party: game.players[targetIndex].party,
  });
}

export function checkWin(game) {
  const aliveUndercover = getAliveByParty(game, 'undercover').length;
  const aliveCivilians = getAliveByParty(game, 'civilian').length;
  const aliveTotal = aliveUndercover + aliveCivilians;

  // Civilians win: undercover eliminated
  if (aliveUndercover === 0) {
    game.winner = 'civilian';
    game.winReason = 'undercover_eliminated';
    game.phase = 'done';
    game.log.push({ type: 'game_over', winner: 'civilian', reason: 'The Undercover has been identified and eliminated.' });
    return true;
  }

  // Undercover wins: survived to final 2 (1 undercover + 1 civilian)
  if (aliveTotal <= 2 && aliveUndercover > 0) {
    game.winner = 'undercover';
    game.winReason = 'undercover_survived';
    game.phase = 'done';
    game.log.push({ type: 'game_over', winner: 'undercover', reason: 'The Undercover survived to the end. Civilians failed to identify them.' });
    return true;
  }

  return false;
}

export { WORD_PAIRS };
