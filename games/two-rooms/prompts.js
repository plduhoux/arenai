/**
 * Two Rooms and a Boom - LLM Prompts
 * Per-player conversational sessions with delta events.
 */

import { askLLMSession } from '../../core/llm-client.js';
import * as engine from './engine.js';

// Strip markdown formatting from LLM responses before parsing commands
function stripMd(text) {
  return text
    .replace(/\*{3}(.+?)\*{3}/g, '$1')   // ***bold+italic***
    .replace(/\*{2}(.+?)\*{2}/g, '$1')   // **bold**
    .replace(/\*(.+?)\*/g, '$1')          // *italic*
    .replace(/__(.+?)__/g, '$1')          // __underline__
    .replace(/^#{1,6}\s+/gm, '')          // ## headers
    .replace(/(^|:\s*)\*{1,3}\s+/gm, '$1') // orphan ** after line start or colon
    .replace(/\s*\*{1,3}$/gm, '')         // orphan ** at line end
    .trim();
}

/**
 * Extract a player number from a labeled line (e.g. "PICK: 3").
 * Falls back to last valid number in the full text if no label found.
 */
function extractPick(text, label, validIndices) {
  const labelRegex = new RegExp(`${label}:\\s*#?(\\d+)`, 'i');
  const labelMatch = text.match(labelRegex);
  if (labelMatch) {
    const n = parseInt(labelMatch[1]);
    if (validIndices.includes(n)) return n;
  }
  const lineRegex = new RegExp(`${label}:\\s*(.*)`, 'i');
  const lineMatch = text.match(lineRegex);
  if (lineMatch) {
    const nums = [...lineMatch[1].matchAll(/(\d+)/g)].map(m => parseInt(m[1]));
    for (const n of nums) if (validIndices.includes(n)) return n;
  }
  const allNums = [...text.matchAll(/(\d+)/g)].map(m => parseInt(m[1]));
  for (let i = allNums.length - 1; i >= 0; i--) {
    if (validIndices.includes(allNums[i])) return allNums[i];
  }
  return null;
}

// Track last-sent log index per player to only send delta
const playerLogCursors = new Map();

// Track which phase instructions have been sent per player per round
const phaseSent = new Map();

function isFirstCall(game, playerIndex, phase) {
  const key = `${game.id}:${playerIndex}:${phase}:${game.round}`;
  if (phaseSent.has(key)) return false;
  phaseSent.set(key, true);
  return true;
}

function getPlayerLogKey(gameId, playerIndex) {
  return `${gameId}:${playerIndex}`;
}

export function resetPromptState(gameId) {
  for (const key of playerLogCursors.keys()) {
    if (key.startsWith(`${gameId}:`)) playerLogCursors.delete(key);
  }
  for (const key of phaseSent.keys()) {
    if (key.startsWith(`${gameId}:`)) phaseSent.delete(key);
  }
}

function getNewEvents(game, playerIndex) {
  const key = getPlayerLogKey(game.id, playerIndex);
  const cursor = playerLogCursors.get(key) || 0;
  const player = game.players[playerIndex];

  const newEvents = game.log.slice(cursor).filter(e => {
    const isOwnEvent = e.player === playerIndex || e.from === playerIndex;

    // Discussion: only in same room, skip own messages
    if (e.type === 'discussion') {
      return e.room === player.room && !isOwnEvent;
    }

    // Shares: player sees shares that involve them (as recipient) — they get verified info
    // Skip own shares (as sender — you know what you shared)
    if (e.type === 'share') {
      if (e.to === playerIndex) return true; // You received a share (verified info)
      if (e.from === playerIndex) return false; // You initiated this share
      // Other shares in your room: you see that it happened (but not the content)
      return game.players[e.from]?.room === player.room;
    }

    // Leader elected: visible to players in that room
    if (e.type === 'leader_elected') return true; // Both rooms learn about leaders

    // Hostage selected: visible to players in that room
    if (e.type === 'hostage_selected') return true;

    // Exchange: everyone sees who moved
    if (e.type === 'exchange') return true;

    // Private thoughts not shared
    if (e.type === 'thought') return false;

    // Game over: everyone
    if (e.type === 'game_over') return true;

    return true;
  });

  playerLogCursors.set(key, game.log.length);
  return newEvents;
}

function formatNewEvents(events, playerIndex) {
  const lines = [];
  for (const e of events) {
    switch (e.type) {
      case 'discussion':
        lines.push(`${e.playerName}: "${e.message}"`);
        break;
      case 'share':
        if (e.to === playerIndex) {
          // You received verified info
          const shareInfo = e.shareType === 'card'
            ? `showed you their card: ${e.fromTeam?.toUpperCase()} team (${e.fromLabel})`
            : `showed you their color: ${e.fromTeam?.toUpperCase()} team`;
          lines.push(`[VERIFIED] ${e.fromName} ${shareInfo}. This is guaranteed true.`);
        } else {
          // You saw someone else share (but don't know content)
          lines.push(`${e.fromName} privately shared ${e.shareType === 'card' ? 'their card' : 'their color'} with ${e.toName}.`);
        }
        break;
      case 'leader_elected':
        lines.push(`${e.playerName} elected leader of Room ${e.room}.`);
        break;
      case 'hostage_selected':
        lines.push(`Room ${e.room} sends hostage(s): ${e.hostages.join(', ')}.`);
        break;
      case 'exchange':
        if (e.aToB.length || e.bToA.length) {
          const parts = [];
          if (e.aToB.length) parts.push(`${e.aToB.join(', ')} moved A→B`);
          if (e.bToA.length) parts.push(`${e.bToA.join(', ')} moved B→A`);
          lines.push(`Exchange: ${parts.join(', ')}.`);
        }
        break;
      case 'game_over':
        lines.push(`GAME OVER: ${e.winner.toUpperCase()} wins! ${e.reason}`);
        break;
    }
  }
  return lines.join('\n');
}

function getPlayerModel(game, playerIndex) {
  return game.players[playerIndex].model || game.model;
}

function buildSystemPrompt(game, playerIndex) {
  const player = game.players[playerIndex];
  const playerList = game.players.map((p, i) => `  ${p.name} (#${i})`).join('\n');

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

  return `You are ${player.name} in Two Rooms and a Boom. ${game.maxRounds} rounds total.
${roleInfo}

Players:
${playerList}

Rules:
- Each round: discussion in your room, then card sharing, then leader election, then hostage exchange.
- Leaders pick who gets sent to the other room as hostage.
- Verbal claims are NEVER verifiable: players can claim any team or role when speaking.
- Only physically sharing a card is guaranteed truthful (the game enforces it).
- You can share your COLOR (team only) or CARD (full role) with one player per round.
- Room assignments, leader elections, shares, and exchanges are announced as events.
- Be CONCISE (1-2 sentences). Only elaborate with real arguments.`;
}

function ask(game, playerIndex, userPrompt, parseResponse) {
  const model = getPlayerModel(game, playerIndex);
  const systemPrompt = buildSystemPrompt(game, playerIndex);

  const newEvents = getNewEvents(game, playerIndex);
  const deltaContext = formatNewEvents(newEvents, playerIndex);
  const fullPrompt = deltaContext
    ? `${deltaContext}\n\n${userPrompt}`
    : userPrompt;

  const wrappedParse = parseResponse
    ? (text) => parseResponse(stripMd(text))
    : undefined;

  return askLLMSession({
    gameId: game.id,
    model,
    systemPrompt,
    userPrompt: fullPrompt,
    playerName: game.players[playerIndex].name,
    playerKey: `player:${playerIndex}:${game.players[playerIndex].name}`,
    parseResponse: wrappedParse,
  });
}

// --- Discussion (within a room) ---

export function getRoomDiscussion(game, playerIndex, turn = 0) {
  const room = game.players[playerIndex].room;
  const discussionTurns = 2;
  const roommates = engine.getPlayersInRoom(game, room)
    .filter(p => p.index !== playerIndex)
    .map(p => `${p.name} (#${p.index})`).join(', ');

  const first = isFirstCall(game, playerIndex, 'discussion');
  const thoughtPrompt = game.enableThoughts
    ? `\nTHOUGHT: your private strategy (1 sentence, not shared)`
    : '';

  const prompt = first
    ? `DISCUSSION (Room ${room}, Round ${game.round}/${game.maxRounds}, turn ${turn + 1}/${discussionTurns}).

Other players here: ${roommates}

${thoughtPrompt}
MESSAGE: your public statement (1-2 sentences). Say MESSAGE: PASS to stay silent.`
    : `Your turn to speak (Room ${room}, turn ${turn + 1}/${discussionTurns}).${thoughtPrompt}\nMESSAGE: your statement or PASS`;

  return ask(game, playerIndex, prompt,
    (text) => {
      const thoughtMatch = text.match(/THOUGHT:\s*(.+?)(?=\n(?:MESSAGE|$))/is);
      const thought = thoughtMatch?.[1]?.trim() || null;
      const messageMatch = text.match(/MESSAGE:\s*(.+)/is);
      const message = messageMatch ? messageMatch[1].replace(/^["']|["']$/g, '').trim() : text.replace(/THOUGHT:.*$/is, '').trim();
      if (!message || message === 'PASS') return { action: 'pass', message: 'PASS', thought };
      return { action: 'discuss', message, thought };
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

  const first = isFirstCall(game, playerIndex, 'card_share');
  const thoughtPrompt = game.enableThoughts
    ? `\nTHOUGHT: your private reasoning (1 sentence)`
    : '';

  const prompt = first
    ? `CARD SHARING (Room ${room}, Round ${game.round}/${game.maxRounds}).
You may privately show your card to ONE player in your room, or choose not to share at all. Sharing is verified by the game: you cannot lie when sharing a card. The target will learn your true team (color share) or full role (card share).

Players here: ${roommates}
${knownNames.length ? `You already verified: ${knownNames.join(', ')}` : 'You haven\'t verified anyone yet.'}
${thoughtPrompt}
SHARE: no/yes
TARGET: player number (if yes)
SHARE_TYPE: color/card`
    : `Card sharing phase. Players here: ${roommates}${thoughtPrompt}\nSHARE: no/yes\nTARGET: player number\nSHARE_TYPE: color/card`;

  return ask(game, playerIndex, prompt,
    (text) => {
      const thoughtMatch = text.match(/THOUGHT:\s*(.+?)(?=\n(?:SHARE|$))/is);
      const thought = thoughtMatch?.[1]?.trim() || null;
      const shareMatch = text.match(/SHARE:\s*(yes|no)/i);
      if (!shareMatch || shareMatch[1].toLowerCase() === 'no') return { share: false, thought };
      const targetMatch = text.match(/TARGET:\s*(\d+)/i);
      const typeMatch = text.match(/SHARE_TYPE:\s*(card|color)/i);
      const eligible = engine.getPlayerIndicesInRoom(game, room).filter(i => i !== playerIndex);
      let target = targetMatch ? parseInt(targetMatch[1]) : null;
      if (target !== null && !eligible.includes(target)) target = null;
      return {
        share: true,
        target,
        shareType: typeMatch ? typeMatch[1].toLowerCase() : 'color',
        thought,
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
    `NOMINATE A LEADER for Room ${room}. You cannot nominate yourself.\nCandidates: ${roommates}\nPICK: player number`,
    (text) => {
      const eligible = engine.getPlayerIndicesInRoom(game, room).filter(i => i !== playerIndex);
      const n = extractPick(text, 'PICK', eligible);
      return n !== null ? n : eligible[Math.floor(Math.random() * eligible.length)];
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
    `You are LEADER of Room ${room}. Choose ${hostageCount} hostage(s) to send to the other room. You CANNOT send yourself.\nPlayers: ${eligible}\nPICK: player number(s)`,
    (text) => {
      const eligibleIndices = engine.getPlayerIndicesInRoom(game, room).filter(i => i !== leaderIndex);
      // For hostage picks, extract from PICK line first, then fallback
      const pickLine = text.match(/PICK:\s*(.*)/i)?.[1] || text;
      const nums = [...pickLine.matchAll(/(\d+)/g)].map(m => parseInt(m[1]));
      const picks = [];
      for (const n of nums) {
        if (eligibleIndices.includes(n) && !picks.includes(n)) {
          picks.push(n);
          if (picks.length >= hostageCount) break;
        }
      }
      // Fallback to full text if PICK line didn't have enough
      if (picks.length < hostageCount) {
        const allNums = [...text.matchAll(/(\d+)/g)].map(m => parseInt(m[1]));
        for (const n of allNums) {
          if (eligibleIndices.includes(n) && !picks.includes(n)) {
            picks.push(n);
            if (picks.length >= hostageCount) break;
          }
        }
      }
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
