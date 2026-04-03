/**
 * Secret Dictator - LLM Prompts
 * Per-player conversational sessions with delta events.
 */

import { askLLMSession } from '../../core/llm-client.js';

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
 * This avoids picking numbers from THOUGHT/reasoning sections.
 */
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

const PLAYER_COLORS = ['R', 'B', 'G', 'Y', 'P', 'O', 'W', 'Br', 'Pk', 'Gr'];

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

function t(game) { return game.terms; }

function getPlayerModel(game, playerIndex) {
  return game.players[playerIndex].model || game.model;
}

function getNewEvents(game, playerIndex) {
  const key = getPlayerLogKey(game.id, playerIndex);
  const cursor = playerLogCursors.get(key) || 0;
  const player = game.players[playerIndex];

  const newEvents = game.log.slice(cursor).filter(e => {
    // Determine if this is the player's own action
    const isOwnEvent = e.player === playerIndex || e.president === playerIndex;

    // Discussion: skip own messages
    if (e.type === 'discussion') return e.player !== playerIndex;
    // Votes: skip own vote
    if (e.type === 'vote') return e.player !== playerIndex;
    // Nomination: skip if you're the president (you made it)
    if (e.type === 'nomination') return e.president !== playerIndex;
    // Investigation result: visible ONLY to the investigating president
    if (e.type === 'power_investigate_result') return e.player === playerIndex;
    // Investigation claim (public): everyone sees it (president already knows from result event)
    if (e.type === 'power_investigate') return e.president !== playerIndex;
    // Peek result: only visible to the president who peeked
    if (e.type === 'power_peek') return e.player === playerIndex;
    // Kill: skip if you're the president who ordered it
    if (e.type === 'power_kill') return e.president !== playerIndex;
    // Special election: everyone sees
    if (e.type === 'power_special_election') return true;
    // Legislative session: private events (players involved already see cards in their prompts)
    if (e.type === 'president_discard') return false;
    if (e.type === 'chancellor_play') return false;
    // Veto events: everyone sees the outcome
    if (e.type === 'veto_proposed') return true;
    if (e.type === 'veto_accepted' || e.type === 'veto_rejected') return true;
    // Private thoughts not shared
    if (e.type === 'thought') return false;
    // Policy enacted, election result, etc.: everyone sees
    return true;
  });

  playerLogCursors.set(key, game.log.length);
  return newEvents;
}

function formatNewEvents(events, game) {
  const terms = t(game);
  const lines = [];
  for (const e of events) {
    switch (e.type) {
      case 'nomination':
        lines.push(`${e.presidentName} nominated ${e.chancellorName} as Chancellor.`);
        break;
      case 'vote':
        lines.push(`${e.playerName} voted ${e.vote.toUpperCase()}.`);
        break;
      case 'election_result':
        lines.push(`Vote result: ${e.ja} Ja / ${e.nein} Nein - ${e.passed ? 'PASSED' : 'FAILED'}.`);
        break;
      case 'policy_enacted':
        lines.push(`${e.chaos ? 'CHAOS: ' : ''}${e.policy.toUpperCase()} policy enacted. (${terms.liberal}: ${e.liberalTotal}, ${terms.fascist}: ${e.fascistTotal})`);
        break;
      case 'discussion':
        lines.push(`${e.playerName}: "${e.message}"`);
        break;
      case 'power_kill':
        lines.push(`President executed ${e.targetName}!${e.wasDictator ? ` IT WAS THE ${terms.dictator.toUpperCase()}!` : ''}`);
        break;
      case 'power_investigate':
        lines.push(`President investigated ${e.targetName}. Claimed: ${e.claim || 'unknown'}.`);
        break;
      case 'power_investigate_result':
        lines.push(`[INVESTIGATION] You investigated ${e.targetName}: they are ${e.actualParty.toUpperCase()}.`);
        break;
      case 'power_peek':
        lines.push(`[PEEK] Top 3 cards in the policy deck: ${e.cards.map(c => c.toUpperCase()).join(', ')}.`);
        break;
      case 'power_special_election':
        lines.push(`Special election! ${e.newPresidentName} is the new President.`);
        break;
      case 'president_discard':
        // Private event for the president (they already know). Public claim is separate.
        // If this reaches formatNewEvents, it's for the chancellor who sees remaining cards.
        break;
      case 'chancellor_play':
        // The chancellor already knows what they played. This is logged for history.
        break;
      case 'veto_proposed':
        lines.push(`Chancellor proposed a VETO.`);
        break;
      case 'veto_accepted':
        lines.push(`President ACCEPTED the veto. Both cards discarded.`);
        break;
      case 'veto_rejected':
        lines.push(`President REJECTED the veto. Chancellor must play a card.`);
        break;
      case 'player_killed':
        lines.push(`${e.playerName} has been executed.${e.wasDictator ? ` They were the ${terms.dictator}!` : ''}`);
        break;
    }
  }
  return lines.join('\n');
}

function buildSystemPrompt(game, playerIndex) {
  const player = game.players[playerIndex];
  const terms = t(game);
  const playerList = game.players.map((p, i) => `  [${PLAYER_COLORS[i]}] ${p.name} (#${i})`).join('\n');

  let roleInfo = '';
  if (player.role === 'liberal') {
    roleInfo = `You are a ${terms.liberal}. You don't know anyone else's role. Your goal is to enact ${game.winPolicies?.liberal || 5} ${terms.liberal} policies or find and kill the ${terms.dictator}.`;
  } else if (player.role === 'fascist') {
    const teammates = game.players
      .filter((p, i) => i !== playerIndex && p.party === 'fascist')
      .map(p => `${p.name} (${p.role === 'dictator' ? terms.dictator : terms.fascist})`)
      .join(', ');
    roleInfo = `You are a ${terms.fascist}. Your teammates: ${teammates}. Your goal is to enact ${game.winPolicies?.fascist || 6} ${terms.fascist} policies or get the ${terms.dictator} elected Chancellor after 3 ${terms.fascist} policies are enacted. Help the ${terms.dictator} but don't be obvious about it. Lie, deceive, and manipulate.`;
  } else {
    // Dictator
    if (game.players.length <= 6) {
      const fascist = game.players.find((p, i) => i !== playerIndex && p.role === 'fascist');
      roleInfo = `You are the ${terms.dictator}. Your ${terms.fascist} teammate is ${fascist.name}. Your goal: stay hidden, appear ${terms.liberal.toLowerCase()}, and get elected Chancellor after 3 ${terms.fascist} policies. You win if ${terms.fascist.toLowerCase()}s enact 6 policies too. Be careful: if you get killed, your team loses.`;
    } else {
      roleInfo = `You are the ${terms.dictator}. You do NOT know who the other ${terms.fascist.toLowerCase()}s are (they know you though). Your goal: appear as ${terms.liberal.toLowerCase()} as possible, stay alive, and get elected Chancellor after 3 ${terms.fascist} policies. Be careful: if you get killed, your team loses.`;
    }
  }

  return `You are ${player.name}, playing a social deduction board game.

GAME RULES SUMMARY:
- Players are secretly ${terms.liberal}s or ${terms.fascist}s. One ${terms.fascist} is the ${terms.dictator}.
- Each round: a President nominates a Chancellor, everyone votes.
- If elected, President draws 3 policy cards, discards 1. Chancellor gets 2, plays 1.
- Policy deck has 11 ${terms.fascist} and 6 ${terms.liberal} cards.
- ${terms.liberal}s win: ${game.winPolicies?.liberal || 5} ${terms.liberal} policies OR killing the ${terms.dictator}.
- ${terms.fascist}s win: ${game.winPolicies?.fascist || 6} ${terms.fascist} policies OR electing the ${terms.dictator} as Chancellor after 3+ ${terms.fascist} policies.
- After 3 failed elections in a row, top policy auto-enacted.
- ${terms.fascist} policies may grant the President powers (investigate, peek, special election, execute).

YOUR ROLE:
${roleInfo}

PLAYERS:
${playerList}

CRITICAL RULES:
- Be strategic and stay in character.
- Be CONCISE. 1-2 sentences max if you have something important.
- When lying, be convincing. When accusing, have reasons.
- Deaths, policies, and powers are announced as events during the game.`;
}

function ask(game, playerIndex, userPrompt, parseResponse) {
  const model = getPlayerModel(game, playerIndex);
  const systemPrompt = buildSystemPrompt(game, playerIndex);

  const newEvents = getNewEvents(game, playerIndex);
  const deltaContext = formatNewEvents(newEvents, game);
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

// --- Player Actions ---

export function chooseChancellor(game, eligibleIndices) {
  const presidentIndex = game.presidentIndex;
  const eligible = eligibleIndices.map(i => `${game.players[i].name} (#${i})`).join(', ');

  return ask(game, presidentIndex,
    `You are President this round. Nominate a Chancellor from these eligible players: ${eligible}\n\nPICK: player number`,
    (text) => {
      const n = extractPick(text, 'PICK', eligibleIndices);
      if (n !== null) return n;
      // Name fallback
      for (const idx of eligibleIndices) {
        if (text.toLowerCase().includes(game.players[idx].name.toLowerCase())) return idx;
      }
      console.log(`[WARN] President gave invalid choice "${text.slice(0,60)}", picking random`);
      return eligibleIndices[Math.floor(Math.random() * eligibleIndices.length)];
    },
  );
}

export function getVoteIntention(game, playerIndex) {
  const president = game.players[game.presidentIndex].name;
  const chancellor = game.players[game.currentChancellorCandidate].name;

  return ask(game, playerIndex,
    `Quick: if you had to vote RIGHT NOW on the government ${president}/${chancellor}, would you vote JA or NEIN? Reply with one word only: JA or NEIN`,
    (text) => text.toLowerCase().includes('ja') ? 'ja' : 'nein',
  );
}

export function getDiscussion(game, playerIndex, turn = 0) {
  const president = game.players[game.presidentIndex].name;
  const chancellor = game.players[game.currentChancellorCandidate].name;
  const discussionTurns = 2;

  const first = isFirstCall(game, playerIndex, 'discussion');
  const thoughtPrompt = game.enableThoughts
    ? `\nTHOUGHT: your private strategy (not shared with other players)`
    : '';

  const alivePlayers = game.players
    .map((p, i) => ({ ...p, index: i }))
    .filter(p => p.alive && p.index !== playerIndex)
    .map(p => `${p.name} (#${p.index})`).join(', ');

  const prompt = first
    ? `DISCUSSION (Round ${game.round}, turn ${turn + 1}/${discussionTurns}).
${president} has nominated ${chancellor} as Chancellor. Debate this government before voting.

Other players: ${alivePlayers}
${thoughtPrompt}
MESSAGE: your public statement (1-2 sentences). Say MESSAGE: PASS to stay silent.`
    : `Your turn to speak (Round ${game.round}, turn ${turn + 1}/${discussionTurns}).${thoughtPrompt}
MESSAGE: your statement or PASS`;

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

export function getVote(game, playerIndex) {
  const president = game.players[game.presidentIndex].name;
  const chancellor = game.players[game.currentChancellorCandidate].name;

  const first = isFirstCall(game, playerIndex, 'vote');

  const prompt = first
    ? `Time to vote on the government: President ${president} + Chancellor ${chancellor}.
Vote JA (yes) or NEIN (no). Consider your role and strategy.

Reply in this exact format:
VOTE: JA (or NEIN)
REASON: your brief reasoning`
    : `Vote on ${president}/${chancellor}. VOTE: JA or NEIN\nREASON: brief`;

  return ask(game, playerIndex, prompt,
    (text) => {
      const voteMatch = text.match(/VOTE:\s*(JA|NEIN)/i);
      const reasonMatch = text.match(/REASON:\s*(.+)/is);
      return {
        vote: voteMatch ? voteMatch[1].toLowerCase() : (text.toLowerCase().includes('ja') ? 'ja' : 'nein'),
        reasoning: reasonMatch ? reasonMatch[1].trim().slice(0, 300) : text.slice(0, 300),
      };
    },
  );
}

export function presidentDiscardChoice(game) {
  const cards = game.drawnCards;
  const cardStr = cards.map((c, i) => `${i}: ${c.toUpperCase()}`).join(', ');

  return ask(game, game.presidentIndex,
    `LEGISLATIVE SESSION - You are President.
You drew 3 policy cards: [${cardStr}]
You must DISCARD one and pass the remaining 2 to the Chancellor.

Choose which card to DISCARD (0, 1, or 2).
Then say what you'll CLAIM you had (you can lie!).

Format:
DISCARD: 0 (or 1 or 2)
CLAIM: what you'll tell others you had`,
    (text) => {
      const discardMatch = text.match(/DISCARD:\s*(\d)/);
      const claimMatch = text.match(/CLAIM:\s*(.+)/is);
      const idx = discardMatch ? parseInt(discardMatch[1]) : 0;
      return {
        discardIndex: Math.min(Math.max(idx, 0), 2),
        claim: claimMatch ? claimMatch[1].trim().slice(0, 300) : 'No comment',
      };
    },
  );
}

export function chancellorPlayChoice(game) {
  const cards = game.drawnCards;
  const cardStr = cards.map((c, i) => `${i}: ${c.toUpperCase()}`).join(', ');

  return ask(game, game.currentChancellorCandidate,
    `LEGISLATIVE SESSION - You are Chancellor.
The President passed you 2 policy cards: [${cardStr}]
You must PLAY one policy.

Choose which card to PLAY (0 or 1).
Then say what you'll CLAIM happened (you can lie!).

Format:
PLAY: 0 (or 1)
CLAIM: what you'll tell others`,
    (text) => {
      const playMatch = text.match(/PLAY:\s*(\d)/);
      const claimMatch = text.match(/CLAIM:\s*(.+)/is);
      const idx = playMatch ? parseInt(playMatch[1]) : 0;
      return {
        playIndex: Math.min(Math.max(idx, 0), 1),
        claim: claimMatch ? claimMatch[1].trim().slice(0, 300) : 'No comment',
      };
    },
  );
}

export function chancellorVetoChoice(game) {
  const cards = game.drawnCards;
  const cardStr = cards.map((c, i) => `${i}: ${c.toUpperCase()}`).join(', ');

  return ask(game, game.currentChancellorCandidate,
    `VETO POWER is active (5+ fascist policies enacted).
You received 2 cards from the President: [${cardStr}]

You can PROPOSE A VETO to discard both cards (no policy enacted this round, but the election tracker advances). Both you and the President must agree.

Do you want to propose a veto? Consider your role and strategy.
Reply with: VETO or PLAY`,
    (text) => text.toUpperCase().includes('VETO'),
  );
}

export function presidentVetoDecision(game) {
  return ask(game, game.presidentIndex,
    `The Chancellor has proposed a VETO. If you accept, both policy cards are discarded and the election tracker advances. If you reject, the Chancellor must play one of the two cards.

Do you accept the veto? Consider your role and strategy.
Reply with: ACCEPT or REJECT`,
    (text) => text.toUpperCase().includes('ACCEPT'),
  );
}

export async function choosePowerTarget(game, power, eligibleIndices) {
  const presidentIndex = game.presidentIndex;
  const terms = t(game);
  const eligible = eligibleIndices.map(i => `${game.players[i].name} (#${i})`).join(', ');

  let instruction = '';
  switch (power) {
    case 'investigate':
      instruction = `You must INVESTIGATE one player to see their party membership. Choose wisely.`;
      break;
    case 'special_election':
      instruction = `You must choose the NEXT PRESIDENT (special election). Pick someone you trust (or want to manipulate).`;
      break;
    case 'kill':
      instruction = `You must EXECUTE one player. They are permanently eliminated. If you kill the ${terms.dictator}, ${terms.liberal.toLowerCase()}s win.`;
      break;
    case 'peek':
      return { targetIndex: null };
  }

  const targetIndex = await ask(game, presidentIndex,
    `PRESIDENTIAL POWER: ${power.toUpperCase()}\n${instruction}\n\nEligible targets: ${eligible}\n\nTARGET: player number`,
    (text) => {
      const n = extractPick(text, 'TARGET', eligibleIndices);
      if (n !== null) return n;
      for (const idx of eligibleIndices) {
        if (text.toLowerCase().includes(game.players[idx].name.toLowerCase())) return idx;
      }
      console.log(`[WARN] Invalid power target "${text.slice(0,60)}", picking random`);
      return eligibleIndices[Math.floor(Math.random() * eligibleIndices.length)];
    },
  );

  let claim = null;
  if (power === 'investigate') {
    const actualParty = game.players[targetIndex].party;
    claim = await ask(game, presidentIndex,
      `You investigated ${game.players[targetIndex].name} and found they are: ${actualParty.toUpperCase()}.\nWhat will you CLAIM to the group? You can tell the truth or lie.\n\nReply with: CLAIM: ${terms.liberal.toLowerCase()} (or ${terms.fascist.toLowerCase()})`,
      (text) => {
        return text.toLowerCase().includes('fascist') || text.toLowerCase().includes(terms.fascist.toLowerCase())
          ? terms.fascist.toLowerCase() : terms.liberal.toLowerCase();
      },
    );
  }

  return { targetIndex, claim };
}
