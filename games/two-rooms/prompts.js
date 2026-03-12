/**
 * Two Rooms and a Boom - LLM Prompts
 * Concise prompts for ~40-50k tokens per game.
 */

import { askLLM } from '../../core/llm-client.js';
import * as engine from './engine.js';

function getPlayerModel(game, playerIndex) {
  return game.players[playerIndex].model || game.model;
}

function buildSystemPrompt(game, playerIndex) {
  const player = game.players[playerIndex];
  const roommates = engine.getPlayersInRoom(game, player.room)
    .map(p => `  ${p.name} (#${p.index})`)
    .join('\n');

  let roleInfo = '';
  switch (player.role) {
    case 'president':
      roleInfo = `You are the PRESIDENT (Blue Team). Blue wins if you are NOT in the same room as the Bomber after the final exchange. Stay hidden or reveal strategically. Your team needs to protect you.`;
      break;
    case 'bomber':
      roleInfo = `You are the BOMBER (Red Team). Red wins if you end up in the same room as the President after the final exchange. Find the President. Get yourself sent to their room, or get them sent to yours.`;
      break;
    case 'gambler':
      roleInfo = `You are the GAMBLER (Grey Team). You win by correctly predicting which team wins (Blue or Red). Gather info from both sides. At the end, you must announce your prediction.`;
      break;
    default:
      if (player.team === 'blue') {
        roleInfo = `You are a BLUE AGENT. Blue wins if the President is NOT in the same room as the Bomber. Find the President and protect them. Find the Bomber and keep them away.`;
      } else {
        roleInfo = `You are a RED AGENT. Red wins if the Bomber IS in the same room as the President. Find the President's location and help the Bomber reach them.`;
      }
  }

  // Knowledge from shares
  const knowledge = engine.getKnowledge(game, playerIndex);
  const knownEntries = Object.values(knowledge);
  const knowledgeStr = knownEntries.length > 0
    ? `\n--- VERIFIED FACTS (from physical card shares, 100% guaranteed true) ---\n${knownEntries.map(k =>
        k.role ? `  ${k.name} IS ${k.team.toUpperCase()} team (${k.label}) - THIS IS CERTAIN` : `  ${k.name} IS ${k.team.toUpperCase()} team - THIS IS CERTAIN`
      ).join('\n')}\n--- Players may LIE verbally, but the above is proven truth. ---`
    : '';

  return `You are ${player.name} in Two Rooms and a Boom. Room ${player.room}, Round ${game.round}/${game.maxRounds}.
${roleInfo}
${knowledgeStr}

Players in your room:
${roommates}

Rules: Be CONCISE. 1-2 sentences max. Verbal claims are never verifiable - players can claim any team or role when speaking. Only physically sharing a card is guaranteed truthful. You can share your card (reveal role) or share color (reveal team) with one player.`;
}

function buildContext(game, room) {
  const events = game.log.filter(e =>
    (e.type === 'discussion' && e.room === room) ||
    (e.type === 'share' && game.players[e.from]?.room === room) ||
    e.type === 'leader_elected' ||
    e.type === 'exchange' ||
    e.type === 'hostage_selected'
  );

  if (events.length === 0) return '(Start of game)';

  return 'HISTORY:\n' + events.map(e => {
    switch (e.type) {
      case 'discussion': return `[R${e.round}] ${e.playerName}: "${e.message}"`;
      case 'share': return `[R${e.round}] ${e.fromName} shared ${e.shareType} with ${e.toName}`;
      case 'leader_elected': return `[R${e.round}] ${e.playerName} elected leader of Room ${e.room}`;
      case 'exchange': return `[R${e.round}] Exchange: ${e.aToB.join(',')} went A->B, ${e.bToA.join(',')} went B->A`;
      case 'hostage_selected': return `[R${e.round}] Room ${e.room} sends: ${e.hostages.join(', ')}`;
      default: return null;
    }
  }).filter(Boolean).join('\n');
}

function ask(game, playerIndex, userPrompt, parseResponse) {
  const systemPrompt = buildSystemPrompt(game, playerIndex);
  const room = game.players[playerIndex].room;
  const context = buildContext(game, room);
  return askLLM({
    gameId: game.id,
    model: getPlayerModel(game, playerIndex),
    systemPrompt,
    userPrompt: `${context}\n\n${userPrompt}`,
    playerName: game.players[playerIndex].name,
    parseResponse,
  });
}

// --- Discussion (within a room) ---

export function getRoomDiscussion(game, playerIndex, turn = 0) {
  const room = game.players[playerIndex].room;
  const roundMsgs = game.log
    .filter(e => e.type === 'discussion' && e.round === game.round && e.room === room)
    .map(e => `${e.playerName}: "${e.message}"`)
    .join('\n');

  const discussionTurns = Math.max(1, 4 - game.round);
  const roommates = engine.getPlayersInRoom(game, room)
    .filter(p => p.index !== playerIndex)
    .map(p => `${p.name} (#${p.index})`).join(', ');

  return ask(game, playerIndex,
    `DISCUSSION (Room ${room}, Round ${game.round}/${game.maxRounds}, turn ${turn + 1}/${discussionTurns}).${roundMsgs ? `\n\nSaid this round so far:\n${roundMsgs}` : ''}

Other players here: ${roommates}

Reply with MESSAGE: your statement (1-2 sentences). Say MESSAGE: PASS to stay silent.`,
    (text) => {
      const messageMatch = text.match(/MESSAGE:\s*(.+)/is);
      const message = messageMatch ? messageMatch[1].replace(/^["']|["']$/g, '').trim() : text.trim();
      if (!message || message === 'PASS') return { action: 'pass', message: 'PASS' };
      return { action: 'discuss', message };
    },
  );
}

// --- Card Sharing (dedicated phase, after discussion) ---

export function getCardShare(game, playerIndex) {
  const room = game.players[playerIndex].room;
  const roommates = engine.getPlayersInRoom(game, room)
    .filter(p => p.index !== playerIndex)
    .map(p => `${p.name} (#${p.index})`).join(', ');

  const knowledge = engine.getKnowledge(game, playerIndex);
  const knownNames = Object.values(knowledge).map(k => k.name);

  return ask(game, playerIndex,
    `CARD SHARING (Room ${room}, Round ${game.round}/${game.maxRounds}).
You may privately show your card to ONE player in your room. This is verified by the game: you cannot lie when sharing a card. The target will learn your true team (color share) or full role (card share).

Players here: ${roommates}
${knownNames.length ? `You already know: ${knownNames.join(', ')}` : 'You haven\'t verified anyone yet.'}

SHARE: yes/no
TARGET: player number (if yes)
SHARE_TYPE: color/card`,
    (text) => {
      const shareMatch = text.match(/SHARE:\s*(yes|no)/i);
      if (!shareMatch || shareMatch[1].toLowerCase() === 'no') return { share: false };
      const targetMatch = text.match(/TARGET:\s*(\d+)/i);
      const typeMatch = text.match(/SHARE_TYPE:\s*(card|color)/i);
      const eligible = engine.getPlayerIndicesInRoom(game, room).filter(i => i !== playerIndex);
      let target = targetMatch ? parseInt(targetMatch[1]) : null;
      if (target !== null && !eligible.includes(target)) target = null;
      return {
        share: true,
        target,
        shareType: typeMatch ? typeMatch[1].toLowerCase() : 'color',
      };
    },
  );
}

// --- Leader Nomination ---

export function getLeaderVote(game, playerIndex) {
  const room = game.players[playerIndex].room;
  const roommates = engine.getPlayersInRoom(game, room)
    .filter(p => p.index !== playerIndex)
    .map(p => `${p.name} (#${p.index})`).join(', ');

  return ask(game, playerIndex,
    `NOMINATE A LEADER for Room ${room}. You cannot nominate yourself.\nCandidates: ${roommates}\nReply with the player number.`,
    (text) => {
      const eligible = engine.getPlayerIndicesInRoom(game, room).filter(i => i !== playerIndex);
      const nums = [...text.matchAll(/(\d+)/g)].map(m => parseInt(m[1]));
      for (const n of nums) if (eligible.includes(n)) return n;
      return eligible[Math.floor(Math.random() * eligible.length)];
    },
  );
}

// --- Hostage Selection (leader only) ---

export function getHostagePick(game, leaderIndex) {
  const room = game.players[leaderIndex].room;
  const hostageCount = engine.getHostageCount(game);
  const eligible = engine.getPlayersInRoom(game, room)
    .filter(p => p.index !== leaderIndex)
    .map(p => `${p.name} (#${p.index})`).join(', ');

  return ask(game, leaderIndex,
    `You are LEADER of Room ${room}. Choose ${hostageCount} hostage(s) to send to the other room. You CANNOT send yourself.\nPlayers: ${eligible}\nReply with the player number.`,
    (text) => {
      const eligibleIndices = engine.getPlayerIndicesInRoom(game, room).filter(i => i !== leaderIndex);
      const nums = [...text.matchAll(/(\d+)/g)].map(m => parseInt(m[1]));
      const picks = [];
      for (const n of nums) {
        if (eligibleIndices.includes(n) && !picks.includes(n)) {
          picks.push(n);
          if (picks.length >= hostageCount) break;
        }
      }
      // Fill with random if needed
      while (picks.length < hostageCount) {
        const remaining = eligibleIndices.filter(i => !picks.includes(i));
        if (remaining.length === 0) break;
        picks.push(remaining[Math.floor(Math.random() * remaining.length)]);
      }
      return picks;
    },
  );
}

// --- Gambler Guess ---

export function getGamblerGuess(game, gamblerIndex) {
  return ask(game, gamblerIndex,
    `The game is over. Before cards are revealed, you must predict: which team won?\nReply: BLUE or RED`,
    (text) => {
      if (/blue/i.test(text)) return 'blue';
      if (/red/i.test(text)) return 'red';
      return Math.random() > 0.5 ? 'blue' : 'red';
    },
  );
}
