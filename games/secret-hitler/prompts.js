/**
 * Secret Hitler - LLM Prompts
 * All prompt templates and LLM interactions specific to this game.
 */

import { askLLM } from '../../core/llm-client.js';

const PLAYER_COLORS = ['R', 'B', 'G', 'Y', 'P', 'O', 'W', 'Br', 'Pk', 'Gr'];

// How many recent rounds get full detail
const FULL_DETAIL_ROUNDS = 3;

function t(game) { return game.terms; }

function getPlayerModel(game, playerIndex) {
  return game.players[playerIndex].model || game.model;
}

function buildSystemPrompt(game, playerIndex) {
  const player = game.players[playerIndex];
  const terms = t(game);
  const alivePlayers = game.players
    .map((p, i) => p.alive ? `  [${PLAYER_COLORS[i]}] ${p.name} (#${i})` : `  [X] ${p.name} (#${i}) [DEAD]`)
    .join('\n');

  let roleInfo = '';
  if (player.role === 'liberal') {
    roleInfo = `You are a ${terms.liberal}. You don't know anyone else's role. Your goal is to enact ${game.winPolicies?.liberal || 5} ${terms.liberal} policies or find and kill the ${terms.hitler}.`;
  } else if (player.role === 'fascist') {
    // Fascists know each other AND know who Hitler is
    const teammates = game.players
      .filter((p, i) => i !== playerIndex && p.party === 'fascist')
      .map(p => `${p.name} (${p.role === 'hitler' ? terms.hitler : terms.fascist})`)
      .join(', ');
    roleInfo = `You are a ${terms.fascist}. Your teammates: ${teammates}. Your goal is to enact ${game.winPolicies?.fascist || 6} ${terms.fascist} policies or get the ${terms.hitler} elected Chancellor after 3 ${terms.fascist} policies are enacted. Help the ${terms.hitler} but don't be obvious about it. Lie, deceive, and manipulate.`;
  } else {
    if (game.players.length <= 6) {
      const fascist = game.players.find((p, i) => i !== playerIndex && p.role === 'fascist');
      roleInfo = `You are the ${terms.hitler}. Your ${terms.fascist} teammate is ${fascist.name}. Your goal: stay hidden, appear ${terms.liberal.toLowerCase()}, and get elected Chancellor after 3 ${terms.fascist} policies. You win if ${terms.fascist.toLowerCase()}s enact 6 policies too. Be careful: if you get killed, your team loses.`;
    } else {
      roleInfo = `You are the ${terms.hitler}. You do NOT know who the other ${terms.fascist.toLowerCase()}s are (they know you though). Your goal: appear as ${terms.liberal.toLowerCase()} as possible, stay alive, and get elected Chancellor after 3 ${terms.fascist} policies. Be careful: if you get killed, your team loses.`;
    }
  }

  return `You are ${player.name}, playing a social deduction board game.

GAME RULES SUMMARY:
- Players are secretly ${terms.liberal}s or ${terms.fascist}s. One ${terms.fascist} is the ${terms.hitler}.
- Each round: a President nominates a Chancellor, everyone votes.
- If elected, President draws 3 policy cards, discards 1. Chancellor gets 2, plays 1.
- Policy deck has 11 ${terms.fascist} and 6 ${terms.liberal} cards.
- ${terms.liberal}s win: ${game.winPolicies?.liberal || 5} ${terms.liberal} policies OR killing the ${terms.hitler}.
- ${terms.fascist}s win: ${game.winPolicies?.fascist || 6} ${terms.fascist} policies OR electing the ${terms.hitler} as Chancellor after 3+ ${terms.fascist} policies.
- After 3 failed elections in a row, top policy auto-enacted.
- ${terms.fascist} policies may grant the President powers (investigate, peek, special election, execute).

YOUR ROLE:
${roleInfo}

PLAYERS:
${alivePlayers}

CRITICAL RULES:
- Be strategic and stay in character.
- Be CONCISE. Short is better. If you have nothing interesting to say, say very little or pass.
- Only elaborate when you have a real argument, accusation, or defense to make.
- 1 sentence is fine. 2-3 max if you have something important.
- When lying, be convincing. When accusing, have reasons.`;
}

function buildGameContext(game) {
  const terms = t(game);
  const winLib = game.winPolicies?.liberal || 5;
  const winFas = game.winPolicies?.fascist || 6;
  const policies = `${terms.liberal} policies: ${game.liberalPolicies}/${winLib} | ${terms.fascist} policies: ${game.fascistPolicies}/${winFas}`;
  const tracker = `Election tracker: ${game.electionTracker}/3`;

  const roundMap = new Map();
  for (const e of game.log) {
    if (!e.round) continue;
    if (!roundMap.has(e.round)) roundMap.set(e.round, []);
    roundMap.get(e.round).push(e);
  }

  const rounds = [...roundMap.keys()].sort((a, b) => a - b);
  const cutoff = game.round - FULL_DETAIL_ROUNDS;
  const lines = [];

  for (const r of rounds) {
    const events = roundMap.get(r);
    if (r <= cutoff) {
      lines.push(summarizeRound(r, events, terms));
    } else {
      for (const e of events) {
        const line = formatEvent(e, terms);
        if (line) lines.push(line);
      }
    }
  }

  return `CURRENT STATE:\n${policies}\n${tracker}\nRound: ${game.round}\n\nGAME HISTORY:\n${lines.join('\n') || '(Game just started)'}`;
}

function summarizeRound(round, events, terms) {
  const nom = events.find(e => e.type === 'nomination');
  const vote = events.find(e => e.type === 'election_result');
  const policy = events.find(e => e.type === 'policy_enacted');
  const kill = events.find(e => e.type === 'power_kill');
  const investigate = events.find(e => e.type === 'power_investigate');
  const special = events.find(e => e.type === 'power_special_election');

  // No discussions in summaries - only votes, policies, and powers
  let summary = `[R${round}] `;
  if (nom) summary += `${nom.presidentName}->${nom.chancellorName} `;

  const votes = events.filter(e => e.type === 'vote');
  if (votes.length > 0) {
    const jaVoters = votes.filter(v => v.vote === 'ja').map(v => v.playerName);
    const neinVoters = votes.filter(v => v.vote === 'nein').map(v => v.playerName);
    if (vote) {
      summary += vote.passed ? 'PASS' : 'FAIL';
      summary += ` (Ja:${jaVoters.join(',')}|Nein:${neinVoters.join(',')}) `;
    }
  }

  if (policy) {
    summary += `${policy.chaos ? 'CHAOS ' : ''}${policy.policy.toUpperCase()} enacted. `;
  }

  if (kill) summary += `Killed ${kill.targetName}${kill.wasHitler ? ` (${terms.hitler}!)` : ''}. `;
  if (investigate) summary += `Investigated ${investigate.targetName}, claimed ${investigate.claim || '?'}. `;
  if (special) summary += `Special election: ${special.newPresidentName}. `;

  return summary;
}

function formatEvent(e, terms) {
  switch (e.type) {
    case 'nomination': return `[Round ${e.round}] ${e.presidentName} nominated ${e.chancellorName} as Chancellor.`;
    case 'election_result': return `[Round ${e.round}] Vote: ${e.ja} Ja / ${e.nein} Nein - ${e.passed ? 'PASSED' : 'FAILED'}`;
    case 'vote': return `[Round ${e.round}] ${e.playerName} voted ${e.vote.toUpperCase()}`;
    case 'policy_enacted': return `[Round ${e.round}] ${e.chaos ? 'CHAOS: ' : ''}${e.policy.toUpperCase()} policy enacted. (${terms.liberal}: ${e.liberalTotal}/5, ${terms.fascist}: ${e.fascistTotal}/6)`;
    case 'discussion': return `[Round ${e.round}] ${e.playerName}: "${e.message}"`;
    case 'power_kill': return `[Round ${e.round}] President executed ${e.targetName}!${e.wasHitler ? ` IT WAS THE ${terms.hitler.toUpperCase()}!` : ''}`;
    case 'power_investigate': return `[Round ${e.round}] President investigated ${e.targetName}. Claimed: ${e.claim || 'unknown'}`;
    case 'power_special_election': return `[Round ${e.round}] Special election! ${e.newPresidentName} is the new President.`;
    default: return null;
  }
}

// Helper to call LLM for a specific player
function ask(game, playerIndex, userPrompt, parseResponse) {
  const systemPrompt = buildSystemPrompt(game, playerIndex);
  const context = buildGameContext(game);
  return askLLM({
    gameId: game.id,
    model: getPlayerModel(game, playerIndex),
    systemPrompt,
    userPrompt: `${context}\n\n${userPrompt}`,
    playerName: game.players[playerIndex].name,
    parseResponse,
  });
}

// --- Player Actions ---

export function chooseChancellor(game, eligibleIndices) {
  const presidentIndex = game.presidentIndex;
  const eligible = eligibleIndices.map(i => `${game.players[i].name} (#${i})`).join(', ');

  return ask(game, presidentIndex,
    `You are President this round. Nominate a Chancellor from these eligible players: ${eligible}\n\nReply with ONLY the player number, like: 3`,
    (text) => {
      const numbers = [...text.matchAll(/(\d+)/g)].map(m => parseInt(m[1]));
      for (const idx of numbers) {
        if (eligibleIndices.includes(idx)) return idx;
      }
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

export function getDiscussionWithStance(game, playerIndex) {
  const president = game.players[game.presidentIndex].name;
  const chancellor = game.players[game.currentChancellorCandidate].name;

  const roundDiscussion = game.log
    .filter(e => e.type === 'discussion' && e.round === game.round)
    .map(e => `[${e.playerName}]: "${e.message}"`)
    .join('\n');

  const withThoughts = game.enableThoughts;

  const thoughtInstructions = withThoughts
    ? `\nFirst write THOUGHT: your private reasoning (not shared with others).
Then choose stance and message.\n`
    : '';

  const format = withThoughts
    ? `Format:
THOUGHT: your private reasoning (1 sentence)
STANCE: attack/defense/analysis/pass
MESSAGE: your statement (1-2 sentences, skip if PASS)`
    : `Format:
STANCE: attack/defense/analysis/pass
MESSAGE: your statement (1-2 sentences, skip if PASS)`;

  return ask(game, playerIndex,
    `${president} has nominated ${chancellor} as Chancellor.${roundDiscussion ? `\n\nDiscussion so far:\n${roundDiscussion}` : ''}
${thoughtInstructions}
Choose a STANCE and speak (or PASS if nothing to add):
- ATTACK: accuse someone specific
- DEFENSE: respond to accusations
- ANALYSIS: observations
- PASS: stay silent

${format}`,
    (text) => {
      const thoughtMatch = withThoughts ? text.match(/THOUGHT:\s*(.+?)(?=\nSTANCE:)/is) : null;
      const stanceMatch = text.match(/STANCE:\s*(attack|defense|analysis|pass)/i);
      const messageMatch = text.match(/MESSAGE:\s*(.+)/is);

      const stance = stanceMatch ? stanceMatch[1].toLowerCase() : 'analysis';
      const thought = thoughtMatch ? thoughtMatch[1].trim() : '';
      const message = stance === 'pass' ? 'PASS' :
        (messageMatch ? messageMatch[1].replace(/^["']|["']$/g, '').trim() : 'PASS');

      return { stance, message, thought };
    },
  );
}

export function getRebuttal(game, playerIndex) {
  const playerName = game.players[playerIndex].name;

  const roundDiscussion = game.log
    .filter(e => e.type === 'discussion' && e.round === game.round)
    .map(e => `[${e.playerName}]: "${e.message}"`)
    .join('\n');

  if (!roundDiscussion) return Promise.resolve({ message: 'PASS', thought: '' });

  const mentioned = roundDiscussion.toLowerCase().includes(playerName.toLowerCase());

  return ask(game, playerIndex,
    `The discussion this round:\n${roundDiscussion}\n\n${mentioned ? `Your name was mentioned. Respond briefly or PASS.` : `Respond if useful, otherwise PASS.`}

Reply with your response (1 sentence) or PASS.`,
    (text) => {
      const clean = text.replace(/^["']|["']$/g, '').replace(/^MESSAGE:\s*/i, '').trim();
      const message = clean.toUpperCase() === 'PASS' ? 'PASS' : clean;
      return { message, thought: '' };
    },
  );
}

export function getVote(game, playerIndex) {
  const president = game.players[game.presidentIndex].name;
  const chancellor = game.players[game.currentChancellorCandidate].name;

  const roundDiscussion = game.log
    .filter(e => e.type === 'discussion' && e.round === game.round)
    .map(e => `${e.playerName}: "${e.message}"`)
    .join('\n');

  return ask(game, playerIndex,
    `Time to vote on the government: President ${president} + Chancellor ${chancellor}.
${roundDiscussion ? `\nDiscussion:\n${roundDiscussion}\n` : ''}
Vote JA (yes) or NEIN (no). Consider your role and strategy.

Reply in this exact format:
VOTE: JA (or NEIN)
REASON: your brief reasoning`,
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
      instruction = `You must EXECUTE one player. They are permanently eliminated. If you kill the ${terms.hitler}, ${terms.liberal.toLowerCase()}s win.`;
      break;
    case 'peek':
      return { targetIndex: null };
  }

  const targetIndex = await ask(game, presidentIndex,
    `PRESIDENTIAL POWER: ${power.toUpperCase()}\n${instruction}\n\nEligible targets: ${eligible}\n\nReply with ONLY the player number.`,
    (text) => {
      const numbers = [...text.matchAll(/(\d+)/g)].map(m => parseInt(m[1]));
      for (const idx of numbers) {
        if (eligibleIndices.includes(idx)) return idx;
      }
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
