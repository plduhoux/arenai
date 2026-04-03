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
      <!-- Filters -->
      <div class="filters-row">
        <div class="filter-bar">
          <button
            v-for="f in gameTypeFilters"
            :key="f.value"
            class="filter-btn"
            :class="{ active: activeFilter === f.value }"
            @click="activeFilter = f.value"
          >{{ f.label }} ({{ f.count }})</button>

          <div class="model-filter-wrap" @click.stop>
            <button class="filter-btn model-filter-btn" :class="{ active: selectedGoodModels.size > 0 }" @click="goodFilterOpen = !goodFilterOpen; evilFilterOpen = false">
              Good{{ selectedGoodModels.size > 0 ? ` (${selectedGoodModels.size})` : '' }}
            </button>
            <div v-if="goodFilterOpen" class="model-filter-popover">
              <label v-for="m in availableGoodModels" :key="m" class="model-filter-item" @click.prevent="toggleGoodModel(m)">
                <input type="checkbox" :checked="selectedGoodModels.has(m)" tabindex="-1" />
                <span>{{ shortModel(m) }}</span>
              </label>
            </div>
          </div>

          <div class="model-filter-wrap" @click.stop>
            <button class="filter-btn model-filter-btn" :class="{ active: selectedEvilModels.size > 0 }" @click="evilFilterOpen = !evilFilterOpen; goodFilterOpen = false">
              Evil{{ selectedEvilModels.size > 0 ? ` (${selectedEvilModels.size})` : '' }}
            </button>
            <div v-if="evilFilterOpen" class="model-filter-popover">
              <label v-for="m in availableEvilModels" :key="m" class="model-filter-item" @click.prevent="toggleEvilModel(m)">
                <input type="checkbox" :checked="selectedEvilModels.has(m)" tabindex="-1" />
                <span>{{ shortModel(m) }}</span>
              </label>
            </div>
          </div>
        </div>

        <div class="filter-right">
          <button
            v-if="hasActiveFilters"
            class="filter-btn clear-btn"
            @click="clearAllFilters"
          >Clear filters</button>
          <span class="filter-info">{{ modelFilteredGames.length }} games</span>
          <button
            v-if="!isStatic && unsavedFilteredCount > 0"
            class="btn-small btn-star-all"
            @click="starAllFiltered"
          >★ Star all ({{ unsavedFilteredCount }})</button>
        </div>
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
        <span class="page-info">{{ modelFilteredGames.length }} games</span>
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
            v-for="g in paginatedGames"
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

const STORAGE_KEY = 'arenai-dashboard-filters'

function loadFilters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch { return {} }
}

function saveFilters() {
  const data = {
    activeFilter: activeFilter.value,
    goodModels: [...selectedGoodModels.value],
    evilModels: [...selectedEvilModels.value],
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

const saved = loadFilters()
const allGames = ref([])
const loading = ref(true)
const activeFilter = ref(saved.activeFilter || 'all')
const selectedGoodModels = ref(new Set(saved.goodModels || []))
const selectedEvilModels = ref(new Set(saved.evilModels || []))
const goodFilterOpen = ref(false)
const evilFilterOpen = ref(false)
const currentPage = ref(1)
const PAGE_SIZE = 100

function toggleGoodModel(m) {
  const s = selectedGoodModels.value
  if (s.has(m)) s.delete(m); else s.add(m)
  selectedGoodModels.value = new Set(s)
  saveFilters()
}
function toggleEvilModel(m) {
  const s = selectedEvilModels.value
  if (s.has(m)) s.delete(m); else s.add(m)
  selectedEvilModels.value = new Set(s)
  saveFilters()
}
function clearAllFilters() {
  activeFilter.value = 'all'
  selectedGoodModels.value = new Set()
  selectedEvilModels.value = new Set()
  saveFilters()
}

// Close popovers on outside click
if (typeof document !== 'undefined') {
  document.addEventListener('click', () => {
    goodFilterOpen.value = false
    evilFilterOpen.value = false
  })
}

const FACTION_LABELS = {
  'secret-dictator': { good: 'Liberal', evil: 'Fascist' },
  'werewolf': { good: 'Villager', evil: 'Werewolf' },
  'two-rooms': { good: 'Blue', evil: 'Red' },
  'undercover': { good: 'Civilian', evil: 'Undercover' },
}

const WINNER_LABELS = {
  liberal: 'Liberal Win',
  fascist: 'Fascist Win',
  villager: 'Villager Win',
  werewolf: 'Werewolf Win',
  blue: 'Blue Team Win',
  red: 'Red Team Win',
  civilian: 'Civilian Win',
  undercover: 'Undercover Win',
  draw: 'Draw',
}

const GAME_TYPE_LABELS = {
  'secret-dictator': 'Secret Dictator',
  'werewolf': 'Werewolf',
  'two-rooms': 'Two Rooms',
  'undercover': 'Undercover',
}

function gameTypeLabel(type) {
  return GAME_TYPE_LABELS[type] || type || 'Secret Dictator'
}

function getModels(g) {
  const players = g.players || []
  const goodParties = ['liberal', 'villager', 'blue', 'civilian']
  const evilParties = ['fascist', 'werewolf', 'red', 'undercover']

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
  return ['liberal', 'villager', 'blue', 'civilian'].includes(g.winner)
}

function factionClass(g, side) {
  if (!g.winner || g.winner === 'draw') return `matchup-${side}`
  const won = (side === 'good' && isWinnerGood(g)) || (side === 'evil' && !isWinnerGood(g))
  return `matchup-${side}${won ? ' matchup-winner' : ' matchup-loser'}`
}

function factionModel(g, side) {
  const { goodModel, evilModel } = getModels(g)
  return shortModel(side === 'good' ? goodModel : evilModel)
}

// --- Filters ---

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

// Available models for filters (based on type-filtered games)
const availableGoodModels = computed(() => {
  const models = new Set()
  for (const g of typeFilteredGames.value) {
    const { goodModel } = getModels(g)
    if (goodModel) models.add(goodModel)
  }
  return [...models].sort()
})

const availableEvilModels = computed(() => {
  const models = new Set()
  for (const g of typeFilteredGames.value) {
    const { evilModel } = getModels(g)
    if (evilModel) models.add(evilModel)
  }
  return [...models].sort()
})

const modelFilteredGames = computed(() => {
  let games = typeFilteredGames.value
  if (selectedGoodModels.value.size > 0) {
    games = games.filter(g => {
      const { goodModel } = getModels(g)
      return selectedGoodModels.value.has(goodModel)
    })
  }
  if (selectedEvilModels.value.size > 0) {
    games = games.filter(g => {
      const { evilModel } = getModels(g)
      return selectedEvilModels.value.has(evilModel)
    })
  }
  return games
})

const totalPages = computed(() => Math.ceil(modelFilteredGames.value.length / PAGE_SIZE))

const paginatedGames = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return modelFilteredGames.value.slice(start, start + PAGE_SIZE)
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

// Reset page when any filter changes, persist filters
watch([activeFilter, selectedGoodModels, selectedEvilModels], () => {
  currentPage.value = 1
  saveFilters()
})

const games = allGames

const unfinishedCount = computed(() =>
  allGames.value.filter(g => g.status !== 'finished').length
)

const hasActiveFilters = computed(() =>
  activeFilter.value !== 'all' || selectedGoodModels.value.size > 0 || selectedEvilModels.value.size > 0
)

const unsavedFilteredCount = computed(() =>
  modelFilteredGames.value.filter(g => g.status === 'finished' && !g.saved).length
)

// --- Actions ---

async function toggleSave(g) {
  try {
    const res = await fetch(`/api/games/${g.id}/save`, { method: 'PUT' })
    if (res.ok) {
      const { saved } = await res.json()
      g.saved = saved
    }
  } catch {}
}

async function starAllFiltered() {
  const ids = modelFilteredGames.value
    .filter(g => g.status === 'finished' && !g.saved)
    .map(g => g.id)
  if (!ids.length) return
  try {
    const res = await fetch('/api/games/bulk-save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    if (res.ok) {
      const { count } = await res.json()
      // Update local state
      for (const g of allGames.value) {
        if (ids.includes(g.id)) g.saved = 1
      }
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
.filters-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  gap: 1rem;
}
.filter-bar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
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

.filter-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.clear-btn {
  font-size: 0.75rem;
  padding: 0.3rem 0.6rem;
  opacity: 0.7;
}
.clear-btn:hover {
  opacity: 1;
}

.model-filter-wrap {
  position: relative;
}
.model-filter-btn {
  font-size: 0.78rem;
}
.model-filter-popover {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 50;
  margin-top: 0.3rem;
  background: var(--bg, #1a1a2e);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.5rem;
  min-width: 180px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.model-filter-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.82rem;
  color: var(--text);
  user-select: none;
}
.model-filter-item:hover {
  background: var(--bg-secondary);
}
.model-filter-item input[type="checkbox"] {
  accent-color: var(--accent);
  pointer-events: none;
}
.btn-star-all {
  background: rgba(232, 164, 58, 0.15);
  border: 1px solid rgba(232, 164, 58, 0.4);
  color: #e8a43a;
  cursor: pointer;
  border-radius: 4px;
  font-weight: 600;
  transition: all 0.15s;
}
.btn-star-all:hover {
  background: rgba(232, 164, 58, 0.3);
}
.filter-info {
  font-size: 0.8rem;
  color: var(--text-secondary);
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
.matchup-good, .matchup-evil {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 3px;
  font-size: 0.8rem;
}
.matchup-good { color: var(--liberal); }
.matchup-evil { color: var(--fascist); }
.matchup-winner.matchup-good { background: rgba(59, 130, 246, 0.15); font-weight: 700; }
.matchup-winner.matchup-evil { background: rgba(239, 68, 68, 0.15); font-weight: 700; }
.matchup-loser { opacity: 0.5; }

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
