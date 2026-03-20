#!/usr/bin/env node
/**
 * ArenAI - Multi-number detection in player responses
 * 
 * Scans all game sessions and detects responses where multiple parsable numbers
 * appear when only a single number is expected (votes, target selections, etc.)
 * Then checks whether the parser was misled (picked the wrong number).
 * 
 * The parser logic (in all games) is:
 *   [...text.matchAll(/(\d+)/g)] → first valid player index wins
 * 
 * Usage: node scripts/check-multi-numbers.js [--verbose]
 */

import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'games.db');
const VERBOSE = process.argv.includes('--verbose');

const db = new Database(DB_PATH, { readonly: true });

// Patterns that indicate "reply with a single number"
const SINGLE_NUMBER_PATTERNS = [
  /reply:?\s*player number/i,
  /reply with the player number/i,
  /reply with (?:the )?number/i,
  /choose.*reply.*number/i,
];

// Extract valid player indices from the prompt (e.g. "Alice (#0), Bruno (#1)")
function extractValidIndices(prompt) {
  const matches = [...prompt.matchAll(/#(\d+)/g)];
  return matches.map(m => parseInt(m[1]));
}

function isSingleNumberPrompt(content) {
  return SINGLE_NUMBER_PATTERNS.some(p => p.test(content));
}

function extractNumbers(text) {
  return [...text.matchAll(/(\d+)/g)].map(m => parseInt(m[1]));
}

function detectPromptType(content) {
  if (/VOTE:.*Eliminate/i.test(content)) return 'vote';
  if (/MAYOR VOTE/i.test(content)) return 'mayor_vote';
  if (/RUNOFF VOTE/i.test(content)) return 'runoff_vote';
  if (/Final decision.*victim/i.test(content)) return 'wolf_target';
  if (/SEER.*inspect/i.test(content)) return 'seer_inspect';
  if (/WITCH.*kill/i.test(content)) return 'witch_kill';
  if (/successor/i.test(content)) return 'mayor_successor';
  if (/Choose who should be Mayor/i.test(content)) return 'mayor_vote';
  if (/player number/i.test(content)) return 'generic_pick';
  return 'unknown';
}

/**
 * Simulate what the parser does: first valid number in the text.
 */
function parserPick(text, validIndices) {
  const nums = extractNumbers(text);
  for (const n of nums) {
    if (validIndices.includes(n)) return n;
  }
  return null; // fallback to random (shouldn't happen in our cases)
}

/**
 * Try to determine the LLM's actual intended answer.
 * Heuristics (in priority order):
 * 
 * 1. A valid number alone on its own line (strongest signal)
 * 2. A number after a clear "I vote for" / "my vote:" / "I choose" pattern
 * 3. The last valid number in the text (weakest - LLMs tend to reason first, answer last)
 */
function inferIntendedAnswer(text, validIndices) {
  const reasons = [];

  // H1: Number alone on its own line (possibly with whitespace)
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    const match = trimmed.match(/^(\d+)\.?$/);
    if (match) {
      const n = parseInt(match[1]);
      if (validIndices.includes(n)) {
        reasons.push({ value: n, confidence: 'high', reason: `standalone number on line ${i + 1}: "${trimmed}"` });
        break;
      }
    }
  }

  // H2: Explicit answer patterns
  const answerPatterns = [
    /(?:I vote|my vote|I choose|I'll vote|voting for|I select|I pick|my choice)[:\s]+(?:#?(\d+)|.*?#(\d+))/i,
    /(?:VOTE|TARGET|PICK|CHOICE)[:\s]+#?(\d+)/i,
    /^(\d+)\s*$/m,  // number alone on a line
  ];
  for (const pat of answerPatterns) {
    const m = text.match(pat);
    if (m) {
      const n = parseInt(m[1] || m[2]);
      if (validIndices.includes(n) && !reasons.some(r => r.value === n && r.confidence === 'high')) {
        reasons.push({ value: n, confidence: 'medium', reason: `answer pattern: "${m[0].trim().slice(0, 60)}"` });
      }
    }
  }

  // H3: Last valid number in text
  const allNums = extractNumbers(text);
  for (let i = allNums.length - 1; i >= 0; i--) {
    if (validIndices.includes(allNums[i])) {
      reasons.push({ value: allNums[i], confidence: 'low', reason: `last valid number in text` });
      break;
    }
  }

  // Pick the highest-confidence one
  if (reasons.length === 0) return { value: null, confidence: 'none', reason: 'no answer detected' };
  return reasons[0];
}

// --- Verify against actual game logs ---

function getActualChoice(gameId, playerKey, promptType) {
  // Look in game_logs for the actual recorded action
  const playerName = playerKey.split(':')[2];
  const logs = db.prepare(`
    SELECT data FROM game_logs 
    WHERE game_id = ? AND type IN ('vote', 'mayor_vote', 'wolf_action', 'seer_action', 'elimination')
    ORDER BY seq
  `).all(gameId);

  for (const log of logs) {
    const d = JSON.parse(log.data);
    if (d.player === playerName && d.target) {
      // Find the player index for the target name
      const game = db.prepare('SELECT players FROM games WHERE id = ?').get(gameId);
      const players = JSON.parse(game.players);
      const targetIdx = players.findIndex(p => p.name === d.target);
      if (targetIdx >= 0) return targetIdx;
    }
    if (d.voter === playerName && d.pick) {
      const game = db.prepare('SELECT players FROM games WHERE id = ?').get(gameId);
      const players = JSON.parse(game.players);
      const targetIdx = players.findIndex(p => p.name === d.pick);
      if (targetIdx >= 0) return targetIdx;
    }
  }
  return null;
}

// --- Main ---

const games = db.prepare(`
  SELECT id, game_type, model_good, model_evil, session_stats, created_at
  FROM games 
  WHERE session_stats IS NOT NULL AND status = 'finished'
  ORDER BY created_at
`).all();

console.log(`Scanning ${games.length} finished games with session data...\n`);

let totalPrompts = 0;
let multiNumberCount = 0;
let misledCount = 0;
let uncertainCount = 0;
const issuesByModel = {};
const issuesByType = {};

for (const game of games) {
  let sessions;
  try {
    sessions = JSON.parse(game.session_stats);
  } catch { continue; }

  for (const [playerKey, session] of Object.entries(sessions)) {
    const msgs = session.messages || [];

    for (let i = 0; i < msgs.length - 1; i++) {
      const userMsg = msgs[i];
      const assistantMsg = msgs[i + 1];

      if (userMsg.role !== 'user' || assistantMsg.role !== 'assistant') continue;
      if (!isSingleNumberPrompt(userMsg.content)) continue;

      totalPrompts++;

      const validIndices = extractValidIndices(userMsg.content);
      const responseText = assistantMsg.content;
      const allNumbers = extractNumbers(responseText);
      const validNumbers = [...new Set(allNumbers.filter(n => validIndices.includes(n)))];

      if (validNumbers.length <= 1) continue;

      multiNumberCount++;

      const promptType = detectPromptType(userMsg.content);
      const playerIndex = parseInt(playerKey.split(':')[1]);
      let playerModel = 'unknown';
      try {
        const players = JSON.parse(
          db.prepare('SELECT players FROM games WHERE id = ?').get(game.id).players
        );
        playerModel = players[playerIndex]?.model || game.model_good || 'unknown';
      } catch {
        playerModel = game.model_good || game.model_evil || 'unknown';
      }

      const picked = parserPick(responseText, validIndices);
      const intended = inferIntendedAnswer(responseText, validIndices);
      const misled = intended.value !== null && intended.value !== picked;

      if (misled) misledCount++;
      else if (intended.confidence === 'low') uncertainCount++;

      issuesByModel[playerModel] = (issuesByModel[playerModel] || 0) + 1;
      issuesByType[promptType] = (issuesByType[promptType] || 0) + 1;

      // Get player names for readability
      let playerNames = {};
      try {
        const players = JSON.parse(
          db.prepare('SELECT players FROM games WHERE id = ?').get(game.id).players
        );
        for (const p of players) playerNames[players.indexOf(p)] = p.name;
      } catch {}

      const status = misled ? '!! MISLED' : (intended.confidence === 'low' ? '?  UNCERTAIN' : 'OK CORRECT');

      console.log(`${status} | ${game.id.slice(0, 8)} ${game.game_type} | ${playerKey}`);
      console.log(`  Parser picked: #${picked} (${playerNames[picked] || '?'}) | Intended: #${intended.value} (${playerNames[intended.value] || '?'}) [${intended.confidence}]`);
      console.log(`  Reason: ${intended.reason}`);
      console.log(`  Valid indices in response: [${validNumbers.map(n => `#${n} ${playerNames[n] || ''}`).join(', ')}]`);
      if (VERBOSE) {
        console.log(`  --- Full response ---`);
        console.log(`  ${responseText.replace(/\n/g, '\n  ')}`);
      }
      console.log();
    }
  }
}

// --- Summary ---

console.log('='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
console.log(`Games scanned:                    ${games.length}`);
console.log(`Single-number prompts:            ${totalPrompts}`);
console.log(`Responses with multiple numbers:  ${multiNumberCount} (${totalPrompts > 0 ? ((multiNumberCount / totalPrompts) * 100).toFixed(1) : 0}%)`);
console.log();
console.log(`  Parser MISLED (wrong pick):     ${misledCount}`);
console.log(`  Parser OK (correct pick):       ${multiNumberCount - misledCount - uncertainCount}`);
console.log(`  Uncertain (low confidence):     ${uncertainCount}`);
console.log();

if (Object.keys(issuesByModel).length) {
  console.log('Multi-number responses by model:');
  for (const [model, count] of Object.entries(issuesByModel).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${model}: ${count}`);
  }
  console.log();
}

if (Object.keys(issuesByType).length) {
  console.log('Multi-number responses by prompt type:');
  for (const [type, count] of Object.entries(issuesByType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
}

db.close();
