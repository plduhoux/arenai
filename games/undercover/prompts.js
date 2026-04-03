/**
 * Undercover - LLM Prompts
 * Each player gives clues, discusses, and votes.
 * Players don't know their role (civilian or undercover).
 */

import { askLLMSession } from '../../core/llm-client.js';

function stripMd(text) {
  return text
    .replace(/\*{3}(.+?)\*{3}/g, '$1')
    .replace(/\*{2}(.+?)\*{2}/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(^|:\s*)\*{1,3}\s+/gm, '$1')
    .replace(/\s*\*{1,3}$/gm, '')
    .trim();
}

function extractPick(text, label, validIndices) {
  const labelRegex = new RegExp(`${label}\\s*:\\s*#?(\\d+)`, 'i');
  const labelMatch = text.match(labelRegex);
  if (labelMatch) {
    const n = parseInt(labelMatch[1]);
    if (validIndices.includes(n)) return n;
  }

  const lineRegex = new RegExp(`${label}\\s*:\\s*(.*)`, 'i');
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

// Delta event tracking per player
const playerLogCursors = new Map();
const phaseSent = new Map();

function isFirstCall(game, playerIndex, phase) {
  const key = `${game.id}:${playerIndex}:${phase}:${game.round}`;
  if (phaseSent.has(key)) return false;
  phaseSent.set(key, true);
  return true;
}

function getNewEvents(game, playerIndex) {
  const key = `${game.id}:${playerIndex}`;
  const cursor = playerLogCursors.get(key) || 0;

  const newEvents = game.log.slice(cursor).filter(e => {
    const isOwn = e.player === playerIndex;
    if (e.type === 'clue') return !isOwn;
    if (e.type === 'discussion') return !isOwn;
    if (e.type === 'vote') return !isOwn;
    if (e.type === 'thought') return false;
    return true;
  });

  playerLogCursors.set(key, game.log.length);
  return newEvents;
}

function formatNewEvents(events) {
  const lines = [];
  for (const e of events) {
    switch (e.type) {
      case 'clue':
        lines.push(`${e.playerName} gave clue: "${e.clue}"`);
        break;
      case 'discussion':
        lines.push(`${e.playerName}: "${e.message}"`);
        break;
      case 'vote':
        lines.push(`${e.playerName} votes ${e.targetName}`);
        break;
      case 'elimination':
        lines.push(`${e.targetName} eliminated (was ${e.role}).`);
        break;
      case 'no_elimination':
        lines.push('No majority: nobody eliminated.');
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

  return `You are ${player.name} in a game of Undercover.

RULES:
- Each player received a secret word. Most players (Civilians) share the same word.
  One player (the Undercover) has a DIFFERENT but similar word.
- You do NOT know if you are a Civilian or the Undercover.
- Your word is: "${player.word}"

GAMEPLAY:
Each round has 3 phases:
1. CLUE: Give a one-word or short clue that describes your word.
   Be subtle: too obvious and the Undercover blends in; too vague and you look suspicious.
2. DISCUSSION: Debate who might have a different word based on their clues.
3. VOTE: Eliminate one player.

HOW TO WIN:
- If you are a Civilian: identify and eliminate the Undercover.
- If you are the Undercover: survive until only 2 players remain.

STRATEGY:
- Your clues should relate to your word, but don't say the word itself.
- Round 1 clues should be BROAD and ambiguous. Don't narrow down your word too quickly.
  A clue that's too specific in round 1 gives away too much information to everyone.
  Good round 1 clues could apply to several related things. Get more specific in later rounds.
- Pay attention to clues that are close but slightly off — they may hint at a different word.
- You won't know your role until you compare clues with others. If your clues consistently
  differ from the majority, you might be the Undercover — if so, MATCH THE GROUP's clue style
  rather than describing your own word. Blend in by responding to what others said, not by
  being accurate about your word.
- As a Civilian, don't be too specific too early. Overly precise clues help the Undercover
  figure out your word and copy you.

Players:
${playerList}

Be CONCISE (1-2 sentences max in discussion). Play to win.`;
}

function ask(game, playerIndex, userPrompt, parseResponse) {
  const model = getPlayerModel(game, playerIndex);
  const systemPrompt = buildSystemPrompt(game, playerIndex);

  const newEvents = getNewEvents(game, playerIndex);
  const deltaContext = formatNewEvents(newEvents);
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

// --- Clue Phase ---

export function getClue(game, playerIndex) {
  const first = isFirstCall(game, playerIndex, 'clue');
  const thoughtPrompt = game.enableThoughts
    ? `\nTHOUGHT: your private reasoning about what clue to give and why (consider what others have said)`
    : '';

  const prompt = first
    ? `CLUE PHASE (Round ${game.round}): Give a one-word or short clue that relates to your word.
Do NOT say your word directly. Be strategic: specific enough for allies to recognize, vague enough to not give everything away.
${thoughtPrompt}
CLUE: your clue (one word or very short phrase, max 3 words)`
    : `Give your clue for this round.${thoughtPrompt}
CLUE: your clue`;

  return ask(game, playerIndex, prompt,
    (text) => {
      const thoughtMatch = text.match(/THOUGHT:\s*(.+?)(?=\nCLUE\s*:)/is);
      const clueMatch = text.match(/CLUE:\s*(.+)/i);
      const clue = clueMatch ? clueMatch[1].trim().slice(0, 50) : 'no clue';
      return {
        clue,
        thought: thoughtMatch ? thoughtMatch[1].trim() : null,
      };
    },
  );
}

// --- Discussion Phase ---

export function getDiscussion(game, playerIndex) {
  const first = isFirstCall(game, playerIndex, 'discussion');
  const thoughtPrompt = game.enableThoughts
    ? `\nTHOUGHT: your private reasoning about who might be the Undercover and why`
    : '';

  const prompt = first
    ? `DISCUSSION PHASE: Based on the clues given, discuss who you think might have a different word.
Analyze the clues — which ones seem slightly off? Who might be the Undercover?
${thoughtPrompt}
STANCE: accusation/defense/analysis/pass
MESSAGE: your PUBLIC statement (1-2 sentences, name specific players)`
    : `Continue the discussion. React to what others have said.${thoughtPrompt}
STANCE: accusation/defense/analysis/pass
MESSAGE: your PUBLIC statement`;

  return ask(game, playerIndex, prompt,
    (text) => {
      const thoughtMatch = text.match(/THOUGHT:\s*(.+?)(?=\n(?:STANCE|MESSAGE))/is);
      const stanceMatch = text.match(/STANCE:\s*(accusation|defense|analysis|pass)/i);
      const messageMatch = text.match(/MESSAGE:\s*(.+)/is);
      const stance = stanceMatch ? stanceMatch[1].toLowerCase() : 'analysis';
      let message = 'PASS';
      if (stance !== 'pass' && messageMatch) {
        message = messageMatch[1]
          .replace(/THOUGHT:\s*.+/is, '')
          .replace(/^["']|["']$/g, '')
          .trim() || 'PASS';
      }
      return {
        stance,
        message,
        thought: thoughtMatch ? thoughtMatch[1].trim() : null,
      };
    },
  );
}

// --- Vote Phase ---

export function getVote(game, playerIndex) {
  const alive = game.players
    .map((p, i) => ({ ...p, index: i }))
    .filter(p => p.alive && p.index !== playerIndex);

  const eligibleStr = alive.map(p => `${p.name} (#${p.index})`).join(', ');

  return ask(game, playerIndex,
    `VOTE: Who do you think is the Undercover? Eliminate one player.\n${eligibleStr}\nPICK: player number`,
    (text) => {
      const validIndices = alive.map(a => a.index);
      const n = extractPick(text, 'PICK', validIndices);
      return n !== null
        ? { target: n }
        : { target: alive[Math.floor(Math.random() * alive.length)].index };
    },
  );
}

// --- Runoff Vote ---

export function getRunoffVote(game, playerIndex, tiedPlayers) {
  const tiedStr = tiedPlayers.map(i => `${game.players[i].name} (#${i})`).join(', ');

  return ask(game, playerIndex,
    `RUNOFF VOTE: Tie. Vote again between: ${tiedStr}\nYou MUST choose one.\nPICK: player number`,
    (text) => {
      const n = extractPick(text, 'PICK', tiedPlayers);
      return n !== null
        ? { target: n }
        : { target: tiedPlayers[Math.floor(Math.random() * tiedPlayers.length)] };
    },
  );
}

export function resetPromptState(gameId) {
  for (const key of playerLogCursors.keys()) {
    if (key.startsWith(`${gameId}:`)) playerLogCursors.delete(key);
  }
  for (const key of phaseSent.keys()) {
    if (key.startsWith(`${gameId}:`)) phaseSent.delete(key);
  }
}
