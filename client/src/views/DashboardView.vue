<template>
  <div class="dashboard">
    <div class="page-header">
      <h1>Games</h1>
      <router-link to="/new" class="btn-primary">New Game</router-link>
    </div>

    <div v-if="loading" class="loading">Loading games...</div>
    <div v-else-if="!games.length" class="empty-state">
      <p>No games yet.</p>
      <router-link to="/new" class="btn-primary">Start your first game</router-link>
    </div>
    <template v-else>
      <div class="filter-bar">
        <button
          v-for="f in gameTypeFilters"
          :key="f.value"
          class="filter-btn"
          :class="{ active: activeFilter === f.value }"
          @click="activeFilter = f.value"
        >{{ f.label }} ({{ f.count }})</button>
      </div>

      <table class="games-table">
        <thead>
          <tr>
            <th>Result</th>
            <th>Type</th>
            <th>Matchup</th>
            <th>Players</th>
            <th>Rounds</th>
            <th>Tokens</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="g in filteredGames"
            :key="g.id"
            class="game-row"
            @click="$router.push(`/game/${g.id}`)"
          >
            <td>
              <span class="winner-badge" :class="winnerClass(g)">{{ winnerText(g) }}</span>
            </td>
            <td class="type-cell">{{ gameTypeLabel(g.game_type) }}</td>
            <td class="matchup-cell">
              <span :class="factionClass(g, 'good')" v-html="factionHtml(g, 'good')"></span>
              <span class="matchup-vs">vs</span>
              <span :class="factionClass(g, 'evil')" v-html="factionHtml(g, 'evil')"></span>
            </td>
            <td class="center">{{ g.player_count || g.players?.length || '?' }}</td>
            <td class="center">{{ g.rounds || '?' }}</td>
            <td class="tokens-cell">{{ g.tokens_input ? formatTokens(g.tokens_input + g.tokens_output) : '-' }}</td>
            <td class="date-cell">{{ formatDate(g.created_at) }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { fetchGames } from '../composables/useApi'
import { formatDate, formatTokens, shortModel } from '../utils/format'

const games = ref([])
const loading = ref(true)
const activeFilter = ref('all')

const FACTION_LABELS = {
  'secret-dictator': { good: 'Liberal', evil: 'Fascist' },
  'werewolf': { good: 'Villager', evil: 'Werewolf' },
  'two-rooms': { good: 'Blue', evil: 'Red' },
}

const WINNER_LABELS = {
  liberal: 'Liberal Win',
  fascist: 'Fascist Win',
  villager: 'Villager Win',
  werewolf: 'Werewolf Win',
  blue: 'Blue Team Win',
  red: 'Red Team Win',
  draw: 'Draw',
}

const GAME_TYPE_LABELS = {
  'secret-dictator': 'Secret Dictator',
  'werewolf': 'Werewolf',
  'two-rooms': 'Two Rooms',
}

function gameTypeLabel(type) {
  return GAME_TYPE_LABELS[type] || type || 'Secret Dictator'
}

function winnerClass(g) {
  if (g.status === 'running') return 'winner-running'
  if (!g.winner || g.winner === 'draw') return 'winner-draw'
  return isWinnerGood(g) ? 'winner-good' : 'winner-evil'
}

function winnerText(g) {
  if (g.status === 'running') return 'Running...'
  if (!g.winner || g.winner === 'draw') return 'Draw'
  const { goodModel, evilModel } = getModels(g)
  const isGood = ['liberal', 'villager', 'blue'].includes(g.winner)
  return shortModel(isGood ? goodModel : evilModel)
}

function getModels(g) {
  const players = g.players || []
  const goodParties = ['liberal', 'villager', 'blue']
  const evilParties = ['fascist', 'werewolf', 'red']

  let goodModel = null
  let evilModel = null

  for (const p of players) {
    if (goodParties.includes(p.party || p.team) && !goodModel) goodModel = p.model
    if (evilParties.includes(p.party || p.team) && !evilModel) evilModel = p.model
  }

  if (!goodModel) goodModel = g.model_good || g.model_liberal || g.model
  if (!evilModel) evilModel = g.model_evil || g.model_fascist || g.model

  return { goodModel, evilModel }
}

function isWinnerGood(g) {
  return ['liberal', 'villager', 'blue'].includes(g.winner)
}

function factionClass(g, side) {
  if (!g.winner || g.winner === 'draw') return `matchup-${side}`
  const won = (side === 'good' && isWinnerGood(g)) || (side === 'evil' && !isWinnerGood(g))
  return `matchup-${side}${won ? ' matchup-winner' : ' matchup-loser'}`
}

function factionHtml(g, side) {
  const type = g.game_type || 'secret-dictator'
  const labels = FACTION_LABELS[type] || FACTION_LABELS['secret-dictator']
  const { goodModel, evilModel } = getModels(g)
  const label = side === 'good' ? labels.good : labels.evil
  const model = side === 'good' ? goodModel : evilModel
  return `${label} <span class="matchup-model">${shortModel(model)}</span>`
}

const gameTypeFilters = computed(() => {
  const counts = { all: games.value.length }
  for (const g of games.value) {
    const t = g.game_type || 'secret-dictator'
    counts[t] = (counts[t] || 0) + 1
  }
  const filters = [{ value: 'all', label: 'All', count: counts.all }]
  for (const [type, label] of Object.entries(GAME_TYPE_LABELS)) {
    if (counts[type]) filters.push({ value: type, label, count: counts[type] })
  }
  return filters
})

const filteredGames = computed(() => {
  if (activeFilter.value === 'all') return games.value
  return games.value.filter(g => (g.game_type || 'secret-dictator') === activeFilter.value)
})

onMounted(async () => {
  try {
    games.value = await fetchGames()
  } catch {}
  loading.value = false
})
</script>

<style>
.filter-bar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.filter-btn {
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.85rem;
}
.filter-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.games-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.games-table th {
  text-align: left;
  padding: 0.6rem 0.8rem;
  border-bottom: 2px solid var(--border);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.games-table td {
  padding: 0.6rem 0.8rem;
  border-bottom: 1px solid var(--border);
}
.game-row {
  cursor: pointer;
  transition: background 0.15s;
}
.game-row:hover {
  background: var(--bg-secondary);
}
.center { text-align: center; }
.tokens-cell { font-family: monospace; font-size: 0.8rem; text-align: right; }
.date-cell { color: var(--text-secondary); font-size: 0.85rem; white-space: nowrap; }
.type-cell { font-size: 0.85rem; }

.matchup-cell { font-size: 0.85rem; white-space: nowrap; }
.matchup-vs { color: var(--text-secondary); margin: 0 0.4rem; font-size: 0.8rem; }
.matchup-good, .matchup-evil {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 3px;
  font-size: 0.8rem;
}
.matchup-good { color: var(--liberal); }
.matchup-evil { color: var(--fascist); }
.matchup-model { color: var(--text-secondary); font-family: monospace; font-size: 0.75rem; }
.matchup-winner.matchup-good { background: rgba(59, 130, 246, 0.15); font-weight: 700; }
.matchup-winner.matchup-evil { background: rgba(239, 68, 68, 0.15); font-weight: 700; }
.matchup-loser { opacity: 0.5; }

.winner-badge {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 3px;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}
.winner-good { background: #2d5a27; color: #9eff8a; }
.winner-evil { background: #5a2727; color: #ff8a8a; }
.winner-running { background: #4a4a1a; color: #e8e87a; }
.winner-draw { background: #3a3a3a; color: #aaa; }
</style>
