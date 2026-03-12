/**
 * Werewolf - LLM Prompts
 * Concise prompts targeting ~100k tokens per game.
 */

import { askLLM } from '../../core/llm-client.js';

const FULL_DETAIL_ROUNDS = 2;

function getPlayerModel(game, playerIndex) {
  return game.players[playerIndex].model || game.model;
}

function buildSystemPrompt(game, playerIndex) {
  const player = game.players[playerIndex];
  const alive = game.players
    .map((p, i) => p.alive ? `  ${p.name} (#${i})` : `  ${p.name} (#${i}) [DEAD]`)
    .join('\n');

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

  // Mayor info
  let mayorInfo = '';
  if (game.mayor !== null && game.mayor !== undefined) {
    const mayorName = game.players[game.mayor]?.name;
    if (game.mayor === playerIndex) {
      mayorInfo = `\nYou are the MAYOR. Your vote breaks ties during elimination votes.`;
    } else {
      mayorInfo = `\nThe Mayor is ${mayorName}. The Mayor's vote breaks ties.`;
    }
  }

  // Knowledge from seer
  const knowledge = game.log
    .filter(e => e.type === 'seer_inspect' && playerIndex === game.players.findIndex(p => p.role === 'seer'))
    .map(e => `  ${e.targetName}: ${e.result}`)
    .join('\n');
  const knowledgeStr = knowledge ? `\nYour inspections:\n${knowledge}` : '';

  return `You are ${player.name} in a Werewolf game.
${roleInfo}${mayorInfo}${knowledgeStr}

Players:
${alive}

Rules:
- Werewolves MUST kill someone every night (no skipping).
- If nobody dies at dawn, it means the Witch used her save potion (single-use for the entire game).
- All day discussions, votes, and mayor elections are PUBLIC.
- Be CONCISE (1-2 sentences). Only elaborate with real arguments.`;
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
  const systemPrompt = buildSystemPrompt(game, playerIndex);
  const context = buildContext(game);
  return askLLM({
    gameId: game.id,
    model: getPlayerModel(game, playerIndex),
    systemPrompt,
    userPrompt: `${context}\n\n${userPrompt}`,
    playerName: game.players[playerIndex].name,
    parseResponse,
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
    `MAYOR VOTE: Choose who should be Mayor.\nCandidates: ${candidateStr}\nReply: player number`,
    (text) => {
      const nums = [...text.matchAll(/(\d+)/g)].map(m => parseInt(m[1]));
      for (const n of nums) if (candidates.includes(n)) return n;
      return candidates[Math.floor(Math.random() * candidates.length)];
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

  const chatStr = chatHistory.length > 0
    ? `\nYour private conversation:\n${chatHistory.map(m => `${m.name}: "${m.message}"`).join('\n')}\n`
    : '';

  return ask(game, wolfIndex,
    `NIGHT - WOLF CHAT (private with ${partner?.name || 'partner'}).${chatStr}
Possible targets: ${eligibleStr}
Discuss strategy and suggest a target. Be brief.

MESSAGE: your message to your partner
TARGET: player number (your current preference)`,
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

  // Get wolf chat history for context
  const wolfChatMsgs = game.log
    .filter(e => e.type === 'wolf_chat' && e.round === game.round)
    .map(e => `${e.playerName}: "${e.message}"`).join('\n');

  const chatContext = wolfChatMsgs ? `\nYour discussion:\n${wolfChatMsgs}\n` : '';

  const promises = wolves.map(w =>
    ask(game, w.index,
      `NIGHT: Final decision. Choose your victim.${chatContext}\nTargets: ${eligibleStr}\nReply with the player number only.`,
      (text) => {
        const nums = [...text.matchAll(/(\d+)/g)].map(m => parseInt(m[1]));
        for (const n of nums) if (eligible.some(e => e.index === n)) return n;
        return eligible[Math.floor(Math.random() * eligible.length)].index;
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

  const pastResults = game.log
    .filter(e => e.type === 'seer_inspect')
    .map(e => `  ${e.targetName}: ${e.result}`)
    .join('\n');

  const pastInfo = pastResults ? `\nYour past inspections:\n${pastResults}\n` : '';

  const thoughtPrompt = game.enableThoughts
    ? `\nTHOUGHT: your private reasoning about who to inspect and why`
    : '';

  return ask(game, seerIndex,
    `NIGHT: Choose someone to inspect.${pastInfo}\nPlayers: ${eligibleStr}${thoughtPrompt}\nTARGET: player number only`,
    (text) => {
      const thoughtMatch = text.match(/THOUGHT:\s*(.+?)(?=\nTARGET:)/is);
      const nums = [...text.matchAll(/(\d+)/g)].map(m => parseInt(m[1]));
      let target = null;
      for (const n of nums) if (eligible.some(e => e.index === n)) { target = n; break; }
      if (target === null) target = eligible[Math.floor(Math.random() * eligible.length)].index;
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
  const roundDiscussion = game.log
    .filter(e => e.type === 'discussion' && e.round === game.round)
    .map(e => `${e.playerName}: "${e.message}"`)
    .join('\n');

  const thoughtPrompt = game.enableThoughts
    ? `\nTHOUGHT: your private reasoning (not shared with other players)`
    : '';

  return ask(game, playerIndex,
    `DAY PHASE: Discuss who to eliminate.${roundDiscussion ? `\n\nSaid so far:\n${roundDiscussion}` : ''}

Choose a stance and speak (or PASS). NAME specific players when accusing or defending.
- ATTACK: accuse a player by name
- DEFENSE: defend yourself if accused
- ANALYSIS: observations about specific players
- PASS: stay silent
${thoughtPrompt}
STANCE: attack/defense/analysis/pass
MESSAGE: your PUBLIC statement (1-2 sentences, name players)`,
    (text) => {
      const thoughtMatch = text.match(/THOUGHT:\s*(.+?)(?=\nSTANCE:)/is);
      const stanceMatch = text.match(/STANCE:\s*(attack|defense|analysis|pass)/i);
      const messageMatch = text.match(/MESSAGE:\s*(.+)/is);
      const stance = stanceMatch ? stanceMatch[1].toLowerCase() : 'analysis';
      const message = stance === 'pass' ? 'PASS' :
        (messageMatch ? messageMatch[1].replace(/^["']|["']$/g, '').trim() : 'PASS');
      const thought = thoughtMatch ? thoughtMatch[1].trim() : null;
      return { stance, message, thought };
    },
  );
}

export function getDayRebuttal(game, playerIndex) {
  const roundDiscussion = game.log
    .filter(e => e.type === 'discussion' && e.round === game.round)
    .map(e => `${e.playerName}: "${e.message}"`)
    .join('\n');

  return ask(game, playerIndex,
    `Discussion:\n${roundDiscussion}\n\nYour name was mentioned. Respond briefly (1 sentence) or PASS.`,
    (text) => {
      const clean = text.replace(/^["']|["']$/g, '').replace(/^MESSAGE:\s*/i, '').trim();
      return clean.toUpperCase() === 'PASS' ? 'PASS' : clean;
    },
  );
}

export function getRunoffVote(game, playerIndex, tiedPlayers) {
  const tiedStr = tiedPlayers.map(i => `${game.players[i].name} (#${i})`).join(', ');

  return ask(game, playerIndex,
    `RUNOFF VOTE: There was a tie. Vote again between: ${tiedStr}\nYou MUST choose one. Reply: player number`,
    (text) => {
      const nums = [...text.matchAll(/(\d+)/g)].map(m => parseInt(m[1]));
      for (const n of nums) if (tiedPlayers.includes(n)) return { target: n };
      return { target: tiedPlayers[Math.floor(Math.random() * tiedPlayers.length)] };
    },
  );
}

export function getDayVote(game, playerIndex) {
  const alive = game.players
    .map((p, i) => ({ ...p, index: i }))
    .filter(p => p.alive && p.index !== playerIndex);

  const eligibleStr = alive.map(p => `${p.name} (#${p.index})`).join(', ');

  const roundDiscussion = game.log
    .filter(e => e.type === 'discussion' && e.round === game.round)
    .map(e => `${e.playerName}: "${e.message}"`)
    .join('\n');

  return ask(game, playerIndex,
    `VOTE: You MUST vote to eliminate someone. No abstention allowed.${roundDiscussion ? `\nDiscussion:\n${roundDiscussion}\n` : ''}
Players: ${eligibleStr}
Reply: player number`,
    (text) => {
      const nums = [...text.matchAll(/(\d+)/g)].map(m => parseInt(m[1]));
      for (const n of nums) if (alive.some(a => a.index === n)) return { target: n };
      return { target: alive[Math.floor(Math.random() * alive.length)].index };
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
    `You are being eliminated. As Mayor, you must name your successor.\nPlayers: ${eligibleStr}\nReply: player number`,
    (text) => {
      const nums = [...text.matchAll(/(\d+)/g)].map(m => parseInt(m[1]));
      for (const n of nums) if (eligible.some(e => e.index === n)) return n;
      return eligible[Math.floor(Math.random() * eligible.length)].index;
    },
  );
}
