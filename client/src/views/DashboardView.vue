<template>
  <div class="dashboard">
    <div class="page-header">
      <h1>Games</h1>
      <div class="header-actions" v-if="!isStatic">
        <button
          v-if="unfinishedCount > 0"
          class="btn-danger btn-small"
          @click="cleanupUnfinished"
        >Clean up {{ unfinishedCount }} unfinished</button>
        <router-link to="/new" class="btn-primary">New Game</router-link>
      </div>
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

      <div class="pagination-bar" v-if="totalPages > 1">
        <button class="page-btn" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">&lt;</button>
        <button
          v-for="p in displayedPages" :key="p"
          class="page-btn" :class="{ active: p === currentPage, ellipsis: p === '...' }"
          :disabled="p === '...'"
          @click="p !== '...' && goToPage(p)"
        >{{ p }}</button>
        <button class="page-btn" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)">&gt;</button>
        <span class="page-info">{{ allGames.length }} games</span>
      </div>

      <div class="table-scroll">
      <table class="games-table">
        <thead>
          <tr>
            <th>Type</th>
            <th class="right">Good</th>
            <th></th>
            <th>Evil</th>
            <th>Players</th>
            <th>Rounds</th>
            <th>Tokens</th>
            <th>Date</th>
            <th v-if="!isStatic"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="g in filteredGames"
            :key="g.id"
            class="game-row"
            @click="$router.push(`/game/${g.id}`)"
          >
            <td class="type-cell">
              {{ gameTypeLabel(g.game_type) }}
              <span v-if="g.status === 'error'" class="error-badge">ERROR</span>
            </td>
            <td class="matchup-good-cell">
              <span :class="factionClass(g, 'good')">{{ factionModel(g, 'good') }}</span>
            </td>
            <td class="matchup-vs-cell">vs</td>
            <td class="matchup-evil-cell">
              <span :class="factionClass(g, 'evil')">{{ factionModel(g, 'evil') }}</span>
            </td>
            <td class="center">{{ g.player_count || g.players?.length || '?' }}</td>
            <td class="center">{{ g.rounds || '?' }}</td>
            <td class="tokens-cell">{{ g.tokens_input ? formatTokens(g.tokens_input + g.tokens_output) : '-' }}</td>
            <td class="date-cell">{{ formatDate(g.created_at) }}</td>
            <td v-if="!isStatic" class="action-cell">
              <button
                v-if="g.status === 'finished'"
                class="btn-save-small"
                :class="{ saved: g.saved }"
                @click.stop="toggleSave(g)"
                :title="g.saved ? 'Remove from showcase' : 'Save for showcase'"
              >{{ g.saved ? '★' : '☆' }}</button>
              <button
                class="btn-delete-small"
                @click.stop="deleteGame(g)"
                title="Delete game"
              >🗑</button>
            </td>
          </tr>
        </tbody>
      </table>
      </div>

      <div class="pagination-bar" v-if="totalPages > 1">
        <button class="page-btn" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">&lt;</button>
        <button
          v-for="p in displayedPages" :key="'b'+p"
          class="page-btn" :class="{ active: p === currentPage, ellipsis: p === '...' }"
          :disabled="p === '...'"
          @click="p !== '...' && goToPage(p)"
        >{{ p }}</button>
        <button class="page-btn" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)">&gt;</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { fetchGames, isStatic } from '../composables/useApi'
import { formatDate, formatTokens, shortModel } from '../utils/format'

const allGames = ref([])
const loading = ref(true)
const activeFilter = ref('all')
const currentPage = ref(1)
const PAGE_SIZE = 100

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

function factionLabel(g, side) {
  const type = g.game_type || 'secret-dictator'
  const labels = FACTION_LABELS[type] || FACTION_LABELS['secret-dictator']
  return side === 'good' ? labels.good : labels.evil
}

function factionModel(g, side) {
  const { goodModel, evilModel } = getModels(g)
  return shortModel(side === 'good' ? goodModel : evilModel)
}

function factionColorClass(g, side) {
  return side === 'good' ? 'model-good' : 'model-evil'
}

const gameTypeFilters = computed(() => {
  const counts = { all: allGames.value.length }
  for (const g of allGames.value) {
    const t = g.game_type || 'secret-dictator'
    counts[t] = (counts[t] || 0) + 1
  }
  const filters = [{ value: 'all', label: 'All', count: counts.all }]
  for (const [type, label] of Object.entries(GAME_TYPE_LABELS)) {
    if (counts[type]) filters.push({ value: type, label, count: counts[type] })
  }
  return filters
})

const typeFilteredGames = computed(() => {
  if (activeFilter.value === 'all') return allGames.value
  return allGames.value.filter(g => (g.game_type || 'secret-dictator') === activeFilter.value)
})

const totalPages = computed(() => Math.ceil(typeFilteredGames.value.length / PAGE_SIZE))

const filteredGames = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return typeFilteredGames.value.slice(start, start + PAGE_SIZE)
})

const displayedPages = computed(() => {
  const total = totalPages.value
  const current = currentPage.value
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = [1]
  if (current > 3) pages.push('...')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i)
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
})

function goToPage(p) {
  currentPage.value = Math.max(1, Math.min(p, totalPages.value))
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// Reset page when filter changes
watch(activeFilter, () => { currentPage.value = 1 })

const games = allGames // alias for template compatibility

const unfinishedCount = computed(() =>
  allGames.value.filter(g => g.status !== 'finished').length
)

async function toggleSave(g) {
  try {
    const res = await fetch(`/api/games/${g.id}/save`, { method: 'PUT' })
    if (res.ok) {
      const { saved } = await res.json()
      g.saved = saved
    }
  } catch {}
}

async function deleteGame(g) {
  if (!confirm(`Delete game ${g.id.slice(0, 8)}...?`)) return
  try {
    const res = await fetch(`/api/games/${g.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error || 'Failed to delete')
      return
    }
    allGames.value = allGames.value.filter(x => x.id !== g.id)
  } catch (e) {
    alert(e.message)
  }
}

async function cleanupUnfinished() {
  const count = unfinishedCount.value
  if (!confirm(`Delete ${count} unfinished game(s)?`)) return
  try {
    const res = await fetch('/api/games?status=unfinished', { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error || 'Failed to clean up')
      return
    }
    allGames.value = allGames.value.filter(g => g.status === 'finished')
  } catch (e) {
    alert(e.message)
  }
}

onMounted(async () => {
  try {
    allGames.value = await fetchGames(500)
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

.matchup-good-cell {
  text-align: right;
  font-size: 0.85rem;
  font-weight: 500;
  white-space: nowrap;
}
.matchup-evil-cell {
  text-align: left;
  font-size: 0.85rem;
  font-weight: 500;
  white-space: nowrap;
}
.matchup-vs-cell {
  text-align: center;
  color: var(--text2);
  font-size: 0.75rem;
  padding: 0 0.2rem !important;
  width: 1.5rem;
}
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

.header-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.btn-small {
  font-size: 0.8rem;
  padding: 0.3rem 0.6rem;
}

.btn-delete-small {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.1rem 0.3rem;
  opacity: 0.4;
  transition: opacity 0.15s;
  filter: grayscale(1);
}

.btn-delete-small:hover {
  opacity: 1;
  filter: none;
}

.btn-save-small {
  background: transparent;
  border: none;
  color: var(--text2);
  cursor: pointer;
  font-size: 1rem;
  padding: 0.1rem 0.3rem;
  opacity: 0.4;
  transition: opacity 0.15s, color 0.15s;
}
.btn-save-small.saved { opacity: 1; color: #e8a43a; }
.btn-save-small:hover { opacity: 1; color: #e8a43a; }

.action-cell {
  width: 60px;
  text-align: right;
  white-space: nowrap;
}
.action-cell button + button {
  margin-left: 0.3rem;
}

.pagination-bar {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin: 0.75rem 0;
}
.page-btn {
  min-width: 2rem;
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.15s;
}
.page-btn:hover:not(:disabled):not(.ellipsis) {
  border-color: var(--accent);
  color: var(--text);
}
.page-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.page-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
.page-btn.ellipsis {
  border: none;
  background: none;
  cursor: default;
}
.page-info {
  margin-left: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.error-badge {
  display: inline-block;
  margin-left: 0.4rem;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  vertical-align: middle;
}

tr:has(.error-badge) {
  opacity: 0.5;
}
</style>
