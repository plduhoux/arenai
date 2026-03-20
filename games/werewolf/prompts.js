/**
 * Werewolf - LLM Prompts
 * Concise prompts targeting ~100k tokens per game.
 */

import { askLLM, askLLMSession } from '../../core/llm-client.js';

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
  // 1. Try the labeled line first
  const labelRegex = new RegExp(`${label}:\\s*#?(\\d+)`, 'i');
  const labelMatch = text.match(labelRegex);
  if (labelMatch) {
    const n = parseInt(labelMatch[1]);
    if (validIndices.includes(n)) return n;
  }

  // 2. Fallback: extract from labeled line with broader search
  const lineRegex = new RegExp(`${label}:\\s*(.*)`, 'i');
  const lineMatch = text.match(lineRegex);
  if (lineMatch) {
    const nums = [...lineMatch[1].matchAll(/(\d+)/g)].map(m => parseInt(m[1]));
    for (const n of nums) if (validIndices.includes(n)) return n;
  }

  // 3. Last resort: last valid number in the full text (LLMs reason first, answer last)
  const allNums = [...text.matchAll(/(\d+)/g)].map(m => parseInt(m[1]));
  for (let i = allNums.length - 1; i >= 0; i--) {
    if (validIndices.includes(allNums[i])) return allNums[i];
  }

  return null;
}

const FULL_DETAIL_ROUNDS = 2;

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
  
  // Get events since last call, filtered to what this player can see
  const player = game.players[playerIndex];
  const newEvents = game.log.slice(cursor).filter(e => {
    // Skip player's own messages (they already know what they said - it's in their assistant response)
    const isOwnEvent = e.player === playerIndex;
    
    // Wolf chat: only visible to wolves, skip own messages
    if (e.type === 'wolf_chat') return player.role === 'werewolf' && !isOwnEvent;
    // Discussion: skip own messages
    if (e.type === 'discussion') return !isOwnEvent;
    // Vote: skip own votes
    if (e.type === 'vote') return !isOwnEvent;
    // Mayor candidacy: skip own candidacy
    if (e.type === 'mayor_candidacy') return !isOwnEvent;
    // Seer inspect result: visible to seer (they need to know the result!)
    if (e.type === 'seer_inspect') return player.role === 'seer';
    // Witch action only visible to witch (always own action, skip)
    if (e.type === 'witch_save' || e.type === 'witch_kill') return false;
    // Private thoughts not shared
    if (e.type === 'thought') return false;
    // Everything else is public
    return true;
  });
  
  // Update cursor
  playerLogCursors.set(key, game.log.length);
  
  return newEvents;
}

function formatNewEvents(events) {
  const lines = [];
  for (const e of events) {
    switch (e.type) {
      case 'dawn':
        if (e.deaths?.length) lines.push(`Dawn: ${e.deaths.map(d => `${d.name} was killed`).join(', ')}.`);
        else lines.push('Dawn: everyone survived (Witch saved).');
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
      case 'wolf_chat':
        lines.push(`[Wolf] ${e.playerName}: "${e.message}"`);
        break;
      case 'seer_inspect':
        lines.push(`[Seer] You inspected ${e.targetName}: ${e.result}`);
        break;
      case 'mayor_candidacy':
        lines.push(`${e.playerName} ${e.runs ? 'runs for mayor' : 'declines'}: "${e.reason || ''}"`);
        break;
      case 'mayor_elected':
        lines.push(`${e.playerName} elected Mayor.`);
        break;
      case 'mayor_successor':
        lines.push(`${e.playerName} named ${e.successorName} as new Mayor.`);
        break;
      case 'wolf_action':
        lines.push(`Wolves targeted ${e.targetName}.`);
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
  // Static player list: deaths are communicated via events in the conversation
  const playerList = game.players.map((p, i) => `  ${p.name} (#${i})`).join('\n');

  let roleInfo = '';
  switch (player.role) {
    case 'werewolf': {
      const partner = game.players.find((p, i) => i !== playerIndex && p.role === 'werewolf');
      roleInfo = `You are a WEREWOLF. Your partner: ${partner?.name || 'unknown'}. You know each other's identity. At night you discuss and choose a victim together. By day, you must avoid being discovered. You win when wolves equal or outnumber villagers.`;
      break;
    }
    case 'seer':
      roleInfo = `You are the SEER. Each night you learn one player's true role. Use this info carefully: revealing yourself makes you a target.`;
      break;
    case 'witch':
      roleInfo = `You are the WITCH. You have two potions, each single-use for the entire game: a SAVE potion (revive tonight's victim, can save yourself) and a KILL potion (eliminate any player at night). You may use both the same night.`;
      break;
    default:
      roleInfo = `You are a VILLAGER. Find and eliminate the werewolves through discussion and voting.`;
  }

  return `You are ${player.name} in a Werewolf game.
${roleInfo}

Players:
${playerList}

Rules:
- Werewolves MUST kill someone every night (no skipping).
- If nobody dies at dawn, it means the Witch used her save potion (single-use for the entire game).
- All day discussions, votes, and mayor elections are PUBLIC.
- Be CONCISE (1-2 sentences). Only elaborate with real arguments.
- Deaths, eliminations, and mayor changes are announced as events during the game.`;
}

function buildContext(game) {
  const rounds = new Map();
  for (const e of game.log) {
    if (!e.round) continue;
    if (!rounds.has(e.round)) rounds.set(e.round, []);
    rounds.get(e.round).push(e);
  }

  const lines = [];
  const cutoff = game.round - FULL_DETAIL_ROUNDS;

  for (const [r, events] of [...rounds].sort((a, b) => a[0] - b[0])) {
    if (r <= cutoff) {
      const dawn = events.find(e => e.type === 'dawn');
      const elim = events.find(e => e.type === 'elimination');
      let line = `[Night ${r}] `;
      if (dawn?.deaths?.length) line += `Killed: ${dawn.deaths.map(d => d.name).join(', ')}. `;
      else line += 'No deaths (Witch saved). ';
      if (elim) line += `Voted out: ${elim.targetName} (${elim.role}). `;
      lines.push(line);
    } else {
      for (const e of events) {
        const line = formatEvent(e);
        if (line) lines.push(line);
      }
    }
  }

  // Include mayor election
  const mayorEvents = game.log.filter(e => e.type === 'mayor_candidacy' || e.type === 'mayor_vote' || e.type === 'mayor_elected');
  if (mayorEvents.length && lines.length === 0) {
    for (const e of mayorEvents) {
      if (e.type === 'mayor_candidacy') lines.push(`[Election] ${e.playerName} ${e.runs ? 'runs for mayor' : 'declines'}: "${e.reason || ''}"`);
      if (e.type === 'mayor_elected') lines.push(`[Election] ${e.playerName} elected Mayor`);
    }
  }

  return lines.length ? `HISTORY:\n${lines.join('\n')}` : '(First night)';
}

function formatEvent(e) {
  switch (e.type) {
    case 'dawn':
      if (e.deaths?.length) return `[Night ${e.round}] Dawn: ${e.deaths.map(d => `${d.name} was killed`).join(', ')}.`;
      return `[Night ${e.round}] Dawn: everyone survived (Witch saved).`;
    case 'discussion': return `[Day ${e.round}] ${e.playerName}: "${e.message}"`;
    case 'vote': return `[Day ${e.round}] ${e.playerName} votes ${e.targetName}`;
    case 'elimination': return `[Day ${e.round}] ${e.targetName} eliminated (was ${e.role}).`;
    case 'no_elimination': return `[Day ${e.round}] No majority: nobody eliminated.`;
    case 'wolf_chat': return null; // private, not in public history
    default: return null;
  }
}

function ask(game, playerIndex, userPrompt, parseResponse) {
  const model = getPlayerModel(game, playerIndex);
  const systemPrompt = buildSystemPrompt(game, playerIndex, { static: true });

  // Always use sessions: send delta events + prompt.
  // Cache handles the rest (Anthropic caches the prefix automatically).
  // Haiku threshold is 2048 tokens (kicks in after a few turns).
  // Sonnet/Opus threshold is 1024 (kicks in almost immediately).
  const newEvents = getNewEvents(game, playerIndex);
  const deltaContext = formatNewEvents(newEvents);
  const fullPrompt = deltaContext 
    ? `${deltaContext}\n\n${userPrompt}` 
    : userPrompt;

  // Wrap parseResponse to strip markdown before parsing commands
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

// --- Mayor Election ---

export function getMayorCandidacy(game, playerIndex) {
  const others = game.players.filter((_, i) => i !== playerIndex).map(p => p.name).join(', ');
  const thoughtPrompt = game.enableThoughts
    ? `\nTHOUGHT: your private reasoning (not shared)`
    : '';

  return ask(game, playerIndex,
    `MAYOR ELECTION: Do you want to run for Mayor? The Mayor breaks ties during votes.
Other players: ${others}

Your answer is PUBLIC. All players will hear your REASON.
${thoughtPrompt}
RUN: yes/no
REASON: your PUBLIC justification (1 sentence)`,
    (text) => {
      const thoughtMatch = text.match(/THOUGHT:\s*(.+?)(?=\nRUN:)/is);
      const runMatch = text.match(/RUN:\s*(yes|no)/i);
      const reasonMatch = text.match(/REASON:\s*(.+)/is);
      return {
        runs: runMatch ? runMatch[1].toLowerCase() === 'yes' : false,
        reason: reasonMatch ? reasonMatch[1].trim().slice(0, 120) : '',
        thought: thoughtMatch ? thoughtMatch[1].trim() : null,
      };
    },
  );
}

export function getMayorVote(game, playerIndex, candidates) {
  const candidateStr = candidates.map(i => `${game.players[i].name} (#${i})`).join(', ');
  return ask(game, playerIndex,
    `MAYOR VOTE: Choose who should be Mayor.\nCandidates: ${candidateStr}\nPICK: player number`,
    (text) => {
      const n = extractPick(text, 'PICK', candidates);
      return n !== null ? n : candidates[Math.floor(Math.random() * candidates.length)];
    },
  );
}

// --- Wolf Night Chat ---

export function getWolfChat(game, wolfIndex, chatHistory) {
  const partner = game.players.find((p, i) => i !== wolfIndex && p.role === 'werewolf' && p.alive);
  const eligible = game.players
    .map((p, i) => ({ ...p, index: i }))
    .filter(p => p.alive && p.party !== 'werewolf');
  const eligibleStr = eligible.map(p => `${p.name} (#${p.index})`).join(', ');

  // First call: full instruction. Subsequent: just ask to respond.
  const first = isFirstCall(game, wolfIndex, 'wolf_chat');
  const prompt = first
    ? `NIGHT - WOLF CHAT (private with ${partner?.name || 'partner'}).
Possible targets: ${eligibleStr}
Discuss strategy and suggest a target. Be brief.

MESSAGE: your message to your partner
TARGET: player number (your current preference)`
    : `Respond to your partner.`;

  return ask(game, wolfIndex, prompt,
    (text) => {
      const messageMatch = text.match(/MESSAGE:\s*(.+?)(?=\nTARGET:|$)/is);
      const targetMatch = text.match(/TARGET:\s*(\d+)/i);
      const message = messageMatch ? messageMatch[1].trim().slice(0, 200) : 'Let\'s pick someone.';
      let target = null;
      if (targetMatch) {
        const idx = parseInt(targetMatch[1]);
        if (eligible.some(e => e.index === idx)) target = idx;
      }
      return { message, target };
    },
  );
}

// --- Night Actions ---

export function wolfChooseTarget(game) {
  // Wolves already discussed; final vote
  const wolves = game.players
    .map((p, i) => ({ ...p, index: i }))
    .filter(p => p.alive && p.role === 'werewolf');

  const eligible = game.players
    .map((p, i) => ({ ...p, index: i }))
    .filter(p => p.alive && p.party !== 'werewolf');

  const eligibleStr = eligible.map(p => `${p.name} (#${p.index})`).join(', ');

  const promises = wolves.map(w =>
    ask(game, w.index,
      `Final decision. Choose your victim.\nTARGET: player number`,
      (text) => {
        const validIndices = eligible.map(e => e.index);
        const n = extractPick(text, 'TARGET', validIndices);
        return n !== null ? n : eligible[Math.floor(Math.random() * eligible.length)].index;
      },
    )
  );

  return Promise.all(promises).then(votes => {
    const counts = {};
    for (const v of votes) counts[v] = (counts[v] || 0) + 1;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return parseInt(sorted[0][0]);
  });
}

export function seerInspect(game) {
  const seerIndex = game.players.findIndex(p => p.alive && p.role === 'seer');
  if (seerIndex === -1) return Promise.resolve(null);

  const eligible = game.players
    .map((p, i) => ({ ...p, index: i }))
    .filter(p => p.alive && p.index !== seerIndex);

  const eligibleStr = eligible.map(p => `${p.name} (#${p.index})`).join(', ');

  const first = isFirstCall(game, seerIndex, 'seer');
  const thoughtPrompt = game.enableThoughts
    ? `\nTHOUGHT: your private reasoning`
    : '';

  const prompt = first
    ? `NIGHT: Choose a player to inspect (learn their true role).\nPlayers: ${eligibleStr}${thoughtPrompt}\nTARGET: player number only`
    : `Choose someone to inspect.\nPlayers: ${eligibleStr}\nTARGET: player number only`;

  return ask(game, seerIndex, prompt,
    (text) => {
      const thoughtMatch = text.match(/THOUGHT:\s*(.+?)(?=\nTARGET:)/is);
      const validIndices = eligible.map(e => e.index);
      const target = extractPick(text, 'TARGET', validIndices)
        ?? eligible[Math.floor(Math.random() * eligible.length)].index;
      return { target, thought: thoughtMatch ? thoughtMatch[1].trim() : null };
    },
  );
}

export function witchDecide(game, wolfTargetIndex) {
  const witchIndex = game.players.findIndex(p => p.alive && p.role === 'witch');
  if (witchIndex === -1) return Promise.resolve({ save: false, killTarget: null });

  const victim = game.players[wolfTargetIndex];
  const canSave = game.witchSaveAvailable;
  const canKill = game.witchKillAvailable;

  if (!canSave && !canKill) return Promise.resolve({ save: false, killTarget: null });

  const eligible = game.players
    .map((p, i) => ({ ...p, index: i }))
    .filter(p => p.alive && p.index !== wolfTargetIndex && p.index !== witchIndex);

  let prompt = `NIGHT: The werewolves attacked ${victim.name}.`;
  if (canSave) prompt += `\nYou can SAVE ${victim.name} (single-use potion).${wolfTargetIndex === witchIndex ? ' You are the target - you may save yourself.' : ''}`;
  if (canKill) prompt += `\nYou can KILL someone with your poison (single-use): ${eligible.map(p => `${p.name} (#${p.index})`).join(', ')}`;
  if (canSave && canKill) prompt += `\nYou may use both potions the same night.`;
  const thoughtPrompt = game.enableThoughts
    ? `\nTHOUGHT: your private reasoning about whether to use your potions and why`
    : '';

  prompt += `\n${thoughtPrompt}\nSAVE: yes/no\nKILL: player number or none`;

  return ask(game, witchIndex, prompt,
    (text) => {
      const thoughtMatch = text.match(/THOUGHT:\s*(.+?)(?=\nSAVE:)/is);
      const save = canSave && /SAVE:\s*yes/i.test(text);
      const killMatch = text.match(/KILL:\s*(\d+)/i);
      let killTarget = null;
      if (canKill && killMatch) {
        const idx = parseInt(killMatch[1]);
        if (eligible.some(e => e.index === idx)) killTarget = idx;
      }
      return { save, killTarget, thought: thoughtMatch ? thoughtMatch[1].trim() : null };
    },
  );
}

// --- Day Actions ---

export function getDayDiscussion(game, playerIndex) {
  const first = isFirstCall(game, playerIndex, 'discussion');
  const thoughtPrompt = game.enableThoughts
    ? `\nTHOUGHT: your private reasoning (not shared with other players)`
    : '';

  const prompt = first
    ? `DAY PHASE: Discuss who to eliminate. You speak one at a time. React to what others have said.

Choose a stance and speak (or PASS). NAME specific players when accusing or defending.
- ATTACK: accuse a player by name with a specific reason
- DEFENSE: defend yourself or counter an accusation
- ANALYSIS: share observations about specific players
- PASS: stay silent (only if you truly have nothing to add)
${thoughtPrompt}
STANCE: attack/defense/analysis/pass
MESSAGE: your PUBLIC statement (2-3 sentences, reference other players' arguments)`
    : `Your turn to speak. Respond to what's been said, build on arguments, or challenge them.${thoughtPrompt}
STANCE: attack/defense/analysis/pass
MESSAGE: your PUBLIC statement`;

  return ask(game, playerIndex, prompt,
    (text) => {
      const thoughtMatch = text.match(/THOUGHT:\s*(.+?)(?=\n(?:STANCE|MESSAGE|RUN))/is);
      const stanceMatch = text.match(/STANCE:\s*(attack|defense|analysis|pass)/i);
      const messageMatch = text.match(/MESSAGE:\s*(.+)/is);
      const stance = stanceMatch ? stanceMatch[1].toLowerCase() : 'analysis';
      let message = 'PASS';
      if (stance !== 'pass' && messageMatch) {
        message = messageMatch[1]
          .replace(/THOUGHT:\s*.+/is, '')
          .replace(/^["']|["']$/g, '')
          .trim() || 'PASS';
      }
      const thought = thoughtMatch ? thoughtMatch[1].trim() : null;
      return { stance, message, thought };
    },
  );
}



export function getRunoffVote(game, playerIndex, tiedPlayers) {
  const tiedStr = tiedPlayers.map(i => `${game.players[i].name} (#${i})`).join(', ');

  return ask(game, playerIndex,
    `RUNOFF VOTE: There was a tie. Vote again between: ${tiedStr}\nYou MUST choose one.\nPICK: player number`,
    (text) => {
      const n = extractPick(text, 'PICK', tiedPlayers);
      return n !== null ? { target: n } : { target: tiedPlayers[Math.floor(Math.random() * tiedPlayers.length)] };
    },
  );
}

export function getDayVote(game, playerIndex) {
  const alive = game.players
    .map((p, i) => ({ ...p, index: i }))
    .filter(p => p.alive && p.index !== playerIndex);

  const eligibleStr = alive.map(p => `${p.name} (#${p.index})`).join(', ');

  return ask(game, playerIndex,
    `VOTE: Eliminate someone. ${eligibleStr}\nPICK: player number`,
    (text) => {
      const validIndices = alive.map(a => a.index);
      const n = extractPick(text, 'PICK', validIndices);
      return n !== null ? { target: n } : { target: alive[Math.floor(Math.random() * alive.length)].index };
    },
  );
}

// --- Mayor Successor ---

export function getMayorSuccessor(game, dyingMayorIndex) {
  const eligible = game.players
    .map((p, i) => ({ ...p, index: i }))
    .filter(p => p.alive && p.index !== dyingMayorIndex);

  const eligibleStr = eligible.map(p => `${p.name} (#${p.index})`).join(', ');

  return ask(game, dyingMayorIndex,
    `You are being eliminated. As Mayor, you must name your successor.\nPlayers: ${eligibleStr}\nPICK: player number`,
    (text) => {
      const validIndices = eligible.map(e => e.index);
      const n = extractPick(text, 'PICK', validIndices);
      return n !== null ? n : eligible[Math.floor(Math.random() * eligible.length)].index;
    },
  );
}
